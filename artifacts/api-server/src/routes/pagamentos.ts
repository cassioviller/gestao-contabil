import { Router } from "express";
import { and, eq } from "drizzle-orm";
import { db } from "@workspace/db";
import { pagamentos, clientes } from "@workspace/db";
import { AtualizarPagamentoParams, AtualizarPagamentoBody } from "@workspace/api-zod";
import { HttpError } from "../lib/http";
import { contaDaRequisicao } from "../middlewares/autenticacao";

const router = Router();

// PATCH /api/pagamentos/:id
router.patch("/:id", async (req, res) => {
  const contaId = contaDaRequisicao(req);
  const { id } = AtualizarPagamentoParams.parse(req.params);
  const { status, valor, dataPagamento, forma, observacao } = AtualizarPagamentoBody.parse(req.body);

  const [alterado] = await db
    .update(pagamentos)
    .set({
      status: status ?? "pendente",
      valor: valor || null,
      dataPagamento: dataPagamento || null,
      forma: forma || null,
      observacao: observacao || null,
      atualizadoEm: new Date(),
    })
    .where(and(eq(pagamentos.id, id), eq(pagamentos.contaId, contaId)))
    .returning({ id: pagamentos.id });
  if (!alterado) throw new HttpError(404, "Pagamento não encontrado.");

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
