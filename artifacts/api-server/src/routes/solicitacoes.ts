import { Router } from "express";
import { and, desc, eq } from "drizzle-orm";
import { clientes, contas, db, solicitacoes } from "@workspace/db";
import { formatarData } from "@workspace/dominio";
import {
  AtualizarSolicitacaoBody,
  AtualizarSolicitacaoParams,
  CriarSolicitacaoBody,
  ListarSolicitacoesQueryParams,
} from "@workspace/api-zod";
import { HttpError } from "../lib/http";
import { auditar } from "../lib/auditoria";
import { contaDaRequisicao, sessaoDaRequisicao } from "../middlewares/autenticacao";
import { criarAviso, destinoDoCliente } from "../servicos/avisos";
import { camposSolicitacao } from "./portal";

const router = Router();

function urlPublica(): string {
  return (process.env.URL_PUBLICA ?? "http://localhost:5173").replace(/\/+$/, "");
}

function consulta(contaId: number, ...extras: Array<ReturnType<typeof eq> | undefined>) {
  return db
    .select(camposSolicitacao)
    .from(solicitacoes)
    .innerJoin(clientes, eq(clientes.id, solicitacoes.clienteId))
    .where(and(eq(solicitacoes.contaId, contaId), ...extras));
}

// GET /api/solicitacoes?clienteId=&status=
router.get("/", async (req, res) => {
  const contaId = contaDaRequisicao(req);
  const { clienteId, status } = ListarSolicitacoesQueryParams.parse(req.query);
  const lista = await consulta(
    contaId,
    clienteId ? eq(solicitacoes.clienteId, clienteId) : undefined,
    status ? eq(solicitacoes.status, status) : undefined,
  ).orderBy(desc(solicitacoes.id));
  res.json(lista);
});

// POST /api/solicitacoes — pede algo ao cliente e avisa por e-mail quando houver.
router.post("/", async (req, res) => {
  const contaId = contaDaRequisicao(req);
  const sessao = sessaoDaRequisicao(req);
  const { clienteId, tipo = "documento", descricao, prazo } = CriarSolicitacaoBody.parse(req.body);

  const destino = await destinoDoCliente(contaId, clienteId, "email");
  if (!destino) throw new HttpError(404, "Cliente não encontrado.");

  const id = await db.transaction(async (tx) => {
    const [nova] = await tx
      .insert(solicitacoes)
      .values({
        contaId,
        clienteId,
        tipo,
        descricao: descricao.trim(),
        prazo: prazo ?? null,
        criadaPor: sessao.usuarioId,
      })
      .returning({ id: solicitacoes.id });
    if (destino.destino) {
      const [conta] = await tx
        .select({ nome: contas.nome })
        .from(contas)
        .where(eq(contas.id, contaId));
      await criarAviso(tx, {
        contaId,
        clienteId,
        canal: "email",
        destino: destino.destino,
        modelo: "solicitacao",
        assunto: `${conta?.nome ?? "Seu escritório contábil"} precisa de um documento`,
        corpo:
          `Olá, ${destino.nome}.\n\n${conta?.nome ?? "Seu escritório contábil"} pediu: ${descricao.trim()}` +
          (prazo ? `\nPrazo: ${formatarData(prazo)}.` : "") +
          `\n\nEnvie pelo portal: ${urlPublica()}/portal (peça o link de acesso com este e-mail).`,
        referenciaEntidade: "solicitacao",
        referenciaId: nova.id,
      });
    }
    await auditar(
      req,
      { acao: "criar_solicitacao", entidade: "solicitacao", entidadeId: nova.id, para: tipo },
      tx,
    );
    return nova.id;
  });
  const [salva] = await consulta(contaId, eq(solicitacoes.id, id));
  res.json(salva);
});

// PATCH /api/solicitacoes/:id
router.patch("/:id", async (req, res) => {
  const contaId = contaDaRequisicao(req);
  const { id } = AtualizarSolicitacaoParams.parse(req.params);
  const body = AtualizarSolicitacaoBody.parse(req.body);
  const mudancas = Object.fromEntries(Object.entries(body).filter(([, v]) => v !== undefined));
  if (Object.keys(mudancas).length === 0) throw new HttpError(400, "Nenhum campo para atualizar.");
  const [a] = await db
    .update(solicitacoes)
    .set(mudancas)
    .where(and(eq(solicitacoes.id, id), eq(solicitacoes.contaId, contaId)))
    .returning({ id: solicitacoes.id });
  if (!a) throw new HttpError(404, "Solicitação não encontrada.");
  if (mudancas.status) {
    await auditar(req, {
      acao: "status_solicitacao",
      entidade: "solicitacao",
      entidadeId: id,
      para: String(mudancas.status),
    });
  }
  const [salva] = await consulta(contaId, eq(solicitacoes.id, id));
  res.json(salva);
});

export default router;
