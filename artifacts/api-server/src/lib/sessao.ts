import { and, eq, gt, lt, ne, or, sql } from "drizzle-orm";
import { db, contas, gerarToken, hashToken, sessoes, usuarios } from "@workspace/db";

export const COOKIE_SESSAO = "contafacil_sessao";

/** Trinta dias: o contador abre o sistema todo dia útil, relogar toda semana irrita. */
const DURACAO_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Sessão parada mais que isto cai, mesmo dentro dos trinta dias: um computador
 * do escritório esquecido logado não fica aberto para sempre.
 */
const INATIVIDADE_MS = Number(process.env.SESSAO_INATIVIDADE_HORAS ?? 12) * 60 * 60 * 1000;

/** `ultimo_uso_em` é renovado no máximo a cada 5 min: um UPDATE por requisição seria caro à toa. */
const INTERVALO_RENOVACAO_MS = 5 * 60 * 1000;

export type Papel = "admin" | "contador" | "auxiliar";

export type Sessao = {
  usuarioId: number;
  contaId: number;
  login: string;
  nomeUsuario: string | null;
  nomeConta: string;
  papel: Papel;
  /** Hash do token desta sessão — para encerrar "as outras" sem conhecer o cookie delas. */
  hash: string;
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

/**
 * O cookie leva o token em claro; o banco guarda só o SHA-256. Quem ler a
 * tabela `sessoes` (um dump, um backup vazado) não consegue se passar por
 * ninguém: não há como voltar do hash para o token.
 */
export async function criarSessao(usuarioId: number): Promise<string> {
  const token = gerarToken();
  await db.insert(sessoes).values({
    token: hashToken(token),
    usuarioId,
    expiraEm: new Date(Date.now() + DURACAO_MS),
  });
  return token;
}

/**
 * Resolve o token do cookie na sessão viva. Devolve `null` para token
 * desconhecido, expirado, parado há mais que o limite de inatividade, ou de
 * usuário/conta desativados — o middleware traduz isso em 401.
 */
export async function buscarSessao(token: string | undefined): Promise<Sessao | null> {
  if (!token) return null;
  const hash = hashToken(token);
  const agora = new Date();

  const [linha] = await db
    .select({
      usuarioId: usuarios.id,
      contaId: usuarios.contaId,
      login: usuarios.login,
      nomeUsuario: usuarios.nome,
      nomeConta: contas.nome,
      papel: usuarios.papel,
      ultimoUsoEm: sessoes.ultimoUsoEm,
    })
    .from(sessoes)
    .innerJoin(usuarios, eq(usuarios.id, sessoes.usuarioId))
    .innerJoin(contas, eq(contas.id, usuarios.contaId))
    .where(
      and(
        eq(sessoes.token, hash),
        gt(sessoes.expiraEm, agora),
        gt(sessoes.ultimoUsoEm, new Date(agora.getTime() - INATIVIDADE_MS)),
        eq(usuarios.ativo, true),
        eq(contas.ativo, true),
      ),
    );
  if (!linha) return null;

  if (agora.getTime() - linha.ultimoUsoEm.getTime() > INTERVALO_RENOVACAO_MS) {
    await db.update(sessoes).set({ ultimoUsoEm: agora }).where(eq(sessoes.token, hash));
  }

  const { ultimoUsoEm: _ignorado, ...sessao } = linha;
  return { ...sessao, hash };
}

export async function encerrarSessao(token: string | undefined): Promise<void> {
  if (!token) return;
  await db.delete(sessoes).where(eq(sessoes.token, hashToken(token)));
}

/** Derruba as outras sessões do usuário (troca de senha): a atual continua. */
export async function encerrarOutrasSessoes(usuarioId: number, hashAtual: string): Promise<void> {
  await db
    .delete(sessoes)
    .where(and(eq(sessoes.usuarioId, usuarioId), ne(sessoes.token, hashAtual)));
}

/** Derruba todas as sessões do usuário, inclusive a atual. */
export async function encerrarTodasSessoes(usuarioId: number): Promise<void> {
  await db.delete(sessoes).where(eq(sessoes.usuarioId, usuarioId));
}

/**
 * Varre as sessões vencidas ou paradas. Chamado no boot — a tabela é pequena.
 * Também remove tokens gravados em claro por versões anteriores (não são hex
 * de 64 caracteres): eles nunca mais casariam com uma busca por hash.
 */
export async function limparSessoesVencidas(): Promise<void> {
  const agora = new Date();
  await db
    .delete(sessoes)
    .where(
      or(
        lt(sessoes.expiraEm, agora),
        lt(sessoes.ultimoUsoEm, new Date(agora.getTime() - INATIVIDADE_MS)),
        sql`${sessoes.token} !~ '^[0-9a-f]{64}$'`,
      ),
    );
}
