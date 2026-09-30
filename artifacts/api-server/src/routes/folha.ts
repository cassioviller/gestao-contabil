import { Router } from "express";
import { and, asc, eq, isNotNull, isNull } from "drizzle-orm";
import { db, folhaLancamentos, funcionarios } from "@workspace/db";
import {
  AtualizarLancamentoFolhaBody,
  AtualizarLancamentoFolhaParams,
  ListarFolhaQueryParams,
  RemoverLancamentoFolhaParams,
  SalvarLancamentoFolhaBody,
} from "@workspace/api-zod";
import { HttpError } from "../lib/http";
import { contaDaRequisicao } from "../middlewares/autenticacao";
import { filtroEscopo } from "../lib/escopo";
import { consultaFolha } from "../lib/pessoal";

const router = Router();

/**
 * O funcionário citado no corpo tem que ser da conta de quem pede — o
 * lançamento carrega `contaId` próprio, e sem esta conferência daria para
 * gravar folha no funcionário de outro escritório.
 */
async function validarFuncionario(contaId: number, funcionarioId: number): Promise<void> {
  const [funcionario] = await db
    .select({ id: funcionarios.id })
    .from(funcionarios)
    .where(and(eq(funcionarios.id, funcionarioId), eq(funcionarios.contaId, contaId)));
  if (!funcionario) throw new HttpError(400, "Funcionário não encontrado.");
}

// GET /api/folha?ano=&mes=&escopo=&clienteId=
router.get("/", async (req, res) => {
  const contaId = contaDaRequisicao(req);
  const { ano, mes, escopo, clienteId } = ListarFolhaQueryParams.parse(req.query);

  const lista = await consultaFolha(
    contaId,
    eq(folhaLancamentos.ano, ano),
    eq(folhaLancamentos.mes, mes),
    filtroEscopo(escopo, funcionarios.clienteId, isNull, isNotNull),
    clienteId ? eq(funcionarios.clienteId, clienteId) : undefined,
  ).orderBy(asc(funcionarios.nome), asc(folhaLancamentos.tipo));

  res.json(lista);
});

// POST /api/folha (criar ou editar)
router.post("/", async (req, res) => {
  const contaId = contaDaRequisicao(req);
  const { id, ...dados } = SalvarLancamentoFolhaBody.parse(req.body);

  await validarFuncionario(contaId, dados.funcionarioId);

  let lancamentoId: number;
  if (id) {
    const [atualizado] = await db
      .update(folhaLancamentos)
      .set(dados)
      .where(and(eq(folhaLancamentos.id, id), eq(folhaLancamentos.contaId, contaId)))
      .returning({ id: folhaLancamentos.id });
    if (!atualizado) throw new HttpError(404, "Lançamento não encontrado.");
    lancamentoId = id;
  } else {
    // O índice único (funcionário, ano, mês, tipo) vira um upsert: refazer o
    // lançamento do mês corrige o que está lá em vez de estourar erro de chave.
    const [novo] = await db
      .insert(folhaLancamentos)
      .values({ ...dados, contaId })
      .onConflictDoUpdate({
        target: [
          folhaLancamentos.funcionarioId,
          folhaLancamentos.ano,
          folhaLancamentos.mes,
          folhaLancamentos.tipo,
        ],
        set: dados,
      })
      .returning({ id: folhaLancamentos.id });
    lancamentoId = novo.id;
  }

  const [salvo] = await consultaFolha(contaId, eq(folhaLancamentos.id, lancamentoId));
  res.json(salvo);
});

// PATCH /api/folha/:id
router.patch("/:id", async (req, res) => {
  const contaId = contaDaRequisicao(req);
  const { id } = AtualizarLancamentoFolhaParams.parse(req.params);
  const body = AtualizarLancamentoFolhaBody.parse(req.body);

  const mudancas = Object.fromEntries(
    Object.entries(body).filter(([, v]) => v !== undefined),
  );
  if (Object.keys(mudancas).length === 0) {
    throw new HttpError(400, "Nenhum campo para atualizar.");
  }

  const [atualizado] = await db
    .update(folhaLancamentos)
    .set(mudancas)
    .where(and(eq(folhaLancamentos.id, id), eq(folhaLancamentos.contaId, contaId)))
    .returning({ id: folhaLancamentos.id });
  if (!atualizado) throw new HttpError(404, "Lançamento não encontrado.");

  const [salvo] = await consultaFolha(contaId, eq(folhaLancamentos.id, id));
  res.json(salvo);
});

// DELETE /api/folha/:id
router.delete("/:id", async (req, res) => {
  const contaId = contaDaRequisicao(req);
  const { id } = RemoverLancamentoFolhaParams.parse(req.params);
  await db
    .delete(folhaLancamentos)
    .where(and(eq(folhaLancamentos.id, id), eq(folhaLancamentos.contaId, contaId)));
  res.status(204).send();
});

export default router;
