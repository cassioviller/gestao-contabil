import { Router } from "express";
import { and, eq } from "drizzle-orm";
import { db } from "@workspace/db";
import { checklistItens, clientes, tiposObrigacao } from "@workspace/db";
import {
  AtualizarStatusChecklistParams,
  AtualizarStatusChecklistBody,
  AtualizarVencimentoChecklistParams,
  AtualizarVencimentoChecklistBody,
} from "@workspace/api-zod";
import { HttpError } from "../lib/http";
import { contaDaRequisicao } from "../middlewares/autenticacao";

const router = Router();

const campos = {
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
};

function buscarItem(id: number, contaId: number) {
  return db
    .select(campos)
    .from(checklistItens)
    .innerJoin(clientes, eq(clientes.id, checklistItens.clienteId))
    .innerJoin(tiposObrigacao, eq(tiposObrigacao.id, checklistItens.tipoObrigacaoId))
    .where(and(eq(checklistItens.id, id), eq(checklistItens.contaId, contaId)));
}

// PATCH /api/checklist/:id/status
router.patch("/:id/status", async (req, res) => {
  const contaId = contaDaRequisicao(req);
  const { id } = AtualizarStatusChecklistParams.parse(req.params);
  const { status } = AtualizarStatusChecklistBody.parse(req.body);

  const [alterado] = await db
    .update(checklistItens)
    .set({ status, atualizadoEm: new Date() })
    .where(and(eq(checklistItens.id, id), eq(checklistItens.contaId, contaId)))
    .returning({ id: checklistItens.id });
  if (!alterado) throw new HttpError(404, "Item do checklist não encontrado.");

  const [item] = await buscarItem(id, contaId);
  res.json(item);
});

// PATCH /api/checklist/:id/vencimento
router.patch("/:id/vencimento", async (req, res) => {
  const contaId = contaDaRequisicao(req);
  const { id } = AtualizarVencimentoChecklistParams.parse(req.params);
  const { vencimento } = AtualizarVencimentoChecklistBody.parse(req.body);

  const [alterado] = await db
    .update(checklistItens)
    .set({ vencimento: vencimento || null, atualizadoEm: new Date() })
    .where(and(eq(checklistItens.id, id), eq(checklistItens.contaId, contaId)))
    .returning({ id: checklistItens.id });
  if (!alterado) throw new HttpError(404, "Item do checklist não encontrado.");

  const [item] = await buscarItem(id, contaId);
  res.json(item);
});

export default router;
