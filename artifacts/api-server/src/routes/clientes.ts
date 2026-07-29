import { Router } from "express";
import { asc, eq } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  clientes,
  clienteObrigacoes,
} from "@workspace/db";
import {
  AtualizarClienteBody,
  AtualizarClienteParams,
  CriarClienteBody,
  RemoverClienteParams,
} from "@workspace/api-zod";
import { HttpError } from "../lib/http";

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

// PATCH /api/clientes/:id — edição campo a campo (tela de Dados cadastrais).
// Só grava as chaves presentes no body e não toca nas obrigações vinculadas.
router.patch("/:id", async (req, res) => {
  const { id } = AtualizarClienteParams.parse(req.params);
  const body = AtualizarClienteBody.parse(req.body);

  const campos = Object.fromEntries(
    Object.entries(body).filter(([, v]) => v !== undefined)
  );
  if (Object.keys(campos).length === 0) {
    throw new HttpError(400, "Nenhum campo para atualizar.");
  }

  const [atualizado] = await db
    .update(clientes)
    .set(campos)
    .where(eq(clientes.id, id))
    .returning();
  if (!atualizado) throw new HttpError(404, "Cliente não encontrado.");

  const vinculos = await db
    .select({ tipoObrigacaoId: clienteObrigacoes.tipoObrigacaoId })
    .from(clienteObrigacoes)
    .where(eq(clienteObrigacoes.clienteId, id));

  res.json({ ...atualizado, obrigacoes: vinculos.map((v) => v.tipoObrigacaoId) });
});

// DELETE /api/clientes/:id
router.delete("/:id", async (req, res) => {
  const { id } = RemoverClienteParams.parse(req.params);
  await db.delete(clientes).where(eq(clientes.id, id));
  res.status(204).send();
});

export default router;
