import { Router } from "express";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@workspace/db";
import { tiposObrigacao } from "@workspace/db";
import { SalvarTipoBody, RemoverTipoParams } from "@workspace/api-zod";
import { HttpError } from "../lib/http";
import { auditar } from "../lib/auditoria";
import { vincularObrigacoesAutomaticas } from "../lib/vinculos";
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
  const nome = dados.nome.trim();
  if (!nome) throw new HttpError(400, "A obrigação precisa de um nome.");

  if (id) {
    const [atualizado] = await db
      .update(tiposObrigacao)
      .set({ ...dados, nome })
      .where(and(eq(tiposObrigacao.id, id), eq(tiposObrigacao.contaId, contaId)))
      .returning();
    if (!atualizado) throw new HttpError(404, "Tipo de obrigação não encontrado.");
    res.json(atualizado);
  } else {
    const [t] = await db
      .insert(tiposObrigacao)
      .values({ ...dados, nome, contaId })
      .returning();
    res.json(t);
  }
});

// POST /api/tipos/vincular-automaticos — põe a base em dia com o catálogo.
router.post("/vincular-automaticos", async (req, res) => {
  const contaId = contaDaRequisicao(req);
  const vinculosCriados = await vincularObrigacoesAutomaticas(db, contaId);
  if (vinculosCriados > 0) {
    await auditar(req, {
      acao: "vincular_automaticas",
      entidade: "conta",
      entidadeId: contaId,
      para: String(vinculosCriados),
    });
  }
  res.json({ vinculosCriados });
});

// DELETE /api/tipos/:id
router.delete("/:id", async (req, res) => {
  const contaId = contaDaRequisicao(req);
  const { id } = RemoverTipoParams.parse(req.params);
  const apagados = await db
    .delete(tiposObrigacao)
    .where(and(eq(tiposObrigacao.id, id), eq(tiposObrigacao.contaId, contaId)))
    .returning({ nome: tiposObrigacao.nome });
  if (apagados.length) {
    await auditar(req, {
      acao: "excluir_tipo",
      entidade: "tipo_obrigacao",
      entidadeId: id,
      de: apagados[0].nome,
    });
  }
  res.status(204).send();
});

export default router;
