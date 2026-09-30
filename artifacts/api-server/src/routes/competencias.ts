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

const INTERVALO_MESES: Record<string, number> = {
  mensal: 1,
  bimestral: 2,
  trimestral: 3,
  semestral: 6,
  anual: 12,
};

/**
 * A obrigação vale neste mês? Mensal sempre vale. As demais caem nos meses em
 * que a distância até o mês de referência é múltipla do intervalo — anual com
 * referência 7 só em julho, trimestral com referência 3 em 3/6/9/12.
 * Sem referência definida, o ciclo é ancorado em janeiro.
 */
function aplicaNoMes(periodicidade: string, mesReferencia: number | null, mes: number): boolean {
  const intervalo = INTERVALO_MESES[periodicidade] ?? 1;
  if (intervalo === 1) return true;
  const ref = mesReferencia && mesReferencia >= 1 && mesReferencia <= 12 ? mesReferencia : 1;
  return (((mes - ref) % intervalo) + intervalo) % intervalo === 0;
}

function calcularVencimento(ano: number, mes: number, dia: number | null, offsetMes: number): string | null {
  if (!dia || dia < 1) return null;
  const base = mes - 1 + offsetMes;
  const alvoAno = ano + Math.floor(base / 12);
  const alvoMes = ((base % 12) + 12) % 12;
  const ultimoDia = new Date(Date.UTC(alvoAno, alvoMes + 1, 0)).getUTCDate();
  const diaFinal = Math.min(dia, ultimoDia);
  const mm = String(alvoMes + 1).padStart(2, "0");
  const dd = String(diaFinal).padStart(2, "0");
  return `${alvoAno}-${mm}-${dd}`;
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

// POST /api/competencias
router.post("/", async (req, res) => {
  const contaId = contaDaRequisicao(req);
  const { ano, mes, somenteHonorarios = false } = AbrirCompetenciaBody.parse(req.body);
  if (mes < 1 || mes > 12) {
    throw new HttpError(400, "Mês inválido (use 1 a 12).");
  }

  const existente = await db
    .select({ id: competencias.id })
    .from(competencias)
    .where(
      and(eq(competencias.contaId, contaId), eq(competencias.ano, ano), eq(competencias.mes, mes)),
    );
  if (existente.length) {
    throw new HttpError(400, "Esse mês já foi aberto.");
  }

  const [comp] = await db.insert(competencias).values({ contaId, ano, mes }).returning();

  const ativos = await db
    .select()
    .from(clientes)
    .where(and(eq(clientes.contaId, contaId), eq(clientes.ativo, true)));
  const ativosIds = ativos.map((c) => c.id);
  const tipos = await db.select().from(tiposObrigacao).where(eq(tiposObrigacao.contaId, contaId));
  const tipoPorId = new Map(tipos.map((t) => [t.id, t]));

  if (ativosIds.length) {
    const vinculos = await db.select().from(clienteObrigacoes)
      .where(inArray(clienteObrigacoes.clienteId, ativosIds));

    // Meses anteriores ao início do uso do sistema entram só com os honorários:
    // o checklist daqueles meses não faz sentido e só viraria ruído.
    // Uma obrigação anual/trimestral só entra no mês em que de fato vence.
    const doMes = somenteHonorarios
      ? []
      : vinculos.filter((v) => {
          const tipo = tipoPorId.get(v.tipoObrigacaoId);
          return tipo ? aplicaNoMes(tipo.periodicidade, tipo.mesReferencia, mes) : false;
        });

    if (doMes.length) {
      await db.insert(checklistItens).values(
        doMes.map((v) => {
          const tipo = tipoPorId.get(v.tipoObrigacaoId);
          return {
            contaId,
            competenciaId: comp.id,
            clienteId: v.clienteId,
            tipoObrigacaoId: v.tipoObrigacaoId,
            status: "pendente" as const,
            vencimento: tipo ? calcularVencimento(ano, mes, tipo.diaVencimento, tipo.offsetMes) : null,
          };
        })
      );
    }

    const DIA_PADRAO = 10;
    await db.insert(pagamentos).values(
      ativos.map((c) => ({
        contaId,
        competenciaId: comp.id,
        clienteId: c.id,
        status: "pendente" as const,
        valor: c.valorHonorario,
        vencimento: calcularVencimento(ano, mes, c.diaVencimentoHonorario ?? DIA_PADRAO, 1),
      }))
    );
  }

  res.json(comp);
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
