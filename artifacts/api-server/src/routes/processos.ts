import { Router } from "express";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { clientes, processos, processoEtapas } from "@workspace/db";
import {
  AdicionarEtapaBody,
  AdicionarEtapaParams,
  GetProcessoParams,
  ListarProcessosQueryParams,
  RemoverProcessoParams,
  SalvarProcessoBody,
} from "@workspace/api-zod";
import { HttpError } from "../lib/http";

const router = Router();

/** Colunas do processo + nome do cliente + progresso do checklist. */
const camposProcesso = {
  id: processos.id,
  clienteId: processos.clienteId,
  clienteNome: clientes.razaoSocial,
  categoria: processos.categoria,
  tipo: processos.tipo,
  titulo: processos.titulo,
  status: processos.status,
  orgao: processos.orgao,
  protocolo: processos.protocolo,
  abertoEm: processos.abertoEm,
  prazo: processos.prazo,
  concluidoEm: processos.concluidoEm,
  observacao: processos.observacao,
  totalEtapas: sql<number>`(
    select count(*)::int from ${processoEtapas} where ${processoEtapas.processoId} = ${processos.id}
  )`.as("total_etapas"),
  etapasFeitas: sql<number>`(
    select count(*)::int from ${processoEtapas}
    where ${processoEtapas.processoId} = ${processos.id} and ${processoEtapas.feito}
  )`.as("etapas_feitas"),
};

function consultaProcessos() {
  return db.select(camposProcesso).from(processos).innerJoin(clientes, eq(processos.clienteId, clientes.id));
}

// GET /api/processos?status=&clienteId=
router.get("/", async (req, res) => {
  const { status, clienteId, categoria } = ListarProcessosQueryParams.parse(req.query);

  const filtros = [
    status ? eq(processos.status, status) : undefined,
    clienteId ? eq(processos.clienteId, clienteId) : undefined,
    categoria ? eq(processos.categoria, categoria) : undefined,
  ].filter(Boolean);

  const lista = await consultaProcessos()
    .where(filtros.length ? and(...filtros) : undefined)
    // Sem prazo cai para o fim da lista; entre os que têm, o mais apertado primeiro.
    .orderBy(sql`${processos.prazo} asc nulls last`, desc(processos.id));

  res.json(lista);
});

// POST /api/processos (criar ou editar)
router.post("/", async (req, res) => {
  const { id, ...dados } = SalvarProcessoBody.parse(req.body);

  const [cliente] = await db.select({ id: clientes.id }).from(clientes).where(eq(clientes.id, dados.clienteId));
  if (!cliente) throw new HttpError(400, "Cliente não encontrado.");

  let processoId: number;
  if (id) {
    const [existente] = await db.select({ id: processos.id }).from(processos).where(eq(processos.id, id));
    if (!existente) throw new HttpError(404, "Processo não encontrado.");
    await db.update(processos).set(dados).where(eq(processos.id, id));
    processoId = id;
  } else {
    const [novo] = await db
      .insert(processos)
      .values({ ...dados, abertoEm: dados.abertoEm ?? new Date().toISOString().slice(0, 10) })
      .returning({ id: processos.id });
    processoId = novo.id;
  }

  const [salvo] = await consultaProcessos().where(eq(processos.id, processoId));
  res.json(salvo);
});

// GET /api/processos/:id — processo + checklist
router.get("/:id", async (req, res) => {
  const { id } = GetProcessoParams.parse(req.params);

  const [processo] = await consultaProcessos().where(eq(processos.id, id));
  if (!processo) throw new HttpError(404, "Processo não encontrado.");

  const etapas = await db
    .select()
    .from(processoEtapas)
    .where(eq(processoEtapas.processoId, id))
    .orderBy(asc(processoEtapas.ordem), asc(processoEtapas.id));

  res.json({ ...processo, etapas });
});

// DELETE /api/processos/:id (as etapas caem junto por cascade)
router.delete("/:id", async (req, res) => {
  const { id } = RemoverProcessoParams.parse(req.params);
  await db.delete(processos).where(eq(processos.id, id));
  res.status(204).send();
});

// POST /api/processos/:id/etapas — adiciona ao fim do checklist
router.post("/:id/etapas", async (req, res) => {
  const { id } = AdicionarEtapaParams.parse(req.params);
  const dados = AdicionarEtapaBody.parse(req.body);

  const [processo] = await db.select({ id: processos.id }).from(processos).where(eq(processos.id, id));
  if (!processo) throw new HttpError(404, "Processo não encontrado.");

  const [{ proxima }] = await db
    .select({ proxima: sql<number>`coalesce(max(${processoEtapas.ordem}), 0) + 1` })
    .from(processoEtapas)
    .where(eq(processoEtapas.processoId, id));

  const [etapa] = await db
    .insert(processoEtapas)
    .values({ processoId: id, descricao: dados.descricao, observacao: dados.observacao, ordem: proxima })
    .returning();

  res.json(etapa);
});

export default router;
