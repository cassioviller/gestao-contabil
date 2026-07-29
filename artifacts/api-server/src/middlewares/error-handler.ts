import type { ErrorRequestHandler, RequestHandler } from "express";
import { ZodError } from "zod";
import { HttpError } from "../lib/http";

// 404 for any route not matched by the routers above.
export const notFound: RequestHandler = (_req, res) => {
  res.status(404).json({ error: "Recurso não encontrado." });
};

/**
 * Central error handler. Maps validation and known errors to clean JSON
 * responses and logs anything unexpected as a 500. Express 5 forwards rejected
 * promises from async handlers here, so route handlers don't need try/catch.
 */
export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  if (err instanceof ZodError) {
    req.log?.warn({ issues: err.issues }, "request validation failed");
    res.status(400).json({ error: "Dados inválidos.", issues: err.issues });
    return;
  }

  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.message, details: err.details });
    return;
  }

  // Malformed JSON body (thrown by express.json()).
  if (err && typeof err === "object" && (err as { type?: string }).type === "entity.parse.failed") {
    res.status(400).json({ error: "JSON inválido no corpo da requisição." });
    return;
  }

  req.log?.error({ err }, "unhandled error");
  res.status(500).json({ error: "Erro interno do servidor." });
};
