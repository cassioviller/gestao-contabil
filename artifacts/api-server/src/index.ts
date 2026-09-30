import { garantirBanco, pool } from "@workspace/db";
import app from "./app";
import { logger } from "./lib/logger";
import { limparSessoesVencidas } from "./lib/sessao";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

// Antes de aceitar requisição: garante que o banco tem a estrutura (migrations)
// e o primeiro escritório (bootstrap por variáveis de ambiente, se houver).
// Se falhar, o processo morre em vez de servir 500 em toda tela — o deploy
// então mostra a falha em vez de um app quebrado.
try {
  logger.info({ status: await garantirBanco(pool) }, "Banco pronto");
  await limparSessoesVencidas();
} catch (err) {
  logger.error({ err }, "Falha ao preparar o banco");
  process.exit(1);
}

const server = app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
});

/**
 * Parada limpa: para de aceitar conexões, termina as requisições em andamento
 * e só então fecha o pool. No autoscale, o scale-down manda SIGTERM — sem isto
 * uma gravação no meio era cortada.
 */
let encerrando = false;
function encerrar(sinal: string): void {
  if (encerrando) return;
  encerrando = true;
  logger.info({ sinal }, "Encerrando");

  const limite = setTimeout(() => {
    logger.warn("Encerramento forçado após 10 s");
    process.exit(1);
  }, 10_000);
  limite.unref();

  server.close(async (err) => {
    if (err) logger.error({ err }, "Erro ao fechar o servidor");
    try {
      await pool.end();
    } catch (e) {
      logger.error({ err: e }, "Erro ao fechar o pool");
    }
    process.exit(err ? 1 : 0);
  });
}

process.on("SIGTERM", () => encerrar("SIGTERM"));
process.on("SIGINT", () => encerrar("SIGINT"));

process.on("unhandledRejection", (motivo) => {
  logger.error({ err: motivo }, "Promise rejeitada sem tratamento");
});
