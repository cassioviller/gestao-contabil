// Consultas de leitura (rodam no servidor, chamadas por Server Components).
// Mutações ficam em acoes.ts.

import "server-only";
import { and, asc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  checklistItens,
  clienteObrigacoes,
  clientes,
  cobrancas,
  competencias,
  configuracoes,
  pagamentos,
  tiposObrigacao,
} from "@/db/schema";

export async function listarClientes() {
  return db.select().from(clientes).orderBy(asc(clientes.codigo), asc(clientes.razaoSocial));
}

export async function obterCliente(id: number) {
  const [c] = await db.select().from(clientes).where(eq(clientes.id, id));
  if (!c) return null;
  const obrig = await db
    .select({ tipoObrigacaoId: clienteObrigacoes.tipoObrigacaoId, detalhe: clienteObrigacoes.detalhe })
    .from(clienteObrigacoes)
    .where(eq(clienteObrigacoes.clienteId, id));
  return { ...c, obrigacoes: obrig };
}

// Mapa clienteId -> [tipoObrigacaoId] para preencher os checkboxes na edição.
export async function mapaObrigacoesPorCliente() {
  const linhas = await db
    .select({ clienteId: clienteObrigacoes.clienteId, tipoId: clienteObrigacoes.tipoObrigacaoId })
    .from(clienteObrigacoes);
  const mapa: Record<number, number[]> = {};
  for (const l of linhas) (mapa[l.clienteId] ??= []).push(l.tipoId);
  return mapa;
}

export async function listarTiposObrigacao() {
  return db.select().from(tiposObrigacao).orderBy(asc(tiposObrigacao.ordem), asc(tiposObrigacao.nome));
}

export async function listarCompetencias() {
  return db.select().from(competencias).orderBy(asc(competencias.ano), asc(competencias.mes));
}

export async function obterCompetencia(id: number) {
  const [c] = await db.select().from(competencias).where(eq(competencias.id, id));
  return c ?? null;
}

// Grade do checklist: itens da competência com nome do cliente e da obrigação.
export async function listarChecklist(competenciaId: number) {
  return db
    .select({
      id: checklistItens.id,
      status: checklistItens.status,
      observacao: checklistItens.observacao,
      vencimento: checklistItens.vencimento,
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
    .where(eq(checklistItens.competenciaId, competenciaId))
    .orderBy(asc(clientes.codigo), asc(tiposObrigacao.ordem));
}

// Pagamentos da competência com nome do cliente.
export async function listarPagamentos(competenciaId: number) {
  return db
    .select({
      id: pagamentos.id,
      status: pagamentos.status,
      valor: pagamentos.valor,
      dataPagamento: pagamentos.dataPagamento,
      forma: pagamentos.forma,
      observacao: pagamentos.observacao,
      clienteId: clientes.id,
      codigo: clientes.codigo,
      cliente: clientes.razaoSocial,
    })
    .from(pagamentos)
    .innerJoin(clientes, eq(clientes.id, pagamentos.clienteId))
    .where(eq(pagamentos.competenciaId, competenciaId))
    .orderBy(asc(clientes.codigo));
}

// Resumo de uma competência (para painel e cabeçalhos).
export async function resumoCompetencia(competenciaId: number) {
  const [obr] = await db
    .select({
      total: sql<number>`count(*)::int`,
      feitos: sql<number>`count(*) filter (where ${checklistItens.status} = 'feito')::int`,
      pendentes: sql<number>`count(*) filter (where ${checklistItens.status} = 'pendente')::int`,
    })
    .from(checklistItens)
    .where(eq(checklistItens.competenciaId, competenciaId));

  const [pag] = await db
    .select({
      total: sql<number>`count(*)::int`,
      pagos: sql<number>`count(*) filter (where ${pagamentos.status} = 'pago')::int`,
      pendentes: sql<number>`count(*) filter (where ${pagamentos.status} = 'pendente')::int`,
      recebido: sql<string>`coalesce(sum(${pagamentos.valor}) filter (where ${pagamentos.status} = 'pago'), 0)`,
      aReceber: sql<string>`coalesce(sum(${pagamentos.valor}) filter (where ${pagamentos.status} = 'pendente'), 0)`,
    })
    .from(pagamentos)
    .where(eq(pagamentos.competenciaId, competenciaId));

  return { obrigacoes: obr, pagamentos: pag };
}

// Competência mais recente (para o painel abrir direto no mês atual).
export async function competenciaMaisRecente() {
  const [c] = await db
    .select()
    .from(competencias)
    .orderBy(sql`${competencias.ano} desc`, sql`${competencias.mes} desc`)
    .limit(1);
  return c ?? null;
}

export async function jaExisteCompetencia(ano: number, mes: number) {
  const [c] = await db
    .select({ id: competencias.id })
    .from(competencias)
    .where(and(eq(competencias.ano, ano), eq(competencias.mes, mes)));
  return c ?? null;
}

export async function obterConfiguracao(chave: string): Promise<string | null> {
  const [c] = await db
    .select({ valor: configuracoes.valor })
    .from(configuracoes)
    .where(eq(configuracoes.chave, chave));
  return c?.valor ?? null;
}

// Obrigações pendentes cujo vencimento já passou (atraso = current_date - vencimento).
export async function listarObrigacoesEmAtraso(clienteId?: number) {
  const cond = [
    eq(checklistItens.status, "pendente"),
    sql`${checklistItens.vencimento} is not null`,
    sql`${checklistItens.vencimento} < current_date`,
  ];
  if (clienteId) cond.push(eq(checklistItens.clienteId, clienteId));

  return db
    .select({
      id: checklistItens.id,
      competenciaId: checklistItens.competenciaId,
      ano: competencias.ano,
      mes: competencias.mes,
      vencimento: checklistItens.vencimento,
      diasAtraso: sql<number>`(current_date - ${checklistItens.vencimento})::int`,
      clienteId: clientes.id,
      codigo: clientes.codigo,
      cliente: clientes.razaoSocial,
      obrigacao: tiposObrigacao.nome,
    })
    .from(checklistItens)
    .innerJoin(clientes, eq(clientes.id, checklistItens.clienteId))
    .innerJoin(tiposObrigacao, eq(tiposObrigacao.id, checklistItens.tipoObrigacaoId))
    .innerJoin(competencias, eq(competencias.id, checklistItens.competenciaId))
    .where(and(...cond))
    .orderBy(sql`(current_date - ${checklistItens.vencimento}) desc`);
}

// Pagamentos pendentes vencidos, com a data da última cobrança registrada (se houver).
export async function listarInadimplentes(clienteId?: number) {
  const cond = [
    eq(pagamentos.status, "pendente"),
    sql`${pagamentos.valor} is not null`,
    sql`${pagamentos.vencimento} is not null`,
    sql`${pagamentos.vencimento} < current_date`,
  ];
  if (clienteId) cond.push(eq(pagamentos.clienteId, clienteId));

  return db
    .select({
      id: pagamentos.id,
      competenciaId: pagamentos.competenciaId,
      ano: competencias.ano,
      mes: competencias.mes,
      valor: pagamentos.valor,
      vencimento: pagamentos.vencimento,
      diasAtraso: sql<number>`(current_date - ${pagamentos.vencimento})::int`,
      clienteId: clientes.id,
      codigo: clientes.codigo,
      cliente: clientes.razaoSocial,
      whatsapp: clientes.whatsapp,
      cobradoEm: sql<string | null>`max(${cobrancas.enviadoEm})::text`,
    })
    .from(pagamentos)
    .innerJoin(clientes, eq(clientes.id, pagamentos.clienteId))
    .innerJoin(competencias, eq(competencias.id, pagamentos.competenciaId))
    .leftJoin(cobrancas, eq(cobrancas.pagamentoId, pagamentos.id))
    .where(and(...cond))
    .groupBy(pagamentos.id, clientes.id, competencias.id)
    .orderBy(sql`(current_date - ${pagamentos.vencimento}) desc`);
}
