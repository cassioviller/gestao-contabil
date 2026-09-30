import { Router } from "express";
import { and, asc, eq, isNotNull, isNull } from "drizzle-orm";
import { db, ferias, funcionarios } from "@workspace/db";
import {
  AtualizarFeriasBody,
  AtualizarFeriasParams,
  ListarFeriasQueryParams,
  RemoverFeriasParams,
  SalvarFeriasBody,
} from "@workspace/api-zod";
import { HttpError } from "../lib/http";
import { contaDaRequisicao } from "../middlewares/autenticacao";
import { filtroEscopo } from "../lib/escopo";
import { comVencimento, consultaFerias } from "../lib/pessoal";

const router = Router();

async function validarFuncionario(contaId: number, funcionarioId: number): Promise<void> {
  const [funcionario] = await db
    .select({ id: funcionarios.id })
    .from(funcionarios)
    .where(and(eq(funcionarios.id, funcionarioId), eq(funcionarios.contaId, contaId)));
  if (!funcionario) throw new HttpError(400, "Funcionário não encontrado.");
}

// GET /api/ferias?escopo=&clienteId=&funcionarioId=
router.get("/", async (req, res) => {
  const contaId = contaDaRequisicao(req);
  const { escopo, clienteId, funcionarioId } = ListarFeriasQueryParams.parse(req.query);

  const lista = await consultaFerias(
    contaId,
    filtroEscopo(escopo, funcionarios.clienteId, isNull, isNotNull),
    clienteId ? eq(funcionarios.clienteId, clienteId) : undefined,
    funcionarioId ? eq(ferias.funcionarioId, funcionarioId) : undefined,
  ).orderBy(asc(ferias.aquisitivoFim), asc(funcionarios.nome));

  res.json(lista.map((p) => comVencimento(p)));
});

// POST /api/ferias (criar ou editar)
router.post("/", async (req, res) => {
  const contaId = contaDaRequisicao(req);
  const { id, ...dados } = SalvarFeriasBody.parse(req.body);

  await validarFuncionario(contaId, dados.funcionarioId);
  if (dados.aquisitivoFim < dados.aquisitivoInicio) {
    throw new HttpError(400, "O fim do período aquisitivo é anterior ao início.");
  }

  let periodoId: number;
  if (id) {
    const [atualizado] = await db
      .update(ferias)
      .set(dados)
      .where(and(eq(ferias.id, id), eq(ferias.contaId, contaId)))
      .returning({ id: ferias.id });
    if (!atualizado) throw new HttpError(404, "Período não encontrado.");
    periodoId = id;
  } else {
    const [novo] = await db
      .insert(ferias)
      .values({ ...dados, contaId })
      .returning({ id: ferias.id });
    periodoId = novo.id;
  }

  const [salvo] = await consultaFerias(contaId, eq(ferias.id, periodoId));
  res.json(comVencimento(salvo));
});

// PATCH /api/ferias/:id
router.patch("/:id", async (req, res) => {
  const contaId = contaDaRequisicao(req);
  const { id } = AtualizarFeriasParams.parse(req.params);
  const body = AtualizarFeriasBody.parse(req.body);

  const mudancas = Object.fromEntries(Object.entries(body).filter(([, v]) => v !== undefined));
  if (Object.keys(mudancas).length === 0) {
    throw new HttpError(400, "Nenhum campo para atualizar.");
  }

  const [atualizado] = await db
    .update(ferias)
    .set(mudancas)
    .where(and(eq(ferias.id, id), eq(ferias.contaId, contaId)))
    .returning({ id: ferias.id });
  if (!atualizado) throw new HttpError(404, "Período não encontrado.");

  const [salvo] = await consultaFerias(contaId, eq(ferias.id, id));
  res.json(comVencimento(salvo));
});

// DELETE /api/ferias/:id
router.delete("/:id", async (req, res) => {
  const contaId = contaDaRequisicao(req);
  const { id } = RemoverFeriasParams.parse(req.params);
  await db.delete(ferias).where(and(eq(ferias.id, id), eq(ferias.contaId, contaId)));
  res.status(204).send();
});

export default router;
