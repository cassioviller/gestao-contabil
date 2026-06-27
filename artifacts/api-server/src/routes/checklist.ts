import { Router } from "express";
import { eq } from "drizzle-orm";
import { db } from "@workspace/db";
import { checklistItens, clientes, tiposObrigacao } from "@workspace/db";

const router = Router();

// PATCH /api/checklist/:id/status
router.patch("/:id/status", async (req, res) => {
  const { status } = req.body;
  await db.update(checklistItens)
    .set({ status, atualizadoEm: new Date() })
    .where(eq(checklistItens.id, Number(req.params.id)));

  const [item] = await db
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
    .where(eq(checklistItens.id, Number(req.params.id)));

  res.json(item);
});

// PATCH /api/checklist/:id/vencimento
router.patch("/:id/vencimento", async (req, res) => {
  const { vencimento } = req.body;
  await db.update(checklistItens)
    .set({ vencimento: vencimento || null, atualizadoEm: new Date() })
    .where(eq(checklistItens.id, Number(req.params.id)));

  const [item] = await db
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
    .where(eq(checklistItens.id, Number(req.params.id)));

  res.json(item);
});

export default router;
