import { Router } from "express";
import { asc, eq } from "drizzle-orm";
import { db } from "@workspace/db";
import { pagamentos, clientes } from "@workspace/db";

const router = Router();

// PATCH /api/pagamentos/:id
router.patch("/:id", async (req, res) => {
  const { status, valor, dataPagamento, forma, observacao } = req.body;
  await db.update(pagamentos)
    .set({
      status: status ?? "pendente",
      valor: valor || null,
      dataPagamento: dataPagamento || null,
      forma: forma || null,
      observacao: observacao || null,
      atualizadoEm: new Date(),
    })
    .where(eq(pagamentos.id, Number(req.params.id)));

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
    .where(eq(pagamentos.id, Number(req.params.id)));

  res.json(p);
});

export default router;
