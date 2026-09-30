import { Router } from "express";
import { and, asc, desc, eq, isNotNull, isNull, type SQL } from "drizzle-orm";
import { clientes, db, ferias, folhaLancamentos, funcionarios } from "@workspace/db";
import {
  AtualizarFuncionarioBody,
  AtualizarFuncionarioParams,
  GetFuncionarioParams,
  ListarFuncionariosQueryParams,
  RemoverFuncionarioParams,
  SalvarFuncionarioBody,
} from "@workspace/api-zod";
import { HttpError } from "../lib/http";
import { contaDaRequisicao } from "../middlewares/autenticacao";
import { filtroEscopo, validarCliente } from "../lib/escopo";
import { comVencimento, consultaFerias, consultaFolha } from "../lib/pessoal";

const router = Router();

const campos = {
  id: funcionarios.id,
  clienteId: funcionarios.clienteId,
  clienteNome: clientes.razaoSocial,
  nome: funcionarios.nome,
  cpf: funcionarios.cpf,
  rg: funcionarios.rg,
  pis: funcionarios.pis,
  ctps: funcionarios.ctps,
  nascimento: funcionarios.nascimento,
  cargo: funcionarios.cargo,
  admissao: funcionarios.admissao,
  demissao: funcionarios.demissao,
  salario: funcionarios.salario,
  situacao: funcionarios.situacao,
  telefone: funcionarios.telefone,
  email: funcionarios.email,
  endereco: funcionarios.endereco,
  observacao: funcionarios.observacao,
};

/** `leftJoin`: funcionário do próprio escritório não tem cliente. */
function consulta(contaId: number, ...extras: Array<SQL | undefined>) {
  return db
    .select(campos)
    .from(funcionarios)
    .leftJoin(clientes, eq(funcionarios.clienteId, clientes.id))
    .where(and(eq(funcionarios.contaId, contaId), ...extras));
}

// GET /api/funcionarios?escopo=&clienteId=&situacao=
router.get("/", async (req, res) => {
  const contaId = contaDaRequisicao(req);
  const { escopo, clienteId, situacao } = ListarFuncionariosQueryParams.parse(req.query);

  const lista = await consulta(
    contaId,
    filtroEscopo(escopo, funcionarios.clienteId, isNull, isNotNull),
    clienteId ? eq(funcionarios.clienteId, clienteId) : undefined,
    situacao ? eq(funcionarios.situacao, situacao) : undefined,
  ).orderBy(asc(funcionarios.nome));

  res.json(lista);
});

// GET /api/funcionarios/:id — ficha com folha e férias
router.get("/:id", async (req, res) => {
  const contaId = contaDaRequisicao(req);
  const { id } = GetFuncionarioParams.parse(req.params);

  const [funcionario] = await consulta(contaId, eq(funcionarios.id, id));
  if (!funcionario) throw new HttpError(404, "Funcionário não encontrado.");

  const folha = await consultaFolha(contaId, eq(folhaLancamentos.funcionarioId, id)).orderBy(
    desc(folhaLancamentos.ano),
    desc(folhaLancamentos.mes),
  );

  const periodos = await consultaFerias(contaId, eq(ferias.funcionarioId, id)).orderBy(
    desc(ferias.aquisitivoFim),
  );

  res.json({ funcionario, folha, ferias: periodos.map((p) => comVencimento(p)) });
});

// POST /api/funcionarios (criar ou editar)
router.post("/", async (req, res) => {
  const contaId = contaDaRequisicao(req);
  const { id, ...dados } = SalvarFuncionarioBody.parse(req.body);

  await validarCliente(contaId, dados.clienteId);

  let funcionarioId: number;
  if (id) {
    const [atualizado] = await db
      .update(funcionarios)
      .set(dados)
      .where(and(eq(funcionarios.id, id), eq(funcionarios.contaId, contaId)))
      .returning({ id: funcionarios.id });
    if (!atualizado) throw new HttpError(404, "Funcionário não encontrado.");
    funcionarioId = id;
  } else {
    const [novo] = await db
      .insert(funcionarios)
      .values({ ...dados, contaId })
      .returning({ id: funcionarios.id });
    funcionarioId = novo.id;
  }

  const [salvo] = await consulta(contaId, eq(funcionarios.id, funcionarioId));
  res.json(salvo);
});

// PATCH /api/funcionarios/:id — edição célula a célula
router.patch("/:id", async (req, res) => {
  const contaId = contaDaRequisicao(req);
  const { id } = AtualizarFuncionarioParams.parse(req.params);
  const body = AtualizarFuncionarioBody.parse(req.body);

  const mudancas = Object.fromEntries(Object.entries(body).filter(([, v]) => v !== undefined));
  if (Object.keys(mudancas).length === 0) {
    throw new HttpError(400, "Nenhum campo para atualizar.");
  }

  if ("clienteId" in mudancas) {
    await validarCliente(contaId, mudancas.clienteId as number | null);
  }

  const [atualizado] = await db
    .update(funcionarios)
    .set(mudancas)
    .where(and(eq(funcionarios.id, id), eq(funcionarios.contaId, contaId)))
    .returning({ id: funcionarios.id });
  if (!atualizado) throw new HttpError(404, "Funcionário não encontrado.");

  const [salvo] = await consulta(contaId, eq(funcionarios.id, id));
  res.json(salvo);
});

// DELETE /api/funcionarios/:id — leva junto folha e férias (cascade no banco)
router.delete("/:id", async (req, res) => {
  const contaId = contaDaRequisicao(req);
  const { id } = RemoverFuncionarioParams.parse(req.params);
  await db
    .delete(funcionarios)
    .where(and(eq(funcionarios.id, id), eq(funcionarios.contaId, contaId)));
  res.status(204).send();
});

export default router;
