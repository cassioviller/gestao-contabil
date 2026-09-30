import type { NextFunction, Request, RequestHandler, Response } from "express";
import { HttpError } from "../lib/http";
import { COOKIE_SESSAO, buscarSessao, type Papel, type Sessao } from "../lib/sessao";

declare global {
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
 * Restringe uma rota a certos papéis. Usa-se depois de `exigirSessao`: aqui o
 * usuário já é conhecido, a pergunta é só se ele pode fazer isto.
 */
export function exigirPapel(...papeis: Papel[]): RequestHandler {
  return (req, _res, next) => {
    const sessao = sessaoDaRequisicao(req);
    if (!papeis.includes(sessao.papel)) {
      throw new HttpError(403, "Você não tem permissão para isso.", undefined, "sem_permissao");
    }
    next();
  };
}

/**
 * A conta dona da requisição. Todo acesso ao banco passa por aqui — se alguma
 * rota escapar do `exigirSessao`, isto estoura em vez de vazar dados de outro
 * escritório.
 */
export function contaDaRequisicao(req: Request): number {
  return sessaoDaRequisicao(req).contaId;
}

export function sessaoDaRequisicao(req: Request): Sessao {
  if (!req.sessao) {
    throw new HttpError(401, "Sessão expirada. Entre de novo.");
  }
  return req.sessao;
}
