import { Router } from "express";
import { asc, eq } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  clientes,
  clienteObrigacoes,
} from "@workspace/db";
import { CriarClienteBody, RemoverClienteParams } from "@workspace/api-zod";

const router = Router();

// GET /api/clientes
router.get("/", async (req, res) => {
  const lista = await db.select().from(clientes).orderBy(asc(clientes.codigo), asc(clientes.razaoSocial));
  const vinculos = await db.select().from(clienteObrigacoes);
  const mapaObrig: Record<number, number[]> = {};
  for (const v of vinculos) (mapaObrig[v.clienteId] ??= []).push(v.tipoObrigacaoId);

  res.json(lista.map((c) => ({ ...c, obrigacoes: mapaObrig[c.id] ?? [] })));
});

// POST /api/clientes (criar ou editar)
router.post("/", async (req, res) => {
  const { id, obrigacoes = [], ...dados } = CriarClienteBody.parse(req.body);

  let clienteId: number;
  if (id) {
    clienteId = id;
    await db.update(clientes).set(dados).where(eq(clientes.id, clienteId));
  } else {
    const [novo] = await db.insert(clientes).values(dados).returning();
    clienteId = novo.id;
  }

  await db.delete(clienteObrigacoes).where(eq(clienteObrigacoes.clienteId, clienteId));
  if (obrigacoes.length) {
    await db.insert(clienteObrigacoes).values(
      obrigacoes.map((t: number) => ({ clienteId, tipoObrigacaoId: t }))
    );
  }

  const [c] = await db.select().from(clientes).where(eq(clientes.id, clienteId));
  const vinculos = await db.select({ tipoObrigacaoId: clienteObrigacoes.tipoObrigacaoId })
    .from(clienteObrigacoes).where(eq(clienteObrigacoes.clienteId, clienteId));

  res.json({ ...c, obrigacoes: vinculos.map((v) => v.tipoObrigacaoId) });
});

// DELETE /api/clientes/:id
router.delete("/:id", async (req, res) => {
  const { id } = RemoverClienteParams.parse(req.params);
  await db.delete(clientes).where(eq(clientes.id, id));
  res.status(204).send();
});

export default router;
