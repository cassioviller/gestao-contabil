import { Router } from "express";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import {
  arquivos,
  checklistItens,
  clientes,
  competencias,
  contas,
  db,
  gerarToken,
  hashToken,
  protocolos,
  tiposObrigacao,
  usuarios,
} from "@workspace/db";
import { competenciaCurta, formatarData, linkWhatsapp, montarAviso } from "@workspace/dominio";
import {
  AtualizarStatusChecklistParams,
  AtualizarStatusChecklistBody,
  AtualizarVencimentoChecklistParams,
  AtualizarVencimentoChecklistBody,
  EnviarGuiaBody,
  EnviarGuiaParams,
  ListarProtocolosItemParams,
} from "@workspace/api-zod";
import { HttpError } from "../lib/http";
import { auditar } from "../lib/auditoria";
import { contaDaRequisicao, sessaoDaRequisicao } from "../middlewares/autenticacao";
import { criarAviso, destinoDoCliente } from "../servicos/avisos";

const router = Router();

/** Validade do link do protocolo. */
const VALIDADE_PROTOCOLO_DIAS = 7;

/** Projeção do item, usada aqui e na listagem da competência. */
export const camposChecklist = {
  id: checklistItens.id,
  status: checklistItens.status,
  vencimento: checklistItens.vencimento,
  observacao: checklistItens.observacao,
  clienteId: clientes.id,
  codigo: clientes.codigo,
  cliente: clientes.razaoSocial,
  tipoObrigacaoId: tiposObrigacao.id,
  obrigacao: tiposObrigacao.nome,
  ordem: tiposObrigacao.ordem,
  // Guias anexadas e o último envio: é o que a grade mostra sem abrir o item.
  // Nome qualificado por extenso: `${checklistItens.id}` aqui viraria só `"id"`.
  anexos: sql<number>`(select count(*) from arquivos a where a.entidade = 'checklist_item' and a.entidade_id = checklist_itens.id and a.confirmado)::int`,
  enviadoEm: checklistItens.enviadoEm,
  visualizadoEm: sql<Date | null>`(select max(p.visualizado_em) from protocolos p where p.checklist_item_id = checklist_itens.id)`,
};

function buscarItem(id: number, contaId: number) {
  return db
    .select(camposChecklist)
    .from(checklistItens)
    .innerJoin(clientes, eq(clientes.id, checklistItens.clienteId))
    .innerJoin(tiposObrigacao, eq(tiposObrigacao.id, checklistItens.tipoObrigacaoId))
    .where(and(eq(checklistItens.id, id), eq(checklistItens.contaId, contaId)));
}

function urlPublica(): string {
  return (process.env.URL_PUBLICA ?? "http://localhost:5173").replace(/\/+$/, "");
}

// PATCH /api/checklist/:id/status
router.patch("/:id/status", async (req, res) => {
  const contaId = contaDaRequisicao(req);
  const sessao = sessaoDaRequisicao(req);
  const { id } = AtualizarStatusChecklistParams.parse(req.params);
  const { status } = AtualizarStatusChecklistBody.parse(req.body);

  const [anterior] = await db
    .select({ status: checklistItens.status, enviadoEm: checklistItens.enviadoEm })
    .from(checklistItens)
    .where(and(eq(checklistItens.id, id), eq(checklistItens.contaId, contaId)));
  if (!anterior) throw new HttpError(404, "Item do checklist não encontrado.");

  await db
    .update(checklistItens)
    .set({
      status,
      atualizadoEm: new Date(),
      atualizadoPor: sessao.usuarioId,
      // Marcar "enviado" à mão também conta como envio (sem protocolo).
      enviadoEm: status === "enviado" ? (anterior.enviadoEm ?? new Date()) : anterior.enviadoEm,
    })
    .where(and(eq(checklistItens.id, id), eq(checklistItens.contaId, contaId)));

  if (anterior.status !== status) {
    await auditar(req, {
      acao: "status_item",
      entidade: "checklist_item",
      entidadeId: id,
      campo: "status",
      de: anterior.status,
      para: status,
    });
  }

  const [item] = await buscarItem(id, contaId);
  res.json(item);
});

// PATCH /api/checklist/:id/vencimento
router.patch("/:id/vencimento", async (req, res) => {
  const contaId = contaDaRequisicao(req);
  const sessao = sessaoDaRequisicao(req);
  const { id } = AtualizarVencimentoChecklistParams.parse(req.params);
  const { vencimento } = AtualizarVencimentoChecklistBody.parse(req.body);

  const [alterado] = await db
    .update(checklistItens)
    .set({
      vencimento: vencimento || null,
      atualizadoEm: new Date(),
      atualizadoPor: sessao.usuarioId,
    })
    .where(and(eq(checklistItens.id, id), eq(checklistItens.contaId, contaId)))
    .returning({ id: checklistItens.id });
  if (!alterado) throw new HttpError(404, "Item do checklist não encontrado.");

  const [item] = await buscarItem(id, contaId);
  res.json(item);
});

const camposProtocolo = {
  id: protocolos.id,
  canal: protocolos.canal,
  enviadoEm: protocolos.enviadoEm,
  expiraEm: protocolos.expiraEm,
  visualizadoEm: protocolos.visualizadoEm,
  cienteEm: protocolos.cienteEm,
  enviadoPor: sql<string | null>`coalesce(${usuarios.nome}, ${usuarios.login})`,
};

// GET /api/checklist/:id/protocolos
router.get("/:id/protocolos", async (req, res) => {
  const contaId = contaDaRequisicao(req);
  const { id } = ListarProtocolosItemParams.parse(req.params);
  const lista = await db
    .select(camposProtocolo)
    .from(protocolos)
    .leftJoin(usuarios, eq(usuarios.id, protocolos.enviadoPor))
    .where(and(eq(protocolos.checklistItemId, id), eq(protocolos.contaId, contaId)))
    .orderBy(desc(protocolos.id));
  res.json(lista.map((p) => ({ ...p, link: null })));
});

/**
 * POST /api/checklist/:id/enviar — a guia anexada vai ao cliente com um link
 * de protocolo (token de 256 bits, guardado como hash, válido por 7 dias). O
 * item avança para `enviado` no envio; a visualização fica registrada quando
 * o cliente abre o link.
 */
router.post("/:id/enviar", async (req, res) => {
  const contaId = contaDaRequisicao(req);
  const sessao = sessaoDaRequisicao(req);
  const { id } = EnviarGuiaParams.parse(req.params);
  const { canal, mensagem } = EnviarGuiaBody.parse(req.body);

  const [item] = await db
    .select({
      id: checklistItens.id,
      status: checklistItens.status,
      vencimento: checklistItens.vencimento,
      clienteId: checklistItens.clienteId,
      cliente: clientes.razaoSocial,
      obrigacao: tiposObrigacao.nome,
      ano: competencias.ano,
      mes: competencias.mes,
      escritorio: contas.nome,
      contato: contas.telefone,
    })
    .from(checklistItens)
    .innerJoin(clientes, eq(clientes.id, checklistItens.clienteId))
    .innerJoin(tiposObrigacao, eq(tiposObrigacao.id, checklistItens.tipoObrigacaoId))
    .innerJoin(competencias, eq(competencias.id, checklistItens.competenciaId))
    .innerJoin(contas, eq(contas.id, checklistItens.contaId))
    .where(and(eq(checklistItens.id, id), eq(checklistItens.contaId, contaId)));
  if (!item) throw new HttpError(404, "Item do checklist não encontrado.");

  const anexos = await db
    .select({ id: arquivos.id })
    .from(arquivos)
    .where(
      and(
        eq(arquivos.contaId, contaId),
        eq(arquivos.entidade, "checklist_item"),
        eq(arquivos.entidadeId, id),
        eq(arquivos.confirmado, true),
      ),
    )
    .orderBy(asc(arquivos.id));
  if (!anexos.length) {
    throw new HttpError(400, "Anexe a guia antes de enviar.", undefined, "sem_arquivo");
  }

  const destino = await destinoDoCliente(contaId, item.clienteId, canal);
  if (!destino) throw new HttpError(404, "Cliente não encontrado.");
  if (canal !== "portal" && !destino.destino) {
    throw new HttpError(
      400,
      canal === "email"
        ? "O cliente não tem e-mail cadastrado."
        : "O cliente não tem WhatsApp cadastrado.",
      undefined,
      "sem_destino",
    );
  }

  const token = gerarToken();
  const expiraEm = new Date(Date.now() + VALIDADE_PROTOCOLO_DIAS * 24 * 60 * 60 * 1000);
  const link = `${urlPublica()}/api/protocolo/${token}`;
  const msg = montarAviso("guia_disponivel", {
    cliente: item.cliente,
    escritorio: item.escritorio,
    contato: item.contato ?? undefined,
    obrigacao: item.obrigacao,
    competencia: competenciaCurta(item.ano, item.mes),
    vencimento: item.vencimento ? formatarData(item.vencimento) : undefined,
    link,
  });
  const corpo = mensagem?.trim() ? `${mensagem.trim()}\n\n${msg.texto}` : msg.texto;

  const protocoloId = await db.transaction(async (tx) => {
    const [p] = await tx
      .insert(protocolos)
      .values({
        contaId,
        clienteId: item.clienteId,
        checklistItemId: id,
        arquivoId: anexos[anexos.length - 1].id,
        canal,
        token: hashToken(token),
        expiraEm,
        enviadoPor: sessao.usuarioId,
      })
      .returning({ id: protocolos.id });
    await criarAviso(tx, {
      contaId,
      clienteId: item.clienteId,
      canal,
      destino: destino.destino,
      modelo: "guia_disponivel",
      assunto: msg.assunto,
      corpo,
      referenciaEntidade: "protocolo",
      referenciaId: p.id,
    });
    await tx
      .update(checklistItens)
      .set({
        status: "enviado",
        enviadoEm: new Date(),
        atualizadoEm: new Date(),
        atualizadoPor: sessao.usuarioId,
      })
      .where(eq(checklistItens.id, id));
    if (item.status !== "enviado") {
      await auditar(
        req,
        {
          acao: "status_item",
          entidade: "checklist_item",
          entidadeId: id,
          campo: "status",
          de: item.status,
          para: "enviado",
        },
        tx,
      );
    }
    await auditar(
      req,
      { acao: "enviar_guia", entidade: "checklist_item", entidadeId: id, para: canal },
      tx,
    );
    return p.id;
  });

  const [atualizado] = await buscarItem(id, contaId);
  const [protocolo] = await db
    .select(camposProtocolo)
    .from(protocolos)
    .leftJoin(usuarios, eq(usuarios.id, protocolos.enviadoPor))
    .where(eq(protocolos.id, protocoloId));
  res.json({
    item: atualizado,
    protocolo: { ...protocolo, link },
    linkWhatsapp:
      canal === "whatsapp" && destino.destino ? linkWhatsapp(destino.destino, corpo) : null,
  });
});

export default router;
