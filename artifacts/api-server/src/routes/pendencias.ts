import { Router } from "express";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { checklistItens, clientes, cobrancas, competencias, pagamentos, tiposObrigacao } from "@workspace/db";
import {
  MarcarObrigacaoFeitaParams,
  MarcarPagamentoPagoParams,
  RegistrarCobrancaBody,
} from "@workspace/api-zod";
import { HttpError } from "../lib/http";
import { contaDaRequisicao } from "../middlewares/autenticacao";

const router = Router();

// GET /api/pendencias
router.get("/", async (req, res) => {
  const contaId = contaDaRequisicao(req);

  const obrigacoes = await db
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
    .where(and(
      eq(checklistItens.contaId, contaId),
      eq(checklistItens.status, "pendente"),
      sql`${checklistItens.vencimento} is not null`,
      sql`${checklistItens.vencimento} < current_date`,
    ))
    .orderBy(sql`(current_date - ${checklistItens.vencimento}) desc`);

  const inadimplentes = await db
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
    .where(and(
      eq(pagamentos.contaId, contaId),
      eq(pagamentos.status, "pendente"),
      sql`${pagamentos.valor} is not null`,
      sql`${pagamentos.vencimento} is not null`,
      sql`${pagamentos.vencimento} < current_date`,
    ))
    .groupBy(pagamentos.id, clientes.id, competencias.id)
    .orderBy(sql`(current_date - ${pagamentos.vencimento}) desc`);

  res.json({ obrigacoes, inadimplentes });
});

// PATCH /api/pendencias/obrigacoes/:id/feito
router.patch("/obrigacoes/:id/feito", async (req, res) => {
  const contaId = contaDaRequisicao(req);
  const { id } = MarcarObrigacaoFeitaParams.parse(req.params);
  const [alterado] = await db
    .update(checklistItens)
    .set({ status: "enviado", atualizadoEm: new Date() })
    .where(and(eq(checklistItens.id, id), eq(checklistItens.contaId, contaId)))
    .returning({ id: checklistItens.id });
  if (!alterado) throw new HttpError(404, "Item do checklist não encontrado.");
  res.status(204).send();
});

// PATCH /api/pendencias/pagamentos/:id/pago
router.patch("/pagamentos/:id/pago", async (req, res) => {
  const contaId = contaDaRequisicao(req);
  const { id } = MarcarPagamentoPagoParams.parse(req.params);
  const [alterado] = await db
    .update(pagamentos)
    .set({ status: "pago", atualizadoEm: new Date() })
    .where(and(eq(pagamentos.id, id), eq(pagamentos.contaId, contaId)))
    .returning({ id: pagamentos.id });
  if (!alterado) throw new HttpError(404, "Pagamento não encontrado.");
  res.status(204).send();
});

// POST /api/pendencias/cobrancas
router.post("/cobrancas", async (req, res) => {
  const contaId = contaDaRequisicao(req);
  const { pagamentoId } = RegistrarCobrancaBody.parse(req.body);
  // `cobrancas` não tem conta própria: a conta vem do pagamento cobrado.
  const [pg] = await db
    .select({ id: pagamentos.id })
    .from(pagamentos)
    .where(and(eq(pagamentos.id, pagamentoId), eq(pagamentos.contaId, contaId)));
  if (!pg) throw new HttpError(404, "Pagamento não encontrado.");
  await db.insert(cobrancas).values({ pagamentoId });
  res.status(204).send();
});

export default router;
