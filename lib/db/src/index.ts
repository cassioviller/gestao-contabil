import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

/** Fuso oficial do sistema: todo `current_date`/`now()` no SQL sai em Brasília. */
export const FUSO_BANCO = "America/Sao_Paulo";

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: Number(process.env.DB_POOL_MAX ?? 10),
  // Conexão parada mais de 30 s é devolvida ao servidor: bancos serverless
  // derrubam clientes ociosos, e é melhor fechar antes que ser derrubado.
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
  // Uma consulta presa não pode segurar a conexão para sempre.
  statement_timeout: Number(process.env.DB_STATEMENT_TIMEOUT_MS ?? 30_000),
  application_name: "contafacil-api",
});

// Sem este listener, um cliente ocioso derrubado pelo servidor emite `error`
// no pool e, sem ninguém ouvindo, derruba o processo Node inteiro.
pool.on("error", (err) => {
  console.error("[db] erro numa conexão ociosa do pool:", err.message);
});

pool.on("connect", (cliente) => {
  cliente.query(`set time zone '${FUSO_BANCO}'`).catch((err: Error) => {
    console.error("[db] não foi possível definir o fuso da conexão:", err.message);
  });
});

export const db = drizzle(pool, { schema });

export * from "./schema";
export { gerarHashSenha, conferirSenha } from "./senha";
export { garantirBanco, inserirCatalogoPadrao } from "./instalacao";
export { cifrar, decifrar, estaCifrado, hashToken, gerarToken } from "./cifra";
export { TIPOS_PADRAO } from "./tipos-padrao";
