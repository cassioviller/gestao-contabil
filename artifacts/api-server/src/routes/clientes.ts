import { Router } from "express";
import { and, asc, eq, inArray } from "drizzle-orm";
import { db } from "@workspace/db";
import { clientes, clienteObrigacoes, tiposObrigacao } from "@workspace/db";
import {
  AtualizarClienteBody,
  AtualizarClienteParams,
  CriarClienteBody,
  RemoverClienteParams,
} from "@workspace/api-zod";
import { HttpError } from "../lib/http";
import { contaDaRequisicao } from "../middlewares/autenticacao";

const router = Router();

// GET /api/clientes
router.get("/", async (req, res) => {
  const contaId = contaDaRequisicao(req);

  const lista = await db
    .select()
    .from(clientes)
    .where(eq(clientes.contaId, contaId))
    .orderBy(asc(clientes.codigo), asc(clientes.razaoSocial));

  const mapaObrig: Record<number, number[]> = {};
  if (lista.length) {
    const vinculos = await db
      .select()
      .from(clienteObrigacoes)
      .where(
        inArray(
          clienteObrigacoes.clienteId,
          lista.map((c) => c.id),
        ),
      );
    for (const v of vinculos) (mapaObrig[v.clienteId] ??= []).push(v.tipoObrigacaoId);
  }

  res.json(lista.map((c) => ({ ...c, obrigacoes: mapaObrig[c.id] ?? [] })));
});

// POST /api/clientes (criar ou editar)
router.post("/", async (req, res) => {
  const contaId = contaDaRequisicao(req);
  // `obrigacoes` ausente = não mexer nos vínculos. Antes o padrão era `[]`, e
  // um POST só com o id desvinculava todas as obrigações do cliente.
  const { id, obrigacoes, ...dados } = CriarClienteBody.parse(req.body);

  // As obrigações vêm por id do corpo da requisição: sem esta conferência dava
  // para vincular o cliente a um tipo de outro escritório.
  if (obrigacoes?.length) {
    const validos = await db
      .select({ id: tiposObrigacao.id })
      .from(tiposObrigacao)
      .where(and(eq(tiposObrigacao.contaId, contaId), inArray(tiposObrigacao.id, obrigacoes)));
    if (validos.length !== new Set(obrigacoes).size) {
      throw new HttpError(400, "Obrigação inexistente.");
    }
  }

  // Cadastro e vínculos numa transação: uma falha no meio não pode deixar o
  // cliente sem nenhuma obrigação.
  const clienteId = await db.transaction(async (tx) => {
    let clienteId: number;
    if (id) {
      const [atualizado] = await tx
        .update(clientes)
        .set(dados)
        .where(and(eq(clientes.id, id), eq(clientes.contaId, contaId)))
        .returning({ id: clientes.id });
      if (!atualizado) throw new HttpError(404, "Cliente não encontrado.");
      clienteId = atualizado.id;
    } else {
      const [novo] = await tx
        .insert(clientes)
        .values({ ...dados, contaId })
        .returning({ id: clientes.id });
      clienteId = novo.id;
    }

    if (obrigacoes !== undefined) {
      await tx.delete(clienteObrigacoes).where(eq(clienteObrigacoes.clienteId, clienteId));
      if (obrigacoes.length) {
        await tx
          .insert(clienteObrigacoes)
          .values(obrigacoes.map((t: number) => ({ clienteId, tipoObrigacaoId: t })));
      }
    }
    return clienteId;
  });

  const [c] = await db
    .select()
    .from(clientes)
    .where(and(eq(clientes.id, clienteId), eq(clientes.contaId, contaId)));
  const vinculos = await db
    .select({ tipoObrigacaoId: clienteObrigacoes.tipoObrigacaoId })
    .from(clienteObrigacoes)
    .where(eq(clienteObrigacoes.clienteId, clienteId));

  res.json({ ...c, obrigacoes: vinculos.map((v) => v.tipoObrigacaoId) });
});

// PATCH /api/clientes/:id — edição campo a campo (tela de Dados cadastrais).
// Só grava as chaves presentes no body e não toca nas obrigações vinculadas.
router.patch("/:id", async (req, res) => {
  const contaId = contaDaRequisicao(req);
  const { id } = AtualizarClienteParams.parse(req.params);
  const body = AtualizarClienteBody.parse(req.body);

  const campos = Object.fromEntries(Object.entries(body).filter(([, v]) => v !== undefined));
  if (Object.keys(campos).length === 0) {
    throw new HttpError(400, "Nenhum campo para atualizar.");
  }

  const [atualizado] = await db
    .update(clientes)
    .set(campos)
    .where(and(eq(clientes.id, id), eq(clientes.contaId, contaId)))
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
  const contaId = contaDaRequisicao(req);
  const { id } = RemoverClienteParams.parse(req.params);
  await db.delete(clientes).where(and(eq(clientes.id, id), eq(clientes.contaId, contaId)));
  res.status(204).send();
});

export default router;
