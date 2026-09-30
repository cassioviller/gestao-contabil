import { Router } from "express";
import { and, asc, eq, sql } from "drizzle-orm";
import { cifrar, db, decifrar } from "@workspace/db";
import { clientes, credenciais, tiposObrigacao } from "@workspace/db";
import {
  AtualizarCredencialBody,
  AtualizarCredencialParams,
  GetSenhaCredencialParams,
  RemoverCredencialParams,
  SalvarCredencialBody,
} from "@workspace/api-zod";
import { HttpError } from "../lib/http";
import { auditar } from "../lib/auditoria";
import { contaDaRequisicao, exigirPapel } from "../middlewares/autenticacao";

const router = Router();

const campos = {
  id: credenciais.id,
  clienteId: credenciais.clienteId,
  clienteNome: clientes.razaoSocial,
  tipoObrigacaoId: credenciais.tipoObrigacaoId,
  rotulo: credenciais.rotulo,
  login: credenciais.login,
  // A senha fica cifrada e só sai por `/credenciais/:id/senha`, com auditoria.
  temSenha: sql<boolean>`(${credenciais.senha} is not null)`,
  observacao: credenciais.observacao,
};

/**
 * Toda leitura entra por aqui e o filtro de conta é o primeiro argumento, não um
 * `.where()` que o chamador pode esquecer — ou sobrescrever, já que no Drizzle o
 * segundo `.where()` substitui o primeiro.
 */
function consulta(contaId: number, ...extras: Array<ReturnType<typeof eq>>) {
  return db
    .select(campos)
    .from(credenciais)
    .innerJoin(clientes, eq(credenciais.clienteId, clientes.id))
    .where(and(eq(credenciais.contaId, contaId), ...extras));
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

// GET /api/credenciais
router.get("/", async (req, res) => {
  const contaId = contaDaRequisicao(req);
  const lista = await consulta(contaId).orderBy(asc(clientes.razaoSocial), asc(credenciais.rotulo));
  res.json(lista);
});

// POST /api/credenciais (criar ou editar)
router.post("/", async (req, res) => {
  const contaId = contaDaRequisicao(req);
  const { id, ...dados } = SalvarCredencialBody.parse(req.body);
  if (dados.senha !== undefined) dados.senha = cifrar(dados.senha);

  await validarVinculos(contaId, dados.clienteId, dados.tipoObrigacaoId);

  let credencialId: number;
  if (id) {
    const [atualizada] = await db
      .update(credenciais)
      .set(dados)
      .where(and(eq(credenciais.id, id), eq(credenciais.contaId, contaId)))
      .returning({ id: credenciais.id });
    if (!atualizada) throw new HttpError(404, "Credencial não encontrada.");
    credencialId = id;
  } else {
    const [nova] = await db
      .insert(credenciais)
      .values({ ...dados, contaId })
      .returning({ id: credenciais.id });
    credencialId = nova.id;
  }

  if (dados.senha !== undefined) {
    await auditar(req, {
      acao: "alterar_segredo",
      entidade: "credencial",
      entidadeId: credencialId,
      campo: "senha",
    });
  }

  const [salva] = await consulta(contaId, eq(credenciais.id, credencialId));
  res.json(salva);
});

// PATCH /api/credenciais/:id — edição célula a célula
router.patch("/:id", async (req, res) => {
  const contaId = contaDaRequisicao(req);
  const { id } = AtualizarCredencialParams.parse(req.params);
  const body = AtualizarCredencialBody.parse(req.body);

  const mudancas = Object.fromEntries(Object.entries(body).filter(([, v]) => v !== undefined));
  if (Object.keys(mudancas).length === 0) throw new HttpError(400, "Nenhum campo para atualizar.");
  if ("senha" in mudancas) mudancas.senha = cifrar(mudancas.senha as string | null);

  if (mudancas.clienteId !== undefined || mudancas.tipoObrigacaoId !== undefined) {
    const [atual] = await db
      .select({ clienteId: credenciais.clienteId })
      .from(credenciais)
      .where(and(eq(credenciais.id, id), eq(credenciais.contaId, contaId)));
    if (!atual) throw new HttpError(404, "Credencial não encontrada.");
    await validarVinculos(
      contaId,
      (mudancas.clienteId as number | undefined) ?? atual.clienteId,
      mudancas.tipoObrigacaoId as number | null | undefined,
    );
  }

  const [atualizada] = await db
    .update(credenciais)
    .set(mudancas)
    .where(and(eq(credenciais.id, id), eq(credenciais.contaId, contaId)))
    .returning({ id: credenciais.id });
  if (!atualizada) throw new HttpError(404, "Credencial não encontrada.");
  if ("senha" in mudancas) {
    await auditar(req, {
      acao: "alterar_segredo",
      entidade: "credencial",
      entidadeId: id,
      campo: "senha",
    });
  }

  const [salva] = await consulta(contaId, eq(credenciais.id, id));
  res.json(salva);
});

// GET /api/credenciais/:id/senha — a senha em claro, com auditoria.
router.get("/:id/senha", exigirPapel("admin", "contador"), async (req, res) => {
  const contaId = contaDaRequisicao(req);
  const { id } = GetSenhaCredencialParams.parse(req.params);
  const [c] = await db
    .select({ senha: credenciais.senha })
    .from(credenciais)
    .where(and(eq(credenciais.id, id), eq(credenciais.contaId, contaId)));
  if (!c) throw new HttpError(404, "Credencial não encontrada.");
  await auditar(req, {
    acao: "revelar_segredo",
    entidade: "credencial",
    entidadeId: id,
    campo: "senha",
  });
  res.json({ senha: decifrar(c.senha) });
});

// DELETE /api/credenciais/:id
router.delete("/:id", async (req, res) => {
  const contaId = contaDaRequisicao(req);
  const { id } = RemoverCredencialParams.parse(req.params);
  await db.delete(credenciais).where(and(eq(credenciais.id, id), eq(credenciais.contaId, contaId)));
  res.status(204).send();
});

export default router;
