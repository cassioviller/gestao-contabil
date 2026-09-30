import { Router } from "express";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@workspace/db";
import { tiposObrigacao } from "@workspace/db";
import { SalvarTipoBody, RemoverTipoParams } from "@workspace/api-zod";
import { HttpError } from "../lib/http";
import { contaDaRequisicao } from "../middlewares/autenticacao";

const router = Router();

// GET /api/tipos
router.get("/", async (req, res) => {
  const contaId = contaDaRequisicao(req);
  const lista = await db
    .select()
    .from(tiposObrigacao)
    .where(eq(tiposObrigacao.contaId, contaId))
    .orderBy(asc(tiposObrigacao.ordem), asc(tiposObrigacao.nome));
  res.json(lista);
});

// POST /api/tipos (criar ou editar)
router.post("/", async (req, res) => {
  const contaId = contaDaRequisicao(req);
  const { id, ...dados } = SalvarTipoBody.parse(req.body);

  if (id) {
    const [atualizado] = await db
      .update(tiposObrigacao)
      .set(dados)
      .where(and(eq(tiposObrigacao.id, id), eq(tiposObrigacao.contaId, contaId)))
      .returning();
    if (!atualizado) throw new HttpError(404, "Tipo de obrigação não encontrado.");
    res.json(atualizado);
  } else {
    const [t] = await db
      .insert(tiposObrigacao)
      .values({ ...dados, contaId })
      .returning();
    res.json(t);
  }
});

// DELETE /api/tipos/:id
router.delete("/:id", async (req, res) => {
  const contaId = contaDaRequisicao(req);
  const { id } = RemoverTipoParams.parse(req.params);
  await db
    .delete(tiposObrigacao)
    .where(and(eq(tiposObrigacao.id, id), eq(tiposObrigacao.contaId, contaId)));
  res.status(204).send();
});

export default router;
