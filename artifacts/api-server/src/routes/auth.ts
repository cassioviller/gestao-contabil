import { Router } from "express";
import { eq } from "drizzle-orm";
import { conferirSenha, contas, db, usuarios } from "@workspace/db";
import { EntrarBody } from "@workspace/api-zod";
import { HttpError } from "../lib/http";
import {
  COOKIE_SESSAO,
  buscarSessao,
  criarSessao,
  encerrarSessao,
  opcoesCookie,
} from "../lib/sessao";

const router = Router();

// POST /api/auth/entrar
router.post("/entrar", async (req, res) => {
  const { login, senha } = EntrarBody.parse(req.body);

  const [usuario] = await db
    .select({
      id: usuarios.id,
      contaId: usuarios.contaId,
      login: usuarios.login,
      nome: usuarios.nome,
      senhaHash: usuarios.senhaHash,
      usuarioAtivo: usuarios.ativo,
      contaAtiva: contas.ativo,
      nomeConta: contas.nome,
    })
    .from(usuarios)
    .innerJoin(contas, eq(contas.id, usuarios.contaId))
    .where(eq(usuarios.login, login.trim().toLowerCase()));

  // Uma mensagem só para login inexistente e senha errada: dizer qual dos dois
  // falhou entregaria a lista de logins válidos a quem estiver tentando.
  const invalido = new HttpError(401, "Login ou senha inválidos.");
  if (!usuario || !usuario.usuarioAtivo || !usuario.contaAtiva) throw invalido;
  if (!(await conferirSenha(senha, usuario.senhaHash))) throw invalido;

  const token = await criarSessao(usuario.id);
  res.cookie(COOKIE_SESSAO, token, opcoesCookie());
  res.json({
    contaId: usuario.contaId,
    conta: usuario.nomeConta,
    login: usuario.login,
    nome: usuario.nome,
  });
});

// POST /api/auth/sair
router.post("/sair", async (req, res) => {
  await encerrarSessao(req.cookies?.[COOKIE_SESSAO]);
  res.clearCookie(COOKIE_SESSAO, { ...opcoesCookie(), maxAge: undefined });
  res.status(204).send();
});

// GET /api/auth/eu — a tela usa isto no boot para saber se já há sessão
router.get("/eu", async (req, res) => {
  const sessao = await buscarSessao(req.cookies?.[COOKIE_SESSAO]);
  if (!sessao) throw new HttpError(401, "Sem sessão.");
  res.json({
    contaId: sessao.contaId,
    conta: sessao.nomeConta,
    login: sessao.login,
    nome: sessao.nomeUsuario,
  });
});

export default router;
