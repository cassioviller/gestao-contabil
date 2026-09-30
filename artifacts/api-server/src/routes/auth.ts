import { Router } from "express";
import { eq } from "drizzle-orm";
import { rateLimit, ipKeyGenerator } from "express-rate-limit";
import { conferirSenha, contas, db, gerarHashSenha, usuarios } from "@workspace/db";
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

const JANELA_MS = 15 * 60 * 1000;

/**
 * Força bruta é a única forma de entrar sem a senha, então o login é a única
 * rota com limite de tentativas. Dois limites, os dois só contando falhas:
 * por IP (quem tenta vários logins) e por login (quem distribui os IPs).
 */
const limitePorIp = rateLimit({
  windowMs: JANELA_MS,
  limit: Number(process.env.LOGIN_TENTATIVAS_POR_IP ?? 30),
  skipSuccessfulRequests: true,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  keyGenerator: (req) => ipKeyGenerator(req.ip ?? ""),
  handler: (_req, _res, next) => {
    next(new HttpError(429, "Muitas tentativas. Aguarde alguns minutos e tente de novo."));
  },
});

const limitePorLogin = rateLimit({
  windowMs: JANELA_MS,
  limit: Number(process.env.LOGIN_TENTATIVAS_POR_LOGIN ?? 10),
  skipSuccessfulRequests: true,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  keyGenerator: (req) => {
    const login = (req.body as { login?: unknown } | undefined)?.login;
    return typeof login === "string" ? `login:${login.trim().toLowerCase()}` : ipKeyGenerator(req.ip ?? "");
  },
  handler: (_req, _res, next) => {
    next(new HttpError(429, "Muitas tentativas para este login. Aguarde alguns minutos."));
  },
});

/**
 * Hash de uma senha que ninguém tem, conferido quando o login não existe. Sem
 * isto, login inexistente respondia em 1 ms e senha errada em 50 ms — e o
 * tempo de resposta entregava quais logins são válidos.
 */
const hashFicticio = gerarHashSenha(`ficticio-${Math.random()}`);

// POST /api/auth/entrar
router.post("/entrar", limitePorIp, limitePorLogin, async (req, res) => {
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
  const hash = usuario?.senhaHash ?? (await hashFicticio);
  const senhaConfere = await conferirSenha(senha, hash);
  if (!usuario || !senhaConfere || !usuario.usuarioAtivo || !usuario.contaAtiva) {
    req.log?.info({ login: login.trim().toLowerCase(), ip: req.ip }, "login recusado");
    throw invalido;
  }

  const token = await criarSessao(usuario.id);
  res.cookie(COOKIE_SESSAO, token, opcoesCookie());
  req.log?.info({ usuarioId: usuario.id, contaId: usuario.contaId }, "login");
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
