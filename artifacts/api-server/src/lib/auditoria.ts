import type { Request } from "express";
import { auditoria, db } from "@workspace/db";
import { HttpError } from "./http";

/**
 * Trilha de auditoria: quem fez o quê, quando e de onde. Grava-se o que é
 * sensível ou irreversível (revelar uma senha, trocar um papel, apagar um
 * cliente), nunca o valor de um segredo — `de`/`para` levam só rótulos.
 */
export type Auditavel = {
  acao: string;
  entidade?: string;
  entidadeId?: number | null;
  campo?: string | null;
  de?: string | null;
  para?: string | null;
};

type Executor = Pick<typeof db, "insert">;

export async function registrarAuditoria(
  dados: Auditavel & {
    contaId: number;
    usuarioId?: number | null;
    ator?: string | null;
    ip?: string | null;
  },
  executor: Executor = db,
): Promise<void> {
  await executor.insert(auditoria).values({
    contaId: dados.contaId,
    usuarioId: dados.usuarioId ?? null,
    ator: dados.ator ?? null,
    acao: dados.acao,
    entidade: dados.entidade ?? null,
    entidadeId: dados.entidadeId ?? null,
    campo: dados.campo ?? null,
    de: dados.de ?? null,
    para: dados.para ?? null,
    ip: dados.ip ?? null,
  });
}

/** Audita em nome de quem está logado na requisição. */
export function auditar(req: Request, registro: Auditavel, executor?: Executor): Promise<void> {
  const sessao = req.sessao;
  if (!sessao) throw new HttpError(401, "Sessão expirada. Entre de novo.");
  return registrarAuditoria(
    {
      contaId: sessao.contaId,
      usuarioId: sessao.usuarioId,
      ator: sessao.login,
      ip: req.ip ?? null,
      ...registro,
    },
    executor,
  );
}
