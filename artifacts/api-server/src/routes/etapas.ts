import { Router } from "express";
import { eq } from "drizzle-orm";
import { db } from "@workspace/db";
import { processoEtapas } from "@workspace/db";
import { AtualizarEtapaBody, AtualizarEtapaParams, RemoverEtapaParams } from "@workspace/api-zod";
import { HttpError } from "../lib/http";

const router = Router();

// PATCH /api/etapas/:id — marcar feito, renomear, reordenar
router.patch("/:id", async (req, res) => {
  const { id } = AtualizarEtapaParams.parse(req.params);
  const body = AtualizarEtapaBody.parse(req.body);

  const campos: Record<string, unknown> = Object.fromEntries(
    Object.entries(body).filter(([, v]) => v !== undefined)
  );
  if (Object.keys(campos).length === 0) throw new HttpError(400, "Nenhum campo para atualizar.");

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
  const { id } = RemoverEtapaParams.parse(req.params);
  await db.delete(processoEtapas).where(eq(processoEtapas.id, id));
  res.status(204).send();
});

export default router;
