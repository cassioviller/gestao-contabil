// Marca a migration baseline (0000) como já aplicada, sem reexecutar o SQL.
// Útil porque as tabelas já foram criadas via `drizzle-kit push`.
// Replica exatamente o que o `drizzle-kit migrate` (node-postgres) registra:
// cria a tabela drizzle.__drizzle_migrations e insere (hash, created_at),
// onde hash = sha256(conteúdo do .sql) e created_at = campo `when` do journal.
import "dotenv/config";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { Pool } from "pg";

async function main() {
  const journal = JSON.parse(readFileSync("drizzle/meta/_journal.json", "utf8"));
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  await pool.query(`CREATE SCHEMA IF NOT EXISTS "drizzle"`);
  await pool.query(
    `CREATE TABLE IF NOT EXISTS "drizzle"."__drizzle_migrations" (
       id SERIAL PRIMARY KEY,
       hash text NOT NULL,
       created_at bigint
     )`
  );

  for (const entry of journal.entries) {
    const sql = readFileSync(`drizzle/${entry.tag}.sql`, "utf8");
    const hash = createHash("sha256").update(sql).digest("hex");
    const existing = await pool.query(
      `SELECT 1 FROM "drizzle"."__drizzle_migrations" WHERE hash = $1`,
      [hash]
    );
    if (existing.rowCount) {
      console.log(`já marcada: ${entry.tag}`);
      continue;
    }
    await pool.query(
      `INSERT INTO "drizzle"."__drizzle_migrations" (hash, created_at) VALUES ($1, $2)`,
      [hash, entry.when]
    );
    console.log(`marcada como aplicada: ${entry.tag} (created_at=${entry.when})`);
  }

  await pool.end();
}

main();
