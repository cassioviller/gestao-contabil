import { randomBytes } from "node:crypto";
import { and, eq, gt, lt } from "drizzle-orm";
import { db, contas, sessoes, usuarios } from "@workspace/db";

export const COOKIE_SESSAO = "contafacil_sessao";

/** Trinta dias: o contador abre o sistema todo dia útil, relogar toda semana irrita. */
const DURACAO_MS = 30 * 24 * 60 * 60 * 1000;

export type Sessao = {
  usuarioId: number;
  contaId: number;
  login: string;
  nomeUsuario: string | null;
  nomeConta: string;
};

export function opcoesCookie(): {
  httpOnly: true;
  sameSite: "lax";
  secure: boolean;
  path: string;
  maxAge: number;
} {
  return {
    // httpOnly: nenhum script da página lê o token, então um XSS não leva a
    // sessão junto. `lax` já barra o CSRF de formulário cross-site.
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: DURACAO_MS,
  };
}

export async function criarSessao(usuarioId: number): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  await db.insert(sessoes).values({
    token,
    usuarioId,
    expiraEm: new Date(Date.now() + DURACAO_MS),
  });
  return token;
}

/**
 * Resolve o token do cookie na sessão viva. Devolve `null` para token
 * desconhecido, expirado, ou de usuário/conta desativados — o middleware
 * traduz isso em 401 e a tela volta para o login.
 */
export async function buscarSessao(token: string | undefined): Promise<Sessao | null> {
  if (!token) return null;

  const [linha] = await db
    .select({
      usuarioId: usuarios.id,
      contaId: usuarios.contaId,
      login: usuarios.login,
      nomeUsuario: usuarios.nome,
      nomeConta: contas.nome,
    })
    .from(sessoes)
    .innerJoin(usuarios, eq(usuarios.id, sessoes.usuarioId))
    .innerJoin(contas, eq(contas.id, usuarios.contaId))
    .where(
      and(
        eq(sessoes.token, token),
        gt(sessoes.expiraEm, new Date()),
        eq(usuarios.ativo, true),
        eq(contas.ativo, true),
      ),
    );

  return linha ?? null;
}

export async function encerrarSessao(token: string | undefined): Promise<void> {
  if (!token) return;
  await db.delete(sessoes).where(eq(sessoes.token, token));
}

/** Varre as sessões vencidas. Chamado no boot — a tabela é pequena e barata. */
export async function limparSessoesVencidas(): Promise<void> {
  await db.delete(sessoes).where(lt(sessoes.expiraEm, new Date()));
}
