import { Router } from "express";
import { eq } from "drizzle-orm";
import { db } from "@workspace/db";
import { pagamentos, clientes } from "@workspace/db";
import { AtualizarPagamentoParams, AtualizarPagamentoBody } from "@workspace/api-zod";

const router = Router();

// PATCH /api/pagamentos/:id
router.patch("/:id", async (req, res) => {
  const { id } = AtualizarPagamentoParams.parse(req.params);
  const { status, valor, dataPagamento, forma, observacao } = AtualizarPagamentoBody.parse(req.body);
  await db.update(pagamentos)
    .set({
      status: status ?? "pendente",
      valor: valor || null,
      dataPagamento: dataPagamento || null,
      forma: forma || null,
      observacao: observacao || null,
      atualizadoEm: new Date(),
    })
    .where(eq(pagamentos.id, id));

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
    .where(eq(pagamentos.id, id));

  res.json(p);
});

export default router;
