import { Router } from "express";
import { and, desc, eq, isNotNull, isNull, sql, type SQL } from "drizzle-orm";
import { clientes, db, despesas } from "@workspace/db";
import {
  AtualizarDespesaBody,
  AtualizarDespesaParams,
  ListarDespesasQueryParams,
  RemoverDespesaParams,
  SalvarDespesaBody,
} from "@workspace/api-zod";
import { HttpError } from "../lib/http";
import { contaDaRequisicao } from "../middlewares/autenticacao";
import { filtroEscopo, validarCliente } from "../lib/escopo";

const router = Router();

const campos = {
  id: despesas.id,
  clienteId: despesas.clienteId,
  clienteNome: clientes.razaoSocial,
  data: despesas.data,
  categoria: despesas.categoria,
  descricao: despesas.descricao,
  valor: despesas.valor,
  vencimento: despesas.vencimento,
  formaPagamento: despesas.formaPagamento,
  pago: despesas.pago,
  observacao: despesas.observacao,
};

/**
 * `leftJoin` e não `innerJoin`: despesa do próprio escritório não tem cliente, e
 * o join interno a esconderia da lista.
 */
function consulta(contaId: number, ...extras: Array<SQL | undefined>) {
  return db
    .select(campos)
    .from(despesas)
    .leftJoin(clientes, eq(despesas.clienteId, clientes.id))
    .where(and(eq(despesas.contaId, contaId), ...extras));
}

// GET /api/despesas?escopo=&clienteId=&ano=&mes=
router.get("/", async (req, res) => {
  const contaId = contaDaRequisicao(req);
  const { escopo, clienteId, ano, mes } = ListarDespesasQueryParams.parse(req.query);

  const lista = await consulta(
    contaId,
    filtroEscopo(escopo, despesas.clienteId, isNull, isNotNull),
    clienteId ? eq(despesas.clienteId, clienteId) : undefined,
    ano ? sql`extract(year from ${despesas.data}) = ${ano}` : undefined,
    mes ? sql`extract(month from ${despesas.data}) = ${mes}` : undefined,
  ).orderBy(desc(despesas.data), desc(despesas.id));

  res.json(lista);
});

// POST /api/despesas (criar ou editar)
router.post("/", async (req, res) => {
  const contaId = contaDaRequisicao(req);
  const { id, ...dados } = SalvarDespesaBody.parse(req.body);

  await validarCliente(contaId, dados.clienteId);

  let despesaId: number;
  if (id) {
    const [atualizada] = await db
      .update(despesas)
      .set(dados)
      .where(and(eq(despesas.id, id), eq(despesas.contaId, contaId)))
      .returning({ id: despesas.id });
    if (!atualizada) throw new HttpError(404, "Despesa não encontrada.");
    despesaId = id;
  } else {
    const [nova] = await db
      .insert(despesas)
      .values({ ...dados, contaId })
      .returning({ id: despesas.id });
    despesaId = nova.id;
  }

  const [salva] = await consulta(contaId, eq(despesas.id, despesaId));
  res.json(salva);
});

// PATCH /api/despesas/:id — edição célula a célula
router.patch("/:id", async (req, res) => {
  const contaId = contaDaRequisicao(req);
  const { id } = AtualizarDespesaParams.parse(req.params);
  const body = AtualizarDespesaBody.parse(req.body);

  const mudancas = Object.fromEntries(Object.entries(body).filter(([, v]) => v !== undefined));
  if (Object.keys(mudancas).length === 0) {
    throw new HttpError(400, "Nenhum campo para atualizar.");
  }

  if ("clienteId" in mudancas) {
    await validarCliente(contaId, mudancas.clienteId as number | null);
  }

  const [atualizada] = await db
    .update(despesas)
    .set(mudancas)
    .where(and(eq(despesas.id, id), eq(despesas.contaId, contaId)))
    .returning({ id: despesas.id });
  if (!atualizada) throw new HttpError(404, "Despesa não encontrada.");

  const [salva] = await consulta(contaId, eq(despesas.id, id));
  res.json(salva);
});

// DELETE /api/despesas/:id
router.delete("/:id", async (req, res) => {
  const contaId = contaDaRequisicao(req);
  const { id } = RemoverDespesaParams.parse(req.params);
  await db.delete(despesas).where(and(eq(despesas.id, id), eq(despesas.contaId, contaId)));
  res.status(204).send();
});

export default router;
