import { Router } from "express";
import { and, eq } from "drizzle-orm";
import { db } from "@workspace/db";
import { pagamentos, clientes } from "@workspace/db";
import { AtualizarPagamentoParams, AtualizarPagamentoBody } from "@workspace/api-zod";
import { HttpError } from "../lib/http";
import { auditar } from "../lib/auditoria";
import { contaDaRequisicao, sessaoDaRequisicao } from "../middlewares/autenticacao";

const router = Router();

// PATCH /api/pagamentos/:id
router.patch("/:id", async (req, res) => {
  const contaId = contaDaRequisicao(req);
  const sessao = sessaoDaRequisicao(req);
  const { id } = AtualizarPagamentoParams.parse(req.params);
  const body = AtualizarPagamentoBody.parse(req.body);

  // Só o que veio no corpo é gravado: um PATCH com `{ status: "pago" }` não
  // pode zerar o valor nem a data. Texto vazio vale como "limpar" (null).
  const mudancas: Record<string, unknown> = {};
  for (const [chave, v] of Object.entries(body)) {
    if (v === undefined) continue;
    mudancas[chave] = typeof v === "string" && v.trim() === "" ? null : v;
  }
  if (Object.keys(mudancas).length === 0) throw new HttpError(400, "Nenhum campo para atualizar.");

  const [alterado] = await db
    .update(pagamentos)
    .set({ ...mudancas, atualizadoEm: new Date(), atualizadoPor: sessao.usuarioId })
    .where(and(eq(pagamentos.id, id), eq(pagamentos.contaId, contaId)))
    .returning({ id: pagamentos.id, status: pagamentos.status });
  if (!alterado) throw new HttpError(404, "Pagamento não encontrado.");
  if (mudancas.status !== undefined) {
    await auditar(req, {
      acao: "status_pagamento",
      entidade: "pagamento",
      entidadeId: id,
      para: String(mudancas.status),
    });
  }

  const [p] = await db
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
    .where(and(eq(pagamentos.id, id), eq(pagamentos.contaId, contaId)));

  res.json(p);
});

export default router;
