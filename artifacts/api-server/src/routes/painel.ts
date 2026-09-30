import { Router } from "express";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import {
  avisos,
  checklistItens,
  clientes,
  competencias,
  db,
  ferias,
  pagamentos,
  processos,
} from "@workspace/db";
import { hojeBR, somarDias } from "@workspace/dominio";
import { comVencimento, consultaFerias } from "../lib/pessoal";
import { contaDaRequisicao } from "../middlewares/autenticacao";

const router = Router();

async function resumoDaCompetencia(competenciaId: number, contaId: number) {
  const [obr] = await db
    .select({
      total: sql<number>`count(*)::int`,
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

/**
 * Os alertas do painel: tudo o que pede ação hoje, cada um com um número e
 * um lugar para clicar. As contas são independentes entre si — uma falha
 * numa não deve esconder as outras, então cada uma é uma consulta pequena.
 */
async function alertas(contaId: number) {
  const hoje = hojeBR();
  const em7 = somarDias(hoje, 7);
  const em30 = somarDias(hoje, 30);
  const ano = Number(hoje.slice(0, 4));
  const mes = Number(hoje.slice(5, 7));

  const [doMes] = await db
    .select({ id: competencias.id })
    .from(competencias)
    .where(
      and(
        eq(competencias.contaId, contaId),
        eq(competencias.ano, ano),
        eq(competencias.mes, mes),
        isNull(competencias.rotulo),
      ),
    );

  const [itens] = await db
    .select({
      vencendo7Dias: sql<number>`count(*) filter (where ${checklistItens.vencimento} >= ${hoje}::date and ${checklistItens.vencimento} <= ${em7}::date)::int`,
      emitidasVencidas: sql<number>`count(*) filter (where ${checklistItens.status} = 'emitido' and ${checklistItens.vencimento} < ${hoje}::date)::int`,
    })
    .from(checklistItens)
    .where(
      and(
        eq(checklistItens.contaId, contaId),
        inArray(checklistItens.status, ["pendente", "emitido"]),
        sql`${checklistItens.vencimento} is not null`,
      ),
    );

  const [honorarios] = await db
    .select({
      quantidade: sql<number>`count(*)::int`,
      total: sql<string>`coalesce(sum(${pagamentos.valor}), 0)::text`,
    })
    .from(pagamentos)
    .where(
      and(
        eq(pagamentos.contaId, contaId),
        eq(pagamentos.status, "pendente"),
        sql`${pagamentos.vencimento} < ${hoje}::date`,
      ),
    );

  const [procuracoes] = await db
    .select({
      vencendo: sql<number>`count(*) filter (where ${clientes.procuracaoVencimento} >= ${hoje}::date and ${clientes.procuracaoVencimento} <= ${em30}::date)::int`,
      vencidas: sql<number>`count(*) filter (where ${clientes.procuracaoVencimento} < ${hoje}::date)::int`,
      semObrigacoes: sql<number>`count(*) filter (where not exists (select 1 from cliente_obrigacoes co where co.cliente_id = clientes.id))::int`,
    })
    .from(clientes)
    .where(and(eq(clientes.contaId, contaId), eq(clientes.ativo, true)));

  const [proc] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(processos)
    .where(
      and(
        eq(processos.contaId, contaId),
        inArray(processos.status, ["aberto", "em_andamento"]),
        sql`${processos.prazo} < ${hoje}::date`,
      ),
    );

  const [falhados] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(avisos)
    .where(and(eq(avisos.contaId, contaId), eq(avisos.status, "falhou")));

  const feriasAbertas = await consultaFerias(contaId, isNull(ferias.gozoInicio));
  const feriasVencendo = feriasAbertas.filter((f) => {
    const v = comVencimento(f, hoje);
    return v.vencendo || v.vencida;
  }).length;

  return {
    competenciaDoMesAberta: !!doMes,
    competenciaDoMesId: doMes?.id ?? null,
    vencendo7Dias: itens?.vencendo7Dias ?? 0,
    emitidasNaoEnviadasVencidas: itens?.emitidasVencidas ?? 0,
    honorariosVencidos: {
      quantidade: honorarios?.quantidade ?? 0,
      total: honorarios?.total ?? "0",
    },
    feriasVencendo,
    procuracoesVencendo30Dias: procuracoes?.vencendo ?? 0,
    procuracoesVencidas: procuracoes?.vencidas ?? 0,
    processosAtrasados: proc?.n ?? 0,
    avisosFalhados: falhados?.n ?? 0,
    clientesSemObrigacoes: procuracoes?.semObrigacoes ?? 0,
  };
}

// GET /api/painel
router.get("/", async (req, res) => {
  const contaId = contaDaRequisicao(req);

  const [{ ativos }] = await db
    .select({ ativos: sql<number>`count(*) filter (where ${clientes.ativo})::int` })
    .from(clientes)
    .where(eq(clientes.contaId, contaId));

  const [comp] = await db
    .select()
    .from(competencias)
    .where(and(eq(competencias.contaId, contaId), isNull(competencias.rotulo)))
    .orderBy(sql`${competencias.ano} desc`, sql`${competencias.mes} desc`)
    .limit(1);

  const painel = {
    clientesAtivos: ativos,
    alertas: await alertas(contaId),
    competenciaAtual: comp
      ? {
          id: comp.id,
          ano: comp.ano,
          mes: comp.mes,
          resumo: await resumoDaCompetencia(comp.id, contaId),
        }
      : null,
  };
  res.json(painel);
});

export default router;
