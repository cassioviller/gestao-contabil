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

// Antes de aceitar requisição: garante que o banco tem estrutura e, se estiver
// zerado (o caso de um deploy recém-publicado), carrega o seed do repositório.
// Banco já em uso passa intocado. Se falhar, o processo morre em vez de servir
// 500 em toda tela — o deploy então mostra a falha em vez de um app quebrado.
try {
  logger.info({ status: await garantirBanco(pool) }, "Banco pronto");
  await limparSessoesVencidas();
} catch (err) {
  logger.error({ err }, "Falha ao preparar o banco");
  process.exit(1);
}

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
});
