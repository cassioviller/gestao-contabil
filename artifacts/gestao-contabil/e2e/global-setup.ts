import pg from "pg";

// The journey test seeds the DB through the UI. Truncate first so each run
// starts from a clean, deterministic state (unique constraints on tipo name and
// competencia ano/mes would otherwise make a second run fail).
const TABLES = [
  "cobrancas",
  "pagamentos",
  "checklist_itens",
  "cliente_obrigacoes",
  "competencias",
  "clientes",
  "tipos_obrigacao",
  "configuracoes",
];

export default async function globalSetup() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is required to run e2e tests.");

  const pool = new pg.Pool({ connectionString: url });
  try {
    await pool.query(
      `TRUNCATE ${TABLES.join(", ")} RESTART IDENTITY CASCADE`,
    );
    // eslint-disable-next-line no-console
    console.log("[e2e] database truncated");
  } finally {
    await pool.end();
  }
}
