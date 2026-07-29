/**
 * Error carrying an HTTP status code. Throw from a route handler to produce a
 * clean JSON error response via the central error handler (Express 5 forwards
 * async throws automatically).
 */
export class HttpError extends Error {
  readonly status: number;
  readonly details?: unknown;

  constructor(status: number, message: string, details?: unknown) {
    super(message);
    this.name = "HttpError";
    this.status = status;
    this.details = details;
  }
}
