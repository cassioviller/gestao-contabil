import { Router } from "express";
import { asc, eq } from "drizzle-orm";
import { db } from "@workspace/db";
import { clientes, credenciais } from "@workspace/db";
import {
  AtualizarCredencialBody,
  AtualizarCredencialParams,
  RemoverCredencialParams,
  SalvarCredencialBody,
} from "@workspace/api-zod";
import { HttpError } from "../lib/http";

const router = Router();

const campos = {
  id: credenciais.id,
  clienteId: credenciais.clienteId,
  clienteNome: clientes.razaoSocial,
  tipoObrigacaoId: credenciais.tipoObrigacaoId,
  rotulo: credenciais.rotulo,
  login: credenciais.login,
  senha: credenciais.senha,
  observacao: credenciais.observacao,
};

function consulta() {
  return db.select(campos).from(credenciais).innerJoin(clientes, eq(credenciais.clienteId, clientes.id));
}

// GET /api/credenciais
router.get("/", async (_req, res) => {
  const lista = await consulta().orderBy(asc(clientes.razaoSocial), asc(credenciais.rotulo));
  res.json(lista);
});

// POST /api/credenciais (criar ou editar)
router.post("/", async (req, res) => {
  const { id, ...dados } = SalvarCredencialBody.parse(req.body);

  const [cliente] = await db.select({ id: clientes.id }).from(clientes).where(eq(clientes.id, dados.clienteId));
  if (!cliente) throw new HttpError(400, "Cliente não encontrado.");

  let credencialId: number;
  if (id) {
    await db.update(credenciais).set(dados).where(eq(credenciais.id, id));
    credencialId = id;
  } else {
    const [nova] = await db.insert(credenciais).values(dados).returning({ id: credenciais.id });
    credencialId = nova.id;
  }

  const [salva] = await consulta().where(eq(credenciais.id, credencialId));
  res.json(salva);
});

// PATCH /api/credenciais/:id — edição célula a célula
router.patch("/:id", async (req, res) => {
  const { id } = AtualizarCredencialParams.parse(req.params);
  const body = AtualizarCredencialBody.parse(req.body);

  const mudancas = Object.fromEntries(Object.entries(body).filter(([, v]) => v !== undefined));
  if (Object.keys(mudancas).length === 0) throw new HttpError(400, "Nenhum campo para atualizar.");

  const [atualizada] = await db
    .update(credenciais)
    .set(mudancas)
    .where(eq(credenciais.id, id))
    .returning({ id: credenciais.id });
  if (!atualizada) throw new HttpError(404, "Credencial não encontrada.");

  const [salva] = await consulta().where(eq(credenciais.id, id));
  res.json(salva);
});

// DELETE /api/credenciais/:id
router.delete("/:id", async (req, res) => {
  const { id } = RemoverCredencialParams.parse(req.params);
  await db.delete(credenciais).where(eq(credenciais.id, id));
  res.status(204).send();
});

export default router;
