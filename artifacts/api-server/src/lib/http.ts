/**
 * Error carrying an HTTP status code. Throw from a route handler to produce a
 * clean JSON error response via the central error handler (Express 5 forwards
 * async throws automatically).
 *
 * `codigo` é um identificador estável para a tela decidir o que fazer (por
 * exemplo, `duplicado` vira um aviso em vez de um erro genérico).
 */
export class HttpError extends Error {
  readonly status: number;
  readonly codigo: string;
  readonly details?: unknown;

  constructor(status: number, message: string, details?: unknown, codigo?: string) {
    super(message);
    this.name = "HttpError";
    this.status = status;
    this.details = details;
    this.codigo = codigo ?? CODIGO_PADRAO[status] ?? "erro";
  }
}

const CODIGO_PADRAO: Record<number, string> = {
  400: "dados_invalidos",
  401: "nao_autenticado",
  403: "sem_permissao",
  404: "nao_encontrado",
  409: "conflito",
  413: "corpo_grande",
  429: "muitas_tentativas",
};
