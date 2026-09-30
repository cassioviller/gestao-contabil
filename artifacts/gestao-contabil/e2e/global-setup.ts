import pg from "pg";
// Importa só o módulo de senha: `@workspace/db` inteiro abriria um pool de
// conexões que o setup não usa.
import { gerarHashSenha } from "@workspace/db/senha";

// The journey test seeds the DB through the UI. Truncate first so each run
// starts from a clean, deterministic state (unique constraints on tipo name and
// competencia ano/mes would otherwise make a second run fail). A lista de
// tabelas vem do próprio banco: tabela nova entra sozinha, e a de migrations
// (schema `drizzle`) fica de fora.

/** Conta usada por toda a suíte. `auth.setup.ts` entra com ela e guarda o cookie. */
export const CONTA_E2E = { nome: "Escritório e2e", login: "e2e", senha: "e2e123" };

/** Segunda conta, só para provar que uma não enxerga os dados da outra. */
export const CONTA_VIZINHA = {
  nome: "Escritório vizinho",
  login: "vizinho",
  senha: "vizinho123",
};

/**
 * A suíte TRUNCA o banco. Por isso ela só aceita um banco próprio, nomeado
 * como tal, e nunca o mesmo `DATABASE_URL` do desenvolvimento — foi assim que
 * os dados reais do escritório sumiram uma vez.
 */
export function urlDoBancoDeTeste(): string {
  const url = process.env.E2E_DATABASE_URL;
  if (!url) {
    throw new Error(
      "E2E_DATABASE_URL é obrigatória para o e2e (um banco só para testes, ex.: contafacil_e2e).",
    );
  }
  if (process.env.DATABASE_URL && process.env.DATABASE_URL === url) {
    throw new Error("E2E_DATABASE_URL não pode ser igual a DATABASE_URL: a suíte apaga tudo.");
  }
  if (process.env.NODE_ENV === "production") {
    throw new Error("O e2e não roda com NODE_ENV=production.");
  }
  const nome = new URL(url).pathname.replace(/^\//, "");
  if (!/(test|e2e)/i.test(nome)) {
    throw new Error(`O banco do e2e precisa ter "test" ou "e2e" no nome (recebido: "${nome}").`);
  }
  return url;
}

export default async function globalSetup() {
  const url = urlDoBancoDeTeste();

  const pool = new pg.Pool({ connectionString: url });
  try {
    const { rows } = await pool.query<{ tablename: string }>(
      "select tablename from pg_tables where schemaname = 'public'",
    );
    const tabelas = rows.map((r) => `"${r.tablename}"`);
    if (tabelas.length) await pool.query(`TRUNCATE ${tabelas.join(", ")} RESTART IDENTITY CASCADE`);

    // Sem conta não há login, e sem login a API responde 401 em tudo.
    for (const conta of [CONTA_E2E, CONTA_VIZINHA]) {
      const { rows } = await pool.query<{ id: number }>(
        "insert into contas (nome) values ($1) returning id",
        [conta.nome],
      );
      await pool.query(
        "insert into usuarios (conta_id, login, senha_hash, nome, papel) values ($1, $2, $3, $4, 'admin')",
        [rows[0].id, conta.login, await gerarHashSenha(conta.senha), conta.nome],
      );
    }

    console.log("[e2e] database truncated · contas de teste criadas");
  } finally {
    await pool.end();
  }
}
