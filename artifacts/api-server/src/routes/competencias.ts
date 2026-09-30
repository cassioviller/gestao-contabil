import { Router } from "express";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  checklistItens,
  clienteObrigacoes,
  clientes,
  competencias,
  pagamentos,
  tiposObrigacao,
} from "@workspace/db";
import {
  AbrirCompetenciaBody,
  GetCompetenciaParams,
  RemoverCompetenciaParams,
  ListarChecklistParams,
  ListarPagamentosParams,
} from "@workspace/api-zod";
import { aplicaNoMes, calcularVencimento } from "@workspace/dominio";
import { HttpError } from "../lib/http";
import { contaDaRequisicao } from "../middlewares/autenticacao";

const router = Router();

async function resumoCompetencia(competenciaId: number, contaId: number) {
  const [obr] = await db
    .select({
      total: sql<number>`count(*)::int`,
      // "Feito" é a guia que chegou ao cliente; emitida ainda está em curso.
      feitos: sql<number>`count(*) filter (where ${checklistItens.status} = 'enviado')::int`,
      emitidos: sql<number>`count(*) filter (where ${checklistItens.status} = 'emitido')::int`,
      pendentes: sql<number>`count(*) filter (where ${checklistItens.status} = 'pendente')::int`,
    })
    .from(checklistItens)
    .where(
      and(eq(checklistItens.competenciaId, competenciaId), eq(checklistItens.contaId, contaId)),
    );

  const [pag] = await db
    .select({
      total: sql<number>`count(*)::int`,
      pagos: sql<number>`count(*) filter (where ${pagamentos.status} = 'pago')::int`,
      pendentes: sql<number>`count(*) filter (where ${pagamentos.status} = 'pendente')::int`,
      recebido: sql<string>`coalesce(sum(${pagamentos.valor}) filter (where ${pagamentos.status} = 'pago'), 0)::text`,
      aReceber: sql<string>`coalesce(sum(${pagamentos.valor}) filter (where ${pagamentos.status} = 'pendente'), 0)::text`,
    })
    .from(pagamentos)
    .where(and(eq(pagamentos.competenciaId, competenciaId), eq(pagamentos.contaId, contaId)));

  return { obrigacoes: obr, pagamentos: pag };
}

// GET /api/competencias
router.get("/", async (req, res) => {
  const contaId = contaDaRequisicao(req);
  const comps = await db
    .select()
    .from(competencias)
    .where(eq(competencias.contaId, contaId))
    .orderBy(asc(competencias.ano), asc(competencias.mes));
  const comResumo = await Promise.all(
    comps.map(async (c) => ({ ...c, resumo: await resumoCompetencia(c.id, contaId) })),
  );
  comResumo.reverse();
  res.json(comResumo);
});

/** Honorário sem dia definido vence no dia 10 do mês seguinte. */
const DIA_PADRAO_HONORARIO = 10;

type Transacao = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Cria os itens de checklist e os pagamentos que ainda não existem para a
 * competência. É o coração de "abrir mês" e de "sincronizar": a segunda chamada
 * só acrescenta o que falta (cliente ou obrigação incluídos depois), sem tocar
 * no que a contadora já trabalhou.
 */
export async function gerarItensDaCompetencia(
  tx: Transacao,
  contaId: number,
  comp: { id: number; ano: number; mes: number },
  somenteHonorarios: boolean,
): Promise<{ itens: number; pagamentos: number }> {
  const ativos = await tx
    .select({
      id: clientes.id,
      valorHonorario: clientes.valorHonorario,
      diaVencimentoHonorario: clientes.diaVencimentoHonorario,
    })
    .from(clientes)
    .where(and(eq(clientes.contaId, contaId), eq(clientes.ativo, true)));
  if (!ativos.length) return { itens: 0, pagamentos: 0 };

  const ativosIds = ativos.map((c) => c.id);
  // Obrigação inativa não entra em mês novo, mas o histórico dela fica.
  const tipos = await tx
    .select()
    .from(tiposObrigacao)
    .where(and(eq(tiposObrigacao.contaId, contaId), eq(tiposObrigacao.ativo, true)));
  const tipoPorId = new Map(tipos.map((t) => [t.id, t]));

  let itens = 0;
  if (!somenteHonorarios) {
    const vinculos = await tx
      .select()
      .from(clienteObrigacoes)
      .where(inArray(clienteObrigacoes.clienteId, ativosIds));

    // Uma obrigação anual/trimestral só entra no mês em que de fato vence.
    const doMes = vinculos.filter((v) => {
      const tipo = tipoPorId.get(v.tipoObrigacaoId);
      return tipo ? aplicaNoMes(tipo.periodicidade, tipo.mesReferencia, comp.mes) : false;
    });

    if (doMes.length) {
      const inseridos = await tx
        .insert(checklistItens)
        .values(
          doMes.map((v) => {
            const tipo = tipoPorId.get(v.tipoObrigacaoId)!;
            return {
              contaId,
              competenciaId: comp.id,
              clienteId: v.clienteId,
              tipoObrigacaoId: v.tipoObrigacaoId,
              status: "pendente" as const,
              vencimento: calcularVencimento(
                comp.ano,
                comp.mes,
                tipo.diaVencimento,
                tipo.offsetMes,
              ),
            };
          }),
        )
        // O índice único (competência, cliente, obrigação) é o que torna a
        // sincronização idempotente.
        .onConflictDoNothing()
        .returning({ id: checklistItens.id });
      itens = inseridos.length;
    }
  }

  const pagos = await tx
    .insert(pagamentos)
    .values(
      ativos.map((c) => ({
        contaId,
        competenciaId: comp.id,
        clienteId: c.id,
        status: "pendente" as const,
        valor: c.valorHonorario,
        vencimento: calcularVencimento(
          comp.ano,
          comp.mes,
          c.diaVencimentoHonorario ?? DIA_PADRAO_HONORARIO,
          1,
        ),
      })),
    )
    .onConflictDoNothing()
    .returning({ id: pagamentos.id });

  return { itens, pagamentos: pagos.length };
}

// POST /api/competencias
router.post("/", async (req, res) => {
  const contaId = contaDaRequisicao(req);
  const { ano, mes, somenteHonorarios = false } = AbrirCompetenciaBody.parse(req.body);
  if (mes < 1 || mes > 12) {
    throw new HttpError(400, "Mês inválido (use 1 a 12).");
  }

  // Tudo numa transação: se a geração dos pagamentos falhar, o mês não fica
  // "aberto pela metade" com a próxima tentativa recusada por já existir.
  const comp = await db.transaction(async (tx) => {
    const [criada] = await tx
      .insert(competencias)
      // O rótulo marca a competência "só honorários": a sincronização precisa
      // saber que aquele mês não deve ganhar checklist depois.
      .values({ contaId, ano, mes, rotulo: somenteHonorarios ? "honorarios" : null })
      // Duas pessoas abrindo o mesmo mês ao mesmo tempo: a segunda recebe
      // 409, e não um 500 de índice único.
      .onConflictDoNothing()
      .returning();
    if (!criada) throw new HttpError(409, "Esse mês já foi aberto.", undefined, "duplicado");
    await gerarItensDaCompetencia(tx, contaId, criada, somenteHonorarios);
    return criada;
  });

  res.json(comp);
});

// POST /api/competencias/:id/sincronizar — acrescenta clientes e obrigações
// incluídos depois da abertura, sem tocar nos itens já existentes.
router.post("/:id/sincronizar", async (req, res) => {
  const contaId = contaDaRequisicao(req);
  const { id } = GetCompetenciaParams.parse(req.params);
  const resultado = await db.transaction(async (tx) => {
    const [comp] = await tx
      .select()
      .from(competencias)
      .where(and(eq(competencias.id, id), eq(competencias.contaId, contaId)));
    if (!comp) throw new HttpError(404, "Competência não encontrada.");
    // Competência aberta como "só honorários" continua só honorários.
    return gerarItensDaCompetencia(tx, contaId, comp, comp.rotulo === "honorarios");
  });
  res.json({ itensCriados: resultado.itens, pagamentosCriados: resultado.pagamentos });
});

// GET /api/competencias/:id
router.get("/:id", async (req, res) => {
  const contaId = contaDaRequisicao(req);
  const { id } = GetCompetenciaParams.parse(req.params);
  const [comp] = await db
    .select()
    .from(competencias)
    .where(and(eq(competencias.id, id), eq(competencias.contaId, contaId)));
  if (!comp) throw new HttpError(404, "Competência não encontrada.");
  const resumo = await resumoCompetencia(comp.id, contaId);
  res.json({ ...comp, resumo });
});

// DELETE /api/competencias/:id
router.delete("/:id", async (req, res) => {
  const contaId = contaDaRequisicao(req);
  const { id } = RemoverCompetenciaParams.parse(req.params);
  await db
    .delete(competencias)
    .where(and(eq(competencias.id, id), eq(competencias.contaId, contaId)));
  res.status(204).send();
});

// GET /api/competencias/:id/checklist
router.get("/:id/checklist", async (req, res) => {
  const contaId = contaDaRequisicao(req);
  const { id } = ListarChecklistParams.parse(req.params);
  const itens = await db
    .select({
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
    })
    .from(checklistItens)
    .innerJoin(clientes, eq(clientes.id, checklistItens.clienteId))
    .innerJoin(tiposObrigacao, eq(tiposObrigacao.id, checklistItens.tipoObrigacaoId))
    .where(and(eq(checklistItens.competenciaId, id), eq(checklistItens.contaId, contaId)))
    .orderBy(asc(clientes.codigo), asc(tiposObrigacao.ordem));
  res.json(itens);
});

// GET /api/competencias/:id/pagamentos
router.get("/:id/pagamentos", async (req, res) => {
  const contaId = contaDaRequisicao(req);
  const { id } = ListarPagamentosParams.parse(req.params);
  const pgs = await db
    .select({
      id: pagamentos.id,
      status: pagamentos.status,
      valor: pagamentos.valor,
      dataPagamento: pagamentos.dataPagamento,
      vencimento: pagamentos.vencimento,
      forma: pagamentos.forma,
      observacao: pagamentos.observacao,
      clienteId: clientes.id,
      codigo: clientes.codigo,
      cliente: clientes.razaoSocial,
    })
    .from(pagamentos)
    .innerJoin(clientes, eq(clientes.id, pagamentos.clienteId))
    .where(and(eq(pagamentos.competenciaId, id), eq(pagamentos.contaId, contaId)))
    .orderBy(asc(clientes.codigo));
  res.json(pgs);
});

export { resumoCompetencia };
export default router;
