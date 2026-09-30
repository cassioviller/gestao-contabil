import type { NextFunction, Request, RequestHandler, Response } from "express";
import { and, eq, gt } from "drizzle-orm";
import { clientes, contas, db, gerarToken, hashToken, sessoesCliente } from "@workspace/db";
import { HttpError } from "../lib/http";

export const COOKIE_PORTAL = "contafacil_portal";
const DURACAO_MS = 7 * 24 * 60 * 60 * 1000;
const INTERVALO_RENOVACAO_MS = 5 * 60 * 1000;

export type SessaoCliente = {
  clienteId: number;
  contaId: number;
  razaoSocial: string;
  cnpj: string | null;
  email: string;
  escritorio: string;
  hash: string;
};

declare global {
  namespace Express {
    interface Request {
      cliente?: SessaoCliente;
    }
  }
}

export function opcoesCookiePortal() {
  return {
    httpOnly: true as const,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: DURACAO_MS,
  };
}

/** Sessão do portal: cookie próprio, tabela própria, e só enxerga um cliente. */
export async function criarSessaoCliente(
  contaId: number,
  clienteId: number,
  email: string,
): Promise<string> {
  const token = gerarToken();
  await db.insert(sessoesCliente).values({
    token: hashToken(token),
    contaId,
    clienteId,
    email,
    expiraEm: new Date(Date.now() + DURACAO_MS),
  });
  return token;
}

export async function buscarSessaoCliente(
  token: string | undefined,
): Promise<SessaoCliente | null> {
  if (!token) return null;
  const hash = hashToken(token);
  const agora = new Date();
  const [linha] = await db
    .select({
      clienteId: clientes.id,
      contaId: clientes.contaId,
      razaoSocial: clientes.razaoSocial,
      cnpj: clientes.cnpj,
      email: sessoesCliente.email,
      escritorio: contas.nome,
      ultimoUsoEm: sessoesCliente.ultimoUsoEm,
    })
    .from(sessoesCliente)
    .innerJoin(clientes, eq(clientes.id, sessoesCliente.clienteId))
    .innerJoin(contas, eq(contas.id, clientes.contaId))
    .where(
      and(
        eq(sessoesCliente.token, hash),
        gt(sessoesCliente.expiraEm, agora),
        eq(clientes.ativo, true),
        eq(contas.ativo, true),
      ),
    );
  if (!linha) return null;
  if (agora.getTime() - linha.ultimoUsoEm.getTime() > INTERVALO_RENOVACAO_MS) {
    await db
      .update(sessoesCliente)
      .set({ ultimoUsoEm: agora })
      .where(eq(sessoesCliente.token, hash));
  }
  const { ultimoUsoEm: _ignorado, ...sessao } = linha;
  return { ...sessao, hash };
}

export async function encerrarSessaoCliente(token: string | undefined): Promise<void> {
  if (!token) return;
  await db.delete(sessoesCliente).where(eq(sessoesCliente.token, hashToken(token)));
}

/** Porta do portal: sem sessão de cliente, nada além de entrar/acesso responde. */
export const exigirSessaoCliente: RequestHandler = async (
  req: Request,
  _res: Response,
  next: NextFunction,
) => {
  const sessao = await buscarSessaoCliente(req.cookies?.[COOKIE_PORTAL]);
  if (!sessao) throw new HttpError(401, "Acesso ao portal expirado. Peça um novo link.");
  req.cliente = sessao;
  next();
};

export function clienteDaRequisicao(req: Request): SessaoCliente {
  if (!req.cliente) throw new HttpError(401, "Acesso ao portal expirado. Peça um novo link.");
  return req.cliente;
}
