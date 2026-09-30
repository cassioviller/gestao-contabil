import { Router } from "express";
import { and, asc, eq, sql, type SQL } from "drizzle-orm";
import { db } from "@workspace/db";
import { clientes, debitos, tiposObrigacao } from "@workspace/db";
import {
  AtualizarDebitoBody,
  AtualizarDebitoParams,
  ListarDebitosQueryParams,
  RemoverDebitoParams,
  SalvarDebitoBody,
} from "@workspace/api-zod";
import { HttpError } from "../lib/http";
import { contaDaRequisicao } from "../middlewares/autenticacao";

const router = Router();

const campos = {
  id: debitos.id,
  clienteId: debitos.clienteId,
  clienteNome: clientes.razaoSocial,
  tipoObrigacaoId: debitos.tipoObrigacaoId,
  rotulo: debitos.rotulo,
  competenciaRef: debitos.competenciaRef,
  vencimento: debitos.vencimento,
  valor: debitos.valor,
  status: debitos.status,
  observacao: debitos.observacao,
};

/** O filtro de conta é o primeiro argumento — nunca um `.where()` opcional. */
function consulta(contaId: number, ...extras: Array<SQL | undefined>) {
  return db
    .select(campos)
    .from(debitos)
    .innerJoin(clientes, eq(debitos.clienteId, clientes.id))
    .where(and(eq(debitos.contaId, contaId), ...extras));
}

/** Confere que cliente e obrigação citados no corpo são da conta de quem pede. */
async function validarVinculos(
  contaId: number,
  clienteId: number,
  tipoObrigacaoId: number | null | undefined,
): Promise<void> {
  const [cliente] = await db
    .select({ id: clientes.id })
    .from(clientes)
    .where(and(eq(clientes.id, clienteId), eq(clientes.contaId, contaId)));
  if (!cliente) throw new HttpError(400, "Cliente não encontrado.");

  if (tipoObrigacaoId != null) {
    const [tipo] = await db
      .select({ id: tiposObrigacao.id })
      .from(tiposObrigacao)
      .where(and(eq(tiposObrigacao.id, tipoObrigacaoId), eq(tiposObrigacao.contaId, contaId)));
    if (!tipo) throw new HttpError(400, "Obrigação não encontrada.");
  }
}

// GET /api/debitos?status=&clienteId=
router.get("/", async (req, res) => {
  const contaId = contaDaRequisicao(req);
  const { status, clienteId } = ListarDebitosQueryParams.parse(req.query);

  const lista = await consulta(
    contaId,
    status ? eq(debitos.status, status) : undefined,
    clienteId ? eq(debitos.clienteId, clienteId) : undefined,
  )
    // Vencimento mais antigo primeiro; sem vencimento vai para o fim.
    .orderBy(sql`${debitos.vencimento} asc nulls last`, asc(clientes.razaoSocial));

  res.json(lista);
});

// POST /api/debitos (criar ou editar)
router.post("/", async (req, res) => {
  const contaId = contaDaRequisicao(req);
  const { id, ...dados } = SalvarDebitoBody.parse(req.body);

  await validarVinculos(contaId, dados.clienteId, dados.tipoObrigacaoId);

  let debitoId: number;
  if (id) {
    const [atualizado] = await db
      .update(debitos)
      .set(dados)
      .where(and(eq(debitos.id, id), eq(debitos.contaId, contaId)))
      .returning({ id: debitos.id });
    if (!atualizado) throw new HttpError(404, "Débito não encontrado.");
    debitoId = id;
  } else {
    const [novo] = await db
      .insert(debitos)
      .values({ ...dados, contaId })
      .returning({ id: debitos.id });
    debitoId = novo.id;
  }

  const [salvo] = await consulta(contaId, eq(debitos.id, debitoId));
  res.json(salvo);
});

// PATCH /api/debitos/:id — edição célula a célula
router.patch("/:id", async (req, res) => {
  const contaId = contaDaRequisicao(req);
  const { id } = AtualizarDebitoParams.parse(req.params);
  const body = AtualizarDebitoBody.parse(req.body);

  const mudancas = Object.fromEntries(Object.entries(body).filter(([, v]) => v !== undefined));
  if (Object.keys(mudancas).length === 0) throw new HttpError(400, "Nenhum campo para atualizar.");

  if (mudancas.clienteId !== undefined || mudancas.tipoObrigacaoId !== undefined) {
    const [atual] = await db
      .select({ clienteId: debitos.clienteId })
      .from(debitos)
      .where(and(eq(debitos.id, id), eq(debitos.contaId, contaId)));
    if (!atual) throw new HttpError(404, "Débito não encontrado.");
    await validarVinculos(
      contaId,
      (mudancas.clienteId as number | undefined) ?? atual.clienteId,
      mudancas.tipoObrigacaoId as number | null | undefined,
    );
  }

  const [atualizado] = await db
    .update(debitos)
    .set(mudancas)
    .where(and(eq(debitos.id, id), eq(debitos.contaId, contaId)))
    .returning({ id: debitos.id });
  if (!atualizado) throw new HttpError(404, "Débito não encontrado.");

  const [salvo] = await consulta(contaId, eq(debitos.id, id));
  res.json(salvo);
});

// DELETE /api/debitos/:id
router.delete("/:id", async (req, res) => {
  const contaId = contaDaRequisicao(req);
  const { id } = RemoverDebitoParams.parse(req.params);
  await db.delete(debitos).where(and(eq(debitos.id, id), eq(debitos.contaId, contaId)));
  res.status(204).send();
});

export default router;
