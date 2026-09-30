import pg from "pg";
// Importa só o módulo de senha: `@workspace/db` inteiro abriria um pool de
// conexões que o setup não usa.
import { gerarHashSenha } from "@workspace/db/senha";

// The journey test seeds the DB through the UI. Truncate first so each run
// starts from a clean, deterministic state (unique constraints on tipo name and
// competencia ano/mes would otherwise make a second run fail).
const TABLES = [
  "cobrancas",
  "folha_lancamentos",
  "ferias",
  "funcionarios",
  "despesas",
  "pagamentos",
  "checklist_itens",
  "cliente_obrigacoes",
  "competencias",
  "debitos",
  "credenciais",
  "processo_etapas",
  "processos",
  "clientes",
  "tipos_obrigacao",
  "configuracoes",
  "sessoes",
  "usuarios",
  "contas",
];

/** Conta usada por toda a suíte. `auth.setup.ts` entra com ela e guarda o cookie. */
export const CONTA_E2E = { nome: "Escritório e2e", login: "e2e", senha: "e2e123" };

/** Segunda conta, só para provar que uma não enxerga os dados da outra. */
export const CONTA_VIZINHA = {
  nome: "Escritório vizinho",
  login: "vizinho",
  senha: "vizinho123",
};

export default async function globalSetup() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is required to run e2e tests.");

  const pool = new pg.Pool({ connectionString: url });
  try {
    await pool.query(`TRUNCATE ${TABLES.join(", ")} RESTART IDENTITY CASCADE`);

    // Sem conta não há login, e sem login a API responde 401 em tudo.
    for (const conta of [CONTA_E2E, CONTA_VIZINHA]) {
      const { rows } = await pool.query<{ id: number }>(
        "insert into contas (nome) values ($1) returning id",
        [conta.nome],
      );
      await pool.query(
        "insert into usuarios (conta_id, login, senha_hash, nome) values ($1, $2, $3, $4)",
        [rows[0].id, conta.login, await gerarHashSenha(conta.senha), conta.nome],
      );
    }

    // eslint-disable-next-line no-console
    console.log("[e2e] database truncated · contas de teste criadas");
  } finally {
    await pool.end();
  }
}
