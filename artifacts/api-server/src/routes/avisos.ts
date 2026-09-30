import { Router } from "express";
import { and, desc, eq } from "drizzle-orm";
import { avisos, clientes, db } from "@workspace/db";
import { CriarAvisoBody, ListarAvisosQueryParams, ReenviarAvisoParams } from "@workspace/api-zod";
import { HttpError } from "../lib/http";
import { auditar } from "../lib/auditoria";
import { contaDaRequisicao, exigirPapel } from "../middlewares/autenticacao";
import { criarAviso, destinoDoCliente } from "../servicos/avisos";
import { enfileirar } from "../servicos/jobs";

const router = Router();

const projecao = {
  id: avisos.id,
  clienteId: avisos.clienteId,
  clienteNome: clientes.razaoSocial,
  canal: avisos.canal,
  destino: avisos.destino,
  modelo: avisos.modelo,
  assunto: avisos.assunto,
  corpo: avisos.corpo,
  status: avisos.status,
  tentativas: avisos.tentativas,
  provedorId: avisos.provedorId,
  erro: avisos.erro,
  referenciaEntidade: avisos.referenciaEntidade,
  referenciaId: avisos.referenciaId,
  enviadoEm: avisos.enviadoEm,
  criadoEm: avisos.criadoEm,
};

function consulta(contaId: number, ...extras: Array<ReturnType<typeof eq>>) {
  return db
    .select(projecao)
    .from(avisos)
    .leftJoin(clientes, eq(clientes.id, avisos.clienteId))
    .where(and(eq(avisos.contaId, contaId), ...extras));
}

// GET /api/avisos
router.get("/", async (req, res) => {
  const contaId = contaDaRequisicao(req);
  const { status, clienteId } = ListarAvisosQueryParams.parse(req.query);
  const extras: Array<ReturnType<typeof eq>> = [];
  if (status) extras.push(eq(avisos.status, status));
  if (clienteId) extras.push(eq(avisos.clienteId, clienteId));
  const lista = await consulta(contaId, ...extras)
    .orderBy(desc(avisos.id))
    .limit(200);
  res.json(lista);
});

// POST /api/avisos — aviso avulso (a contadora escreve; a fila envia).
router.post("/", exigirPapel("admin", "contador"), async (req, res) => {
  const contaId = contaDaRequisicao(req);
  const { clienteId, canal, assunto, corpo } = CriarAvisoBody.parse(req.body);

  const destino = await destinoDoCliente(contaId, clienteId, canal);
  if (!destino) throw new HttpError(404, "Cliente não encontrado.");
  if (canal !== "portal" && !destino.destino) {
    throw new HttpError(
      400,
      canal === "email"
        ? "O cliente não tem e-mail cadastrado."
        : "O cliente não tem WhatsApp cadastrado.",
      undefined,
      "sem_destino",
    );
  }

  const id = await db.transaction(async (tx) =>
    criarAviso(tx, {
      contaId,
      clienteId,
      canal,
      destino: destino.destino,
      modelo: "manual",
      assunto: assunto ?? null,
      corpo,
    }),
  );
  await auditar(req, { acao: "criar_aviso", entidade: "aviso", entidadeId: id, para: canal });
  const [salvo] = await consulta(contaId, eq(avisos.id, id));
  res.json(salvo);
});

// POST /api/avisos/:id/reenviar
router.post("/:id/reenviar", exigirPapel("admin", "contador"), async (req, res) => {
  const contaId = contaDaRequisicao(req);
  const { id } = ReenviarAvisoParams.parse(req.params);
  const [a] = await db
    .update(avisos)
    .set({ status: "pendente", erro: null })
    .where(and(eq(avisos.id, id), eq(avisos.contaId, contaId)))
    .returning({ id: avisos.id });
  if (!a) throw new HttpError(404, "Aviso não encontrado.");
  await enfileirar(db, { tipo: "avisos.enviar", dados: { avisoId: id }, contaId });
  const [salvo] = await consulta(contaId, eq(avisos.id, id));
  res.json(salvo);
});

export default router;
