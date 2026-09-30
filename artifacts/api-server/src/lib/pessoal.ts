import { and, eq, type SQL } from "drizzle-orm";
import { clientes, db, ferias, folhaLancamentos, funcionarios } from "@workspace/db";
import { comVencimento as comVencimentoDominio, hojeBR } from "@workspace/dominio";

/** Projeção comum a todas as listas de folha — a tela sempre mostra de quem é. */
export const camposFolha = {
  id: folhaLancamentos.id,
  funcionarioId: folhaLancamentos.funcionarioId,
  funcionarioNome: funcionarios.nome,
  clienteId: funcionarios.clienteId,
  clienteNome: clientes.razaoSocial,
  ano: folhaLancamentos.ano,
  mes: folhaLancamentos.mes,
  tipo: folhaLancamentos.tipo,
  salarioBase: folhaLancamentos.salarioBase,
  proventos: folhaLancamentos.proventos,
  descontos: folhaLancamentos.descontos,
  inss: folhaLancamentos.inss,
  fgts: folhaLancamentos.fgts,
  irrf: folhaLancamentos.irrf,
  liquido: folhaLancamentos.liquido,
  pago: folhaLancamentos.pago,
  pagoEm: folhaLancamentos.pagoEm,
  observacao: folhaLancamentos.observacao,
};

export function consultaFolha(contaId: number, ...extras: Array<SQL | undefined>) {
  return db
    .select(camposFolha)
    .from(folhaLancamentos)
    .innerJoin(funcionarios, eq(folhaLancamentos.funcionarioId, funcionarios.id))
    .leftJoin(clientes, eq(funcionarios.clienteId, clientes.id))
    .where(and(eq(folhaLancamentos.contaId, contaId), ...extras));
}

export const camposFerias = {
  id: ferias.id,
  funcionarioId: ferias.funcionarioId,
  funcionarioNome: funcionarios.nome,
  clienteId: funcionarios.clienteId,
  clienteNome: clientes.razaoSocial,
  aquisitivoInicio: ferias.aquisitivoInicio,
  aquisitivoFim: ferias.aquisitivoFim,
  gozoInicio: ferias.gozoInicio,
  gozoFim: ferias.gozoFim,
  diasVendidos: ferias.diasVendidos,
  valor: ferias.valor,
  observacao: ferias.observacao,
};

export function consultaFerias(contaId: number, ...extras: Array<SQL | undefined>) {
  return db
    .select(camposFerias)
    .from(ferias)
    .innerJoin(funcionarios, eq(ferias.funcionarioId, funcionarios.id))
    .leftJoin(clientes, eq(funcionarios.clienteId, clientes.id))
    .where(and(eq(ferias.contaId, contaId), ...extras));
}

type LinhaFerias = Awaited<ReturnType<typeof consultaFerias>>[number];

/**
 * Acrescenta o que a tela precisa mas o banco não guarda: o **limite legal**
 * para conceder as férias (um ano depois do fim do período aquisitivo), se ele
 * está próximo (`vencendo`) e se já passou (`vencida`). A regra mora em
 * `@workspace/dominio`; aqui só entra a data de hoje em Brasília.
 */
export function comVencimento(linha: LinhaFerias, hoje: string = hojeBR()) {
  return comVencimentoDominio(linha, hoje);
}
