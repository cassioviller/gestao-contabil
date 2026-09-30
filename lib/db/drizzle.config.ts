import { defineConfig } from "drizzle-kit";
import path from "path";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL, ensure the database is provisioned");
}

export default defineConfig({
  schema: path.join(__dirname, "./src/schema/index.ts"),
  // Migrations versionadas: `pnpm --filter @workspace/db run generate` cria o
  // SQL numerado em ./drizzle; a API aplica o que falta no boot (`migrate()`).
  // Relativo ao cwd (lib/db): o drizzle-kit monta o caminho do snapshot com
  // prefixo "./", e um caminho absoluto aqui vira ".//home/..." e quebra.
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
  migrations: {
    schema: "drizzle",
    table: "__drizzle_migrations",
  },
  strict: true,
  verbose: true,
});
