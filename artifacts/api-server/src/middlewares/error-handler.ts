import type { ErrorRequestHandler, RequestHandler } from "express";
import { ZodError } from "zod";
import { HttpError } from "../lib/http";

// 404 for any route not matched by the routers above.
export const notFound: RequestHandler = (_req, res) => {
  res.status(404).json({ error: "Recurso não encontrado.", codigo: "nao_encontrado" });
};

/**
 * Erros do Postgres que têm tradução direta para HTTP. Sem isto, um nome de
 * obrigação repetido ou uma data inválida viravam 500 genérico e iam para o
 * log como falha do servidor.
 */
const ERROS_PG: Record<string, { status: number; codigo: string; mensagem: string }> = {
  "23505": { status: 409, codigo: "duplicado", mensagem: "Já existe um registro igual." },
  "23503": {
    status: 409,
    codigo: "em_uso",
    mensagem: "O registro está ligado a outro e não pode ser alterado assim.",
  },
  "23502": { status: 400, codigo: "campo_obrigatorio", mensagem: "Falta um campo obrigatório." },
  "23514": { status: 400, codigo: "valor_invalido", mensagem: "Valor fora do permitido." },
  "22P02": { status: 400, codigo: "formato_invalido", mensagem: "Formato inválido." },
  "22007": { status: 400, codigo: "data_invalida", mensagem: "Data inválida." },
  "22008": { status: 400, codigo: "data_invalida", mensagem: "Data inválida." },
  "22003": { status: 400, codigo: "numero_invalido", mensagem: "Número fora do limite." },
  "22001": { status: 400, codigo: "texto_longo", mensagem: "Texto longo demais." },
};

function codigoPg(err: unknown): string | undefined {
  if (!err || typeof err !== "object") return undefined;
  const direto = (err as { code?: unknown }).code;
  if (typeof direto === "string" && direto in ERROS_PG) return direto;
  // O Drizzle embrulha o erro do driver em `cause`.
  const causa = (err as { cause?: unknown }).cause;
  if (causa && typeof causa === "object") {
    const c = (causa as { code?: unknown }).code;
    if (typeof c === "string" && c in ERROS_PG) return c;
  }
  return undefined;
}

/**
 * Central error handler. Maps validation and known errors to clean JSON
 * responses and logs anything unexpected as a 500. Express 5 forwards rejected
 * promises from async handlers here, so route handlers don't need try/catch.
 */
export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  if (err instanceof ZodError) {
    req.log?.warn({ issues: err.issues }, "request validation failed");
    res
      .status(400)
      .json({ error: "Dados inválidos.", codigo: "dados_invalidos", issues: err.issues });
    return;
  }

  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.message, codigo: err.codigo, details: err.details });
    return;
  }

  // Malformed JSON body (thrown by express.json()).
  if (err && typeof err === "object" && (err as { type?: string }).type === "entity.parse.failed") {
    res
      .status(400)
      .json({ error: "JSON inválido no corpo da requisição.", codigo: "json_invalido" });
    return;
  }

  // Corpo maior que o limite do express.json().
  if (err && typeof err === "object" && (err as { type?: string }).type === "entity.too.large") {
    res.status(413).json({ error: "Corpo da requisição grande demais.", codigo: "corpo_grande" });
    return;
  }

  const pg = codigoPg(err);
  if (pg) {
    const traducao = ERROS_PG[pg];
    // `detail` do Postgres traz o valor da chave duplicada: fica só no log de
    // depuração, nunca na resposta.
    req.log?.warn({ codigoPg: pg }, "erro de banco traduzido");
    res.status(traducao.status).json({ error: traducao.mensagem, codigo: traducao.codigo });
    return;
  }

  req.log?.error({ err }, "unhandled error");
  res.status(500).json({ error: "Erro interno do servidor.", codigo: "erro_interno" });
};
