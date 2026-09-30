import type { Pool, PoolClient } from "pg";
import { DADOS, SCHEMA_SQL } from "./seed/gerado";
import { ORDEM_TABELAS, TABELAS_COM_SEQUENCE } from "./tabelas";

type Registro = Record<string, unknown>;

async function tabelaExiste(cliente: PoolClient, nome: string): Promise<boolean> {
  const { rows } = await cliente.query(
    `select 1 from information_schema.tables where table_schema = 'public' and table_name = $1`,
    [nome],
  );
  return rows.length > 0;
}

/**
 * Carrega o seed preservando os ids originais — as tabelas se referenciam por
 * id, e renumerar quebraria todos os vínculos entre cliente, obrigação e
 * competência.
 */
async function carregarDados(cliente: PoolClient): Promise<number> {
  let total = 0;

  for (const tabela of ORDEM_TABELAS) {
    const linhas = (DADOS[tabela] ?? []) as Registro[];
    if (!linhas.length) continue;

    const colunas = Object.keys(linhas[0]);
    const listaColunas = colunas.map((c) => `"${c}"`).join(", ");

    for (const linha of linhas) {
      const marcadores = colunas.map((_, i) => `$${i + 1}`).join(", ");
      await cliente.query(
        `insert into ${tabela} (${listaColunas}) values (${marcadores}) on conflict do nothing`,
        colunas.map((c) => linha[c] ?? null),
      );
      total++;
    }
  }

  // Ids gravados à mão não avançam a sequence: sem isto o primeiro cadastro
  // feito na tela tentaria reusar o id 1 e estouraria a chave primária.
  for (const tabela of TABELAS_COM_SEQUENCE) {
    await cliente.query(
      `select setval(
         pg_get_serial_sequence($1, 'id'),
         coalesce((select max(id) from ${tabela}), 1),
         (select count(*) > 0 from ${tabela})
       ) where pg_get_serial_sequence($1, 'id') is not null`,
      [tabela],
    );
  }

  return total;
}

/**
 * Prepara o banco no boot da API. Três situações:
 *
 * 1. **Banco vazio** (deploy recém-publicado) — cria a estrutura e carrega o
 *    seed, para o sistema já subir com os dados do escritório.
 * 2. **Banco com estrutura antiga**, de antes do login — cria só as tabelas
 *    novas e deixa os dados existentes intactos; o `conta_id` fica a cargo do
 *    script `migrar-multitenant`, que é onde essa decisão deve ser tomada com
 *    o operador junto.
 * 3. **Banco já em uso** — não faz nada. É a regra que impede o seed de
 *    sobrescrever o trabalho real de produção a cada deploy.
 */
export async function garantirBanco(pool: Pool): Promise<string> {
  const cliente = await pool.connect();
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

    if (!temContas) {
      await cliente.query("begin");
      try {
        await cliente.query(SCHEMA_SQL);
        // O dump zera o `search_path` da sessão (ele qualifica tudo com
        // `public.`). Sem repor, as consultas seguintes não achariam as tabelas
        // que acabaram de ser criadas.
        await cliente.query("set search_path to public");
        const total = await carregarDados(cliente);
        await cliente.query("commit");
        return `Banco vazio: estrutura criada e ${total} linha(s) do seed carregadas.`;
      } catch (erro) {
        await cliente.query("rollback");
        throw erro;
      }
    }

    const { rows } = await cliente.query<{ n: number }>(
      "select count(*)::int n from contas",
    );
    if (rows[0].n === 0) {
      await cliente.query("begin");
      try {
        const total = await carregarDados(cliente);
        await cliente.query("commit");
        return `Estrutura já existia e não havia nenhuma conta: ${total} linha(s) do seed carregadas.`;
      } catch (erro) {
        await cliente.query("rollback");
        throw erro;
      }
    }

    return `Banco já em uso (${rows[0].n} conta(s)) — seed ignorado.`;
  } finally {
    cliente.release();
  }
}
