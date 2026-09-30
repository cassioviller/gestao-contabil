import { Router } from "express";
import { and, asc, count, eq, ne } from "drizzle-orm";
import { db, gerarHashSenha, usuarios } from "@workspace/db";
import {
  AtualizarUsuarioBody,
  AtualizarUsuarioParams,
  CriarUsuarioBody,
  RedefinirSenhaUsuarioBody,
  RedefinirSenhaUsuarioParams,
} from "@workspace/api-zod";
import { HttpError } from "../lib/http";
import { auditar } from "../lib/auditoria";
import { encerrarTodasSessoes } from "../lib/sessao";
import { contaDaRequisicao, exigirPapel, sessaoDaRequisicao } from "../middlewares/autenticacao";

const router = Router();

// Gerenciar gente é coisa de admin. Vale para todas as rotas deste arquivo.
router.use(exigirPapel("admin"));

const campos = {
  id: usuarios.id,
  login: usuarios.login,
  nome: usuarios.nome,
  email: usuarios.email,
  papel: usuarios.papel,
  ativo: usuarios.ativo,
  ultimoAcessoEm: usuarios.ultimoAcessoEm,
  criadoEm: usuarios.criadoEm,
};

async function buscar(contaId: number, id: number) {
  const [u] = await db
    .select(campos)
    .from(usuarios)
    .where(and(eq(usuarios.id, id), eq(usuarios.contaId, contaId)));
  if (!u) throw new HttpError(404, "Usuário não encontrado.");
  return u;
}

/** Quantos admins ativos a conta tem além deste usuário. */
async function outrosAdminsAtivos(contaId: number, usuarioId: number): Promise<number> {
  const [linha] = await db
    .select({ n: count() })
    .from(usuarios)
    .where(
      and(
        eq(usuarios.contaId, contaId),
        eq(usuarios.papel, "admin"),
        eq(usuarios.ativo, true),
        ne(usuarios.id, usuarioId),
      ),
    );
  return linha?.n ?? 0;
}

// GET /api/usuarios
router.get("/", async (req, res) => {
  const contaId = contaDaRequisicao(req);
  const lista = await db
    .select(campos)
    .from(usuarios)
    .where(eq(usuarios.contaId, contaId))
    .orderBy(asc(usuarios.nome), asc(usuarios.login));
  res.json(lista);
});

// POST /api/usuarios
router.post("/", async (req, res) => {
  const contaId = contaDaRequisicao(req);
  const dados = CriarUsuarioBody.parse(req.body);
  // O login é global (um só sistema para vários escritórios) e a tela de login
  // normaliza para minúsculas — gravar diferente criaria alguém que nunca entra.
  const login = dados.login.trim().toLowerCase();
  if (!/^[a-z0-9._@-]+$/.test(login)) {
    throw new HttpError(400, "O login só pode ter letras, números, ponto, hífen, @ e _.");
  }

  const [existente] = await db.select({ id: usuarios.id }).from(usuarios).where(eq(usuarios.login, login));
  if (existente) {
    throw new HttpError(409, "Já existe um usuário com esse login.", undefined, "duplicado");
  }

  const [novo] = await db
    .insert(usuarios)
    .values({
      contaId,
      login,
      nome: dados.nome?.trim() || null,
      email: dados.email?.trim().toLowerCase() || null,
      papel: dados.papel,
      senhaHash: await gerarHashSenha(dados.senha),
    })
    .returning(campos);
  await auditar(req, { acao: "criar_usuario", entidade: "usuario", entidadeId: novo.id, para: dados.papel });
  res.json(novo);
});

// PATCH /api/usuarios/:id
router.patch("/:id", async (req, res) => {
  const contaId = contaDaRequisicao(req);
  const sessao = sessaoDaRequisicao(req);
  const { id } = AtualizarUsuarioParams.parse(req.params);
  const body = AtualizarUsuarioBody.parse(req.body);

  const mudancas = Object.fromEntries(Object.entries(body).filter(([, v]) => v !== undefined));
  if (Object.keys(mudancas).length === 0) throw new HttpError(400, "Nenhum campo para atualizar.");

  const atual = await buscar(contaId, id);

  const perdeAdmin =
    atual.papel === "admin" &&
    atual.ativo &&
    ((mudancas.papel !== undefined && mudancas.papel !== "admin") || mudancas.ativo === false);
  if (perdeAdmin) {
    if (id === sessao.usuarioId) {
      throw new HttpError(400, "Você não pode tirar o seu próprio acesso de administrador.");
    }
    if ((await outrosAdminsAtivos(contaId, id)) === 0) {
      throw new HttpError(400, "O escritório ficaria sem administrador ativo.");
    }
  }

  const [atualizado] = await db
    .update(usuarios)
    .set({
      ...(mudancas.nome !== undefined ? { nome: (mudancas.nome as string | null)?.trim() || null } : {}),
      ...(mudancas.email !== undefined
        ? { email: (mudancas.email as string | null)?.trim().toLowerCase() || null }
        : {}),
      ...(mudancas.papel !== undefined ? { papel: mudancas.papel as typeof atual.papel } : {}),
      ...(mudancas.ativo !== undefined ? { ativo: mudancas.ativo as boolean } : {}),
    })
    .where(and(eq(usuarios.id, id), eq(usuarios.contaId, contaId)))
    .returning(campos);
  if (!atualizado) throw new HttpError(404, "Usuário não encontrado.");

  // Desativado não fica logado em lugar nenhum.
  if (mudancas.ativo === false) await encerrarTodasSessoes(id);

  if (mudancas.papel !== undefined && mudancas.papel !== atual.papel) {
    await auditar(req, {
      acao: "alterar_papel",
      entidade: "usuario",
      entidadeId: id,
      campo: "papel",
      de: atual.papel,
      para: String(mudancas.papel),
    });
  }
  if (mudancas.ativo !== undefined && mudancas.ativo !== atual.ativo) {
    await auditar(req, {
      acao: mudancas.ativo ? "reativar_usuario" : "desativar_usuario",
      entidade: "usuario",
      entidadeId: id,
    });
  }

  res.json(atualizado);
});

// POST /api/usuarios/:id/redefinir-senha
router.post("/:id/redefinir-senha", async (req, res) => {
  const contaId = contaDaRequisicao(req);
  const { id } = RedefinirSenhaUsuarioParams.parse(req.params);
  const { novaSenha } = RedefinirSenhaUsuarioBody.parse(req.body);

  await buscar(contaId, id);
  await db
    .update(usuarios)
    .set({ senhaHash: await gerarHashSenha(novaSenha), senhaAlteradaEm: new Date() })
    .where(and(eq(usuarios.id, id), eq(usuarios.contaId, contaId)));
  await encerrarTodasSessoes(id);
  await auditar(req, { acao: "redefinir_senha", entidade: "usuario", entidadeId: id });
  res.status(204).send();
});

export default router;
