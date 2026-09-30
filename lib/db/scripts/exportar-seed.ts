/**
 * Congela o banco de desenvolvimento num arquivo versionado no repositório
 * (`src/seed/gerado.ts`): a estrutura completa (pg_dump --schema-only) e todas
 * as linhas de dados.
 *
 * É o que faz os dados viajarem junto com a publicação: o banco de produção
 * nasce vazio, e no primeiro boot a API carrega este seed. Sem isso, publicar
 * daria um sistema em branco.
 *
 * Rode sempre que quiser que o deploy leve o estado atual do desenvolvimento:
 *   pnpm --filter @workspace/db run exportar-seed
 *
 * Sessões ficam de fora de propósito — cookie de dev não vale em produção.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { ORDEM_TABELAS } from "../src/tabelas.ts";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL must be set.");
}

const aqui = path.dirname(fileURLToPath(import.meta.url));
const destino = path.join(aqui, "..", "src", "seed");

// --schema-only: a estrutura vem do pg_dump (fiel de verdade, inclusive enums e
// índices); os dados vêm de consultas, para caber num JSON legível no diff.
const dumpBruto = execFileSync(
  "pg_dump",
  [
    "--schema-only",
    "--no-owner",
    "--no-privileges",
    "--no-comments",
    "--schema=public",
    process.env.DATABASE_URL,
  ],
  { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 },
);

// O pg_dump 16+ embrulha o dump em `\restrict`/`\unrestrict`, que são comandos
// de barra do psql. Quem executa o SQL no boot é o driver `pg`, que não os
// entende e responderia com erro de sintaxe.
const schemaSql = dumpBruto
  .split("\n")
  .filter((linha) => !/^\\(restrict|unrestrict|connect)\b/.test(linha))
  .join("\n")
  // Todo banco Postgres já nasce com o schema `public`, mas o dump o recria e o
  // CREATE cru falharia com "already exists" logo na primeira instrução.
  .replace(/^CREATE SCHEMA public;/m, "CREATE SCHEMA IF NOT EXISTS public;");

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();

const dados: Record<string, unknown[]> = {};
let total = 0;
for (const tabela of ORDEM_TABELAS) {
  const { rows } = await client.query(`select * from ${tabela}`);
  dados[tabela] = rows;
  total += rows.length;
  if (rows.length) console.log(`  ${tabela}: ${rows.length}`);
}

await client.end();

mkdirSync(destino, { recursive: true });
writeFileSync(
  path.join(destino, "gerado.ts"),
  `// GERADO POR \`pnpm --filter @workspace/db run exportar-seed\` — não editar à mão.
//
// Vai junto no bundle da API. No primeiro boot com banco vazio (o caso do
// deploy recém-publicado), a estrutura e os dados daqui são carregados.

export const SCHEMA_SQL: string = ${JSON.stringify(schemaSql)};

export const DADOS: Record<string, Record<string, unknown>[]> = ${JSON.stringify(dados, null, 2)};
`,
  "utf8",
);

console.log(`\nSeed exportado: ${total} linha(s) em ${ORDEM_TABELAS.length} tabelas.`);
console.log("Commite lib/db/src/seed/gerado.ts para que o deploy leve estes dados.");
