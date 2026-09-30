import type { NextFunction, Request, Response } from "express";
import { HttpError } from "../lib/http";
import { COOKIE_SESSAO, buscarSessao, type Sessao } from "../lib/sessao";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      sessao?: Sessao;
    }
  }
}

/**
 * Porta de entrada do multitenant: sem sessão válida, nada além de `/healthz` e
 * `/auth/*` responde. Fica em `routes/index.ts` **antes** dos recursos, para que
 * uma rota nova nasça protegida sem ninguém precisar lembrar de protegê-la.
 */
export async function exigirSessao(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  const sessao = await buscarSessao(req.cookies?.[COOKIE_SESSAO]);
  if (!sessao) {
    throw new HttpError(401, "Sessão expirada. Entre de novo.");
  }
  req.sessao = sessao;
  next();
}

/**
 * A conta dona da requisição. Todo acesso ao banco passa por aqui — se alguma
 * rota escapar do `exigirSessao`, isto estoura em vez de vazar dados de outro
 * escritório.
 */
export function contaDaRequisicao(req: Request): number {
  const contaId = req.sessao?.contaId;
  if (contaId === undefined) {
    throw new HttpError(401, "Sessão expirada. Entre de novo.");
  }
  return contaId;
}
