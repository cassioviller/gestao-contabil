import { Router } from "express";
import { and, eq } from "drizzle-orm";
import { db } from "@workspace/db";
import { processos, processoEtapas } from "@workspace/db";
import { AtualizarEtapaBody, AtualizarEtapaParams, RemoverEtapaParams } from "@workspace/api-zod";
import { HttpError } from "../lib/http";
import { contaDaRequisicao } from "../middlewares/autenticacao";

const router = Router();

/**
 * `processo_etapas` não guarda conta própria — quem manda é o processo dono.
 * Toda rota daqui confere a posse pelo pai antes de tocar na etapa; sem isso, um
 * id adivinhado editaria o checklist de outro escritório.
 */
async function exigirEtapaDaConta(id: number, contaId: number): Promise<void> {
  const [etapa] = await db
    .select({ id: processoEtapas.id })
    .from(processoEtapas)
    .innerJoin(processos, eq(processos.id, processoEtapas.processoId))
    .where(and(eq(processoEtapas.id, id), eq(processos.contaId, contaId)));
  if (!etapa) throw new HttpError(404, "Etapa não encontrada.");
}

// PATCH /api/etapas/:id — marcar feito, renomear, reordenar
router.patch("/:id", async (req, res) => {
  const contaId = contaDaRequisicao(req);
  const { id } = AtualizarEtapaParams.parse(req.params);
  const body = AtualizarEtapaBody.parse(req.body);

  const campos: Record<string, unknown> = Object.fromEntries(
    Object.entries(body).filter(([, v]) => v !== undefined),
  );
  if (Object.keys(campos).length === 0) throw new HttpError(400, "Nenhum campo para atualizar.");

  await exigirEtapaDaConta(id, contaId);

  // Marcar/desmarcar carimba (ou limpa) a data de conclusão sozinho.
  if ("feito" in campos) campos.concluidoEm = campos.feito ? new Date() : null;

  const [etapa] = await db
    .update(processoEtapas)
    .set(campos)
    .where(eq(processoEtapas.id, id))
    .returning();
  if (!etapa) throw new HttpError(404, "Etapa não encontrada.");

  res.json(etapa);
});

// DELETE /api/etapas/:id
router.delete("/:id", async (req, res) => {
  const contaId = contaDaRequisicao(req);
  const { id } = RemoverEtapaParams.parse(req.params);
  await exigirEtapaDaConta(id, contaId);
  await db.delete(processoEtapas).where(eq(processoEtapas.id, id));
  res.status(204).send();
});

export default router;
