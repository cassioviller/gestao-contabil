import { Router } from "express";
import { and, asc, eq, getTableColumns, inArray, sql } from "drizzle-orm";
import { cifrar, db, decifrar } from "@workspace/db";
import { clientes, clienteObrigacoes, tiposObrigacao } from "@workspace/db";
import {
  AtualizarClienteBody,
  AtualizarClienteParams,
  CriarClienteBody,
  GetSegredosClienteParams,
  RemoverClienteParams,
} from "@workspace/api-zod";
import { HttpError } from "../lib/http";
import { auditar } from "../lib/auditoria";
import { vincularObrigacoesAutomaticas } from "../lib/vinculos";
import { contaDaRequisicao, exigirPapel } from "../middlewares/autenticacao";

const router = Router();

/**
 * Projeção pública do cliente: tudo, menos as senhas. Elas ficam cifradas no
 * banco e só saem por `/clientes/:id/segredos`, uma de cada vez e com
 * registro na auditoria. A listagem diz apenas se existem.
 */
const {
  senhaGov: _senhaGov,
  senhaNfse: _senhaNfse,
  ...colunasPublicas
} = getTableColumns(clientes);
const projecao = {
  ...colunasPublicas,
  temSenhaGov: sql<boolean>`(${clientes.senhaGov} is not null)`,
  temSenhaNfse: sql<boolean>`(${clientes.senhaNfse} is not null)`,
};

type Segredos = { senhaGov?: string | null; senhaNfse?: string | null };

/** Cifra as senhas que vieram no corpo; chave ausente continua ausente (não mexe). */
function cifrarSegredos<T extends Segredos>(dados: T): T {
  const saida = { ...dados };
  if (saida.senhaGov !== undefined) saida.senhaGov = cifrar(saida.senhaGov);
  if (saida.senhaNfse !== undefined) saida.senhaNfse = cifrar(saida.senhaNfse);
  return saida;
}

function camposDeSegredo(dados: Segredos): string[] {
  return (["senhaGov", "senhaNfse"] as const).filter((c) => dados[c] !== undefined);
}

async function clienteComVinculos(contaId: number, clienteId: number) {
  const [c] = await db
    .select(projecao)
    .from(clientes)
    .where(and(eq(clientes.id, clienteId), eq(clientes.contaId, contaId)));
  if (!c) throw new HttpError(404, "Cliente não encontrado.");
  const vinculos = await db
    .select({ tipoObrigacaoId: clienteObrigacoes.tipoObrigacaoId })
    .from(clienteObrigacoes)
    .where(eq(clienteObrigacoes.clienteId, clienteId));
  return { ...c, obrigacoes: vinculos.map((v) => v.tipoObrigacaoId) };
}

// GET /api/clientes
router.get("/", async (req, res) => {
  const contaId = contaDaRequisicao(req);

  const lista = await db
    .select(projecao)
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
  const { id, obrigacoes, ...corpo } = CriarClienteBody.parse(req.body);
  const dados = cifrarSegredos(corpo);

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
    } else if (dados.regime !== undefined) {
      // Sem lista explícita, definir o regime vincula as obrigações padrão dele.
      await vincularObrigacoesAutomaticas(tx, contaId, clienteId);
    }
    for (const campo of camposDeSegredo(corpo)) {
      await auditar(
        req,
        { acao: "alterar_segredo", entidade: "cliente", entidadeId: clienteId, campo },
        tx,
      );
    }
    return clienteId;
  });

  res.json(await clienteComVinculos(contaId, clienteId));
});

// PATCH /api/clientes/:id — edição campo a campo (tela de Dados cadastrais).
// Só grava as chaves presentes no body e não toca nas obrigações vinculadas.
router.patch("/:id", async (req, res) => {
  const contaId = contaDaRequisicao(req);
  const { id } = AtualizarClienteParams.parse(req.params);
  const body = AtualizarClienteBody.parse(req.body);

  const campos = cifrarSegredos(
    Object.fromEntries(Object.entries(body).filter(([, v]) => v !== undefined)) as typeof body,
  );
  if (Object.keys(campos).length === 0) {
    throw new HttpError(400, "Nenhum campo para atualizar.");
  }

  const [atualizado] = await db
    .update(clientes)
    .set(campos)
    .where(and(eq(clientes.id, id), eq(clientes.contaId, contaId)))
    .returning({ id: clientes.id });
  if (!atualizado) throw new HttpError(404, "Cliente não encontrado.");

  // Trocar o regime na planilha vincula as obrigações padrão do regime novo
  // (só acrescenta; o que já estava marcado fica).
  if (campos.regime !== undefined) await vincularObrigacoesAutomaticas(db, contaId, id);

  for (const campo of camposDeSegredo(campos)) {
    await auditar(req, { acao: "alterar_segredo", entidade: "cliente", entidadeId: id, campo });
  }

  res.json(await clienteComVinculos(contaId, id));
});

// GET /api/clientes/:id/segredos — as senhas em claro, com auditoria.
// Auxiliar não revela: ele opera o checklist, não entra no gov.br pelo cliente.
router.get("/:id/segredos", exigirPapel("admin", "contador"), async (req, res) => {
  const contaId = contaDaRequisicao(req);
  const { id } = GetSegredosClienteParams.parse(req.params);

  const [c] = await db
    .select({ senhaGov: clientes.senhaGov, senhaNfse: clientes.senhaNfse })
    .from(clientes)
    .where(and(eq(clientes.id, id), eq(clientes.contaId, contaId)));
  if (!c) throw new HttpError(404, "Cliente não encontrado.");

  await auditar(req, {
    acao: "revelar_segredo",
    entidade: "cliente",
    entidadeId: id,
    campo: "senhaGov,senhaNfse",
  });
  res.json({ senhaGov: decifrar(c.senhaGov), senhaNfse: decifrar(c.senhaNfse) });
});

// DELETE /api/clientes/:id
router.delete("/:id", async (req, res) => {
  const contaId = contaDaRequisicao(req);
  const { id } = RemoverClienteParams.parse(req.params);
  const apagados = await db
    .delete(clientes)
    .where(and(eq(clientes.id, id), eq(clientes.contaId, contaId)))
    .returning({ id: clientes.id, razaoSocial: clientes.razaoSocial });
  if (apagados.length) {
    await auditar(req, {
      acao: "excluir_cliente",
      entidade: "cliente",
      entidadeId: id,
      de: apagados[0].razaoSocial,
    });
  }
  res.status(204).send();
});

export default router;
