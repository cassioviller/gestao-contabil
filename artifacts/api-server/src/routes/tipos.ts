import { Router } from "express";
import { asc, eq } from "drizzle-orm";
import { db } from "@workspace/db";
import { tiposObrigacao } from "@workspace/db";

const router = Router();

// GET /api/tipos
router.get("/", async (req, res) => {
  const lista = await db.select().from(tiposObrigacao).orderBy(asc(tiposObrigacao.ordem), asc(tiposObrigacao.nome));
  res.json(lista);
});

// POST /api/tipos (criar ou editar)
router.post("/", async (req, res) => {
  const { id, ...dados } = req.body;
  if (id) {
    await db.update(tiposObrigacao).set(dados).where(eq(tiposObrigacao.id, Number(id)));
    const [t] = await db.select().from(tiposObrigacao).where(eq(tiposObrigacao.id, Number(id)));
    res.json(t);
  } else {
    const [t] = await db.insert(tiposObrigacao).values(dados).returning();
    res.json(t);
  }
});

// DELETE /api/tipos/:id
router.delete("/:id", async (req, res) => {
  await db.delete(tiposObrigacao).where(eq(tiposObrigacao.id, Number(req.params.id)));
  res.status(204).send();
});

export default router;
