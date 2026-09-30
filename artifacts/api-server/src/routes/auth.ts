import { Router } from "express";
import { and, count, eq, gt } from "drizzle-orm";
import { rateLimit, ipKeyGenerator } from "express-rate-limit";
import {
  conferirSenha,
  contas,
  db,
  gerarHashSenha,
  tentativasLogin,
  usuarios,
} from "@workspace/db";
import { EntrarBody, TrocarSenhaBody } from "@workspace/api-zod";
import { HttpError } from "../lib/http";
import { auditar } from "../lib/auditoria";
import {
  COOKIE_SESSAO,
  buscarSessao,
  criarSessao,
  encerrarOutrasSessoes,
  encerrarSessao,
  encerrarTodasSessoes,
  opcoesCookie,
  type Sessao,
} from "../lib/sessao";
import { exigirSessao, sessaoDaRequisicao } from "../middlewares/autenticacao";

const router = Router();

const JANELA_MS = 15 * 60 * 1000;
const LIMITE_POR_LOGIN = Number(process.env.LOGIN_TENTATIVAS_POR_LOGIN ?? 10);

/**
 * Força bruta é a única forma de entrar sem a senha, então o login é a única
 * rota com limite de tentativas. Dois limites, os dois só contando falhas:
 * por IP (quem tenta vários logins) e por login (quem distribui os IPs).
 * Estes dois vivem na memória da instância; o terceiro, em `tentativas_login`,
 * vale para todas as instâncias do autoscale juntas.
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
  limit: LIMITE_POR_LOGIN,
  skipSuccessfulRequests: true,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  keyGenerator: (req) => {
    const login = (req.body as { login?: unknown } | undefined)?.login;
    return typeof login === "string"
      ? `login:${login.trim().toLowerCase()}`
      : ipKeyGenerator(req.ip ?? "");
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

async function falhasRecentes(login: string): Promise<number> {
  const [linha] = await db
    .select({ n: count() })
    .from(tentativasLogin)
    .where(
      and(
        eq(tentativasLogin.login, login),
        eq(tentativasLogin.sucesso, false),
        gt(tentativasLogin.quando, new Date(Date.now() - JANELA_MS)),
      ),
    );
  return linha?.n ?? 0;
}

function respostaSessao(s: Sessao) {
  return {
    contaId: s.contaId,
    conta: s.nomeConta,
    usuarioId: s.usuarioId,
    login: s.login,
    nome: s.nomeUsuario,
    papel: s.papel,
  };
}

// POST /api/auth/entrar
router.post("/entrar", limitePorIp, limitePorLogin, async (req, res) => {
  const corpo = EntrarBody.parse(req.body);
  const login = corpo.login.trim().toLowerCase();
  const ip = req.ip ?? null;

  if ((await falhasRecentes(login)) >= LIMITE_POR_LOGIN) {
    throw new HttpError(429, "Muitas tentativas para este login. Aguarde alguns minutos.");
  }

  const [usuario] = await db
    .select({
      id: usuarios.id,
      contaId: usuarios.contaId,
      login: usuarios.login,
      nome: usuarios.nome,
      papel: usuarios.papel,
      senhaHash: usuarios.senhaHash,
      usuarioAtivo: usuarios.ativo,
      contaAtiva: contas.ativo,
      nomeConta: contas.nome,
    })
    .from(usuarios)
    .innerJoin(contas, eq(contas.id, usuarios.contaId))
    .where(eq(usuarios.login, login));

  // Uma mensagem só para login inexistente e senha errada: dizer qual dos dois
  // falhou entregaria a lista de logins válidos a quem estiver tentando.
  const hash = usuario?.senhaHash ?? (await hashFicticio);
  const senhaConfere = await conferirSenha(corpo.senha, hash);
  if (!usuario || !senhaConfere || !usuario.usuarioAtivo || !usuario.contaAtiva) {
    await db.insert(tentativasLogin).values({ login, ip, sucesso: false });
    req.log?.info({ login, ip }, "login recusado");
    throw new HttpError(401, "Login ou senha inválidos.");
  }

  const token = await criarSessao(usuario.id);
  await db.insert(tentativasLogin).values({ login, ip, sucesso: true });
  await db.update(usuarios).set({ ultimoAcessoEm: new Date() }).where(eq(usuarios.id, usuario.id));

  res.cookie(COOKIE_SESSAO, token, opcoesCookie());
  req.log?.info({ usuarioId: usuario.id, contaId: usuario.contaId }, "login");
  res.json(
    respostaSessao({
      usuarioId: usuario.id,
      contaId: usuario.contaId,
      login: usuario.login,
      nomeUsuario: usuario.nome,
      nomeConta: usuario.nomeConta,
      papel: usuario.papel,
      hash: "",
    }),
  );
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
  res.json(respostaSessao(sessao));
});

// POST /api/auth/trocar-senha — a própria senha; as outras sessões caem.
router.post("/trocar-senha", exigirSessao, async (req, res) => {
  const sessao = sessaoDaRequisicao(req);
  const { senhaAtual, novaSenha } = TrocarSenhaBody.parse(req.body);

  const [usuario] = await db
    .select({ senhaHash: usuarios.senhaHash })
    .from(usuarios)
    .where(eq(usuarios.id, sessao.usuarioId));
  if (!usuario || !(await conferirSenha(senhaAtual, usuario.senhaHash))) {
    throw new HttpError(400, "A senha atual não confere.", undefined, "senha_atual_invalida");
  }
  if (senhaAtual === novaSenha) {
    throw new HttpError(400, "A nova senha precisa ser diferente da atual.");
  }

  await db
    .update(usuarios)
    .set({ senhaHash: await gerarHashSenha(novaSenha), senhaAlteradaEm: new Date() })
    .where(eq(usuarios.id, sessao.usuarioId));
  await encerrarOutrasSessoes(sessao.usuarioId, sessao.hash);
  await auditar(req, { acao: "trocar_senha", entidade: "usuario", entidadeId: sessao.usuarioId });
  res.status(204).send();
});

// POST /api/auth/sair-de-todos — derruba todas as sessões, inclusive esta.
router.post("/sair-de-todos", exigirSessao, async (req, res) => {
  const sessao = sessaoDaRequisicao(req);
  await auditar(req, { acao: "sair_de_todos", entidade: "usuario", entidadeId: sessao.usuarioId });
  await encerrarTodasSessoes(sessao.usuarioId);
  res.clearCookie(COOKIE_SESSAO, { ...opcoesCookie(), maxAge: undefined });
  res.status(204).send();
});

export default router;
