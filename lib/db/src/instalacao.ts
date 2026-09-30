import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Pool, PoolClient } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
// Extensão explícita: os scripts em ./scripts rodam com `node` puro (sem
// bundler), que só resolve import relativo com o caminho completo.
import { gerarHashSenha } from "./senha.ts";
import { TIPOS_PADRAO } from "./tipos-padrao.ts";

/** Chave do advisory lock: várias instâncias do autoscale não migram ao mesmo tempo. */
const CHAVE_LOCK = 7_140_331;

const SCHEMA_MIGRACOES = "drizzle";
const TABELA_MIGRACOES = "__drizzle_migrations";

async function tabelaExiste(
  cliente: PoolClient,
  nome: string,
  schema = "public",
): Promise<boolean> {
  const { rows } = await cliente.query(
    `select 1 from information_schema.tables where table_schema = $1 and table_name = $2`,
    [schema, nome],
  );
  return rows.length > 0;
}

/**
 * Onde estão as migrations. No bundle da API o `build.mjs` copia a pasta para
 * `dist/drizzle`; nos scripts e testes ela é a `lib/db/drizzle` do repositório.
 * `MIGRACOES_DIR` sobrescreve os dois.
 */
export function pastaDeMigracoes(): string {
  if (process.env.MIGRACOES_DIR) return process.env.MIGRACOES_DIR;
  const candidatos = [
    // dist/index.mjs → dist/drizzle
    path.join(dirAtual(), "drizzle"),
    // lib/db/src/instalacao.ts → lib/db/drizzle
    path.join(dirAtual(), "..", "drizzle"),
    path.join(process.cwd(), "lib", "db", "drizzle"),
    path.join(process.cwd(), "..", "..", "lib", "db", "drizzle"),
  ];
  const achado = candidatos.find((c) => existsSync(path.join(c, "meta", "_journal.json")));
  if (!achado) {
    throw new Error(
      `Pasta de migrations não encontrada. Procurei em: ${candidatos.join(", ")}. ` +
        "Defina MIGRACOES_DIR ou rode o build da API.",
    );
  }
  return achado;
}

function dirAtual(): string {
  // No bundle esbuild, `import.meta.url` é a do dist/index.mjs; no fonte, a
  // deste arquivo. Os dois casos estão na lista de candidatos.
  try {
    return path.dirname(fileURLToPath(import.meta.url));
  } catch {
    return process.cwd();
  }
}

type EntradaJournal = { idx: number; when: number; tag: string };

function lerJournal(pasta: string): EntradaJournal[] {
  const journal = JSON.parse(readFileSync(path.join(pasta, "meta", "_journal.json"), "utf8")) as {
    entries: EntradaJournal[];
  };
  return journal.entries;
}

/**
 * Banco criado antes das migrations existirem (pelo dump do `pg_dump` que o
 * boot antigo aplicava) já tem toda a estrutura da baseline. Marcá-la como
 * aplicada evita que o `migrate()` tente recriar as tabelas e falhe.
 */
async function marcarBaselineSeNecessario(cliente: PoolClient, pasta: string): Promise<boolean> {
  const temEstrutura = await tabelaExiste(cliente, "contas");
  const temRegistro = await tabelaExiste(cliente, TABELA_MIGRACOES, SCHEMA_MIGRACOES);
  if (!temEstrutura || temRegistro) return false;

  const [baseline] = lerJournal(pasta);
  const sql = readFileSync(path.join(pasta, `${baseline.tag}.sql`), "utf8");
  const { createHash } = await import("node:crypto");
  const hash = createHash("sha256").update(sql).digest("hex");

  await cliente.query(`create schema if not exists "${SCHEMA_MIGRACOES}"`);
  await cliente.query(
    `create table if not exists "${SCHEMA_MIGRACOES}"."${TABELA_MIGRACOES}" (
       id serial primary key, hash text not null, created_at bigint
     )`,
  );
  await cliente.query(
    `insert into "${SCHEMA_MIGRACOES}"."${TABELA_MIGRACOES}" ("hash", "created_at") values ($1, $2)`,
    [hash, baseline.when],
  );
  return true;
}

/**
 * Primeiro escritório de um banco vazio, por variáveis de ambiente. Substitui
 * o seed versionado (que carregava a conta real e o hash da senha no git). As
 * variáveis podem ser removidas depois do primeiro boot: com uma conta
 * existente, nada acontece.
 */
async function bootstrapPrimeiraConta(cliente: PoolClient): Promise<string | null> {
  const nome = process.env.BOOTSTRAP_CONTA_NOME?.trim();
  const login = process.env.BOOTSTRAP_LOGIN?.trim().toLowerCase();
  const senha = process.env.BOOTSTRAP_SENHA;
  if (!nome || !login || !senha) return null;

  const { rows } = await cliente.query<{ n: number }>("select count(*)::int n from contas");
  if (rows[0].n > 0) return null;

  if (senha.length < 10) {
    throw new Error("BOOTSTRAP_SENHA precisa ter ao menos 10 caracteres.");
  }

  await cliente.query("begin");
  try {
    const { rows: conta } = await cliente.query<{ id: number }>(
      "insert into contas (nome) values ($1) returning id",
      [nome],
    );
    const contaId = conta[0].id;
    await cliente.query(
      "insert into usuarios (conta_id, login, senha_hash, nome, papel) values ($1, $2, $3, $4, 'admin')",
      [contaId, login, await gerarHashSenha(senha), nome],
    );
    await inserirCatalogoPadrao(cliente, contaId);
    await cliente.query("commit");
    return `Primeiro escritório "${nome}" criado com o usuário "${login}".`;
  } catch (erro) {
    await cliente.query("rollback");
    throw erro;
  }
}

/**
 * Copia o catálogo padrão para uma conta. Idempotente pelo nome: não duplica,
 * não sobrescreve o que a contadora já editou; só preenche o que falta.
 */
export async function inserirCatalogoPadrao(
  cliente: { query: PoolClient["query"] },
  contaId: number,
): Promise<number> {
  let inseridos = 0;
  for (const [i, t] of TIPOS_PADRAO.entries()) {
    const { rowCount } = await cliente.query(
      `insert into tipos_obrigacao
         (conta_id, nome, ordem, descricao, periodicidade, mes_referencia, dia_vencimento,
          offset_mes, regimes, vincular_automatico)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       on conflict (conta_id, nome) do update set
         descricao = coalesce(tipos_obrigacao.descricao, excluded.descricao),
         dia_vencimento = coalesce(tipos_obrigacao.dia_vencimento, excluded.dia_vencimento),
         regimes = coalesce(tipos_obrigacao.regimes, excluded.regimes)`,
      [
        contaId,
        t.nome,
        i + 1,
        t.descricao,
        t.periodicidade,
        t.mesReferencia,
        t.diaVencimento,
        t.offsetMes,
        t.regimes,
        t.vincularAutomatico,
      ],
    );
    inseridos += rowCount ?? 0;
  }
  return inseridos;
}

/**
 * Prepara o banco no boot da API, com lock para o autoscale:
 *
 * 1. Banco de antes do login (tem `clientes`, não tem `contas`): não mexe e
 *    pede o `migrar-multitenant`.
 * 2. Banco criado pelo dump antigo, sem registro de migrations: marca a
 *    baseline como aplicada.
 * 3. Aplica as migrations que faltam (`lib/db/drizzle`).
 * 4. Banco sem nenhuma conta: cria a primeira pelas variáveis BOOTSTRAP_*.
 */
export async function garantirBanco(pool: Pool): Promise<string> {
  const cliente = await pool.connect();
  const partes: string[] = [];
  try {
    await cliente.query("select pg_advisory_lock($1)", [CHAVE_LOCK]);
    try {
      const temContas = await tabelaExiste(cliente, "contas");
      const temClientes = await tabelaExiste(cliente, "clientes");
      if (!temContas && temClientes) {
        return (
          "Banco com estrutura anterior ao login (tem `clientes`, não tem `contas`) — " +
          "nada foi alterado. Rode `pnpm --filter @workspace/db run migrar-multitenant` " +
          "apontando para ele antes de subir a API."
        );
      }

      const pasta = pastaDeMigracoes();
      if (await marcarBaselineSeNecessario(cliente, pasta)) {
        partes.push("baseline marcada como aplicada");
      }

      const antes = await contarMigracoes(cliente);
      await migrate(drizzle(cliente), {
        migrationsFolder: pasta,
        migrationsSchema: SCHEMA_MIGRACOES,
        migrationsTable: TABELA_MIGRACOES,
      });
      const depois = await contarMigracoes(cliente);
      partes.push(
        depois > antes ? `${depois - antes} migration(s) aplicada(s)` : "migrations em dia",
      );

      const bootstrap = await bootstrapPrimeiraConta(cliente);
      if (bootstrap) partes.push(bootstrap);
      else {
        const { rows } = await cliente.query<{ n: number }>("select count(*)::int n from contas");
        partes.push(
          rows[0].n === 0
            ? "nenhuma conta ainda: defina BOOTSTRAP_CONTA_NOME/LOGIN/SENHA ou rode criar-conta"
            : `${rows[0].n} conta(s)`,
        );
      }
      return partes.join(" · ");
    } finally {
      await cliente.query("select pg_advisory_unlock($1)", [CHAVE_LOCK]);
    }
  } finally {
    cliente.release();
  }
}

async function contarMigracoes(cliente: PoolClient): Promise<number> {
  if (!(await tabelaExiste(cliente, TABELA_MIGRACOES, SCHEMA_MIGRACOES))) return 0;
  const { rows } = await cliente.query<{ n: number }>(
    `select count(*)::int n from "${SCHEMA_MIGRACOES}"."${TABELA_MIGRACOES}"`,
  );
  return rows[0].n;
}
