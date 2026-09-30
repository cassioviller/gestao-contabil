/**
 * Popula o catálogo de tipos de obrigação com a lista padrão do escritório.
 *
 * Idempotente: o nome é único dentro da conta, então rodar de novo só reordena
 * os que já existem e insere o que faltar — nunca duplica, nunca apaga tipos
 * criados à mão na tela de Tipos de obrigação.
 *
 * Uso: pnpm --filter @workspace/db run seed-tipos [-- --conta=2]
 * Sem `--conta`, repõe o catálogo de **todas** as contas.
 */
import pg from "pg";
import { TIPOS_PADRAO } from "../src/tipos-padrao.ts";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL must be set.");
}

const filtroConta = process.argv
  .slice(2)
  .find((a) => a.startsWith("--conta="))
  ?.slice("--conta=".length);

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();

const { rows: contas } = filtroConta
  ? await client.query<{ id: number; nome: string }>(
      "select id, nome from contas where id = $1",
      [Number(filtroConta)],
    )
  : await client.query<{ id: number; nome: string }>(
      "select id, nome from contas order by id",
    );

if (!contas.length) {
  console.error(
    "Nenhuma conta encontrada. Crie uma antes: pnpm --filter @workspace/db run criar-conta",
  );
  await client.end();
  process.exit(1);
}

const ordens = TIPOS_PADRAO.map((_, i) => i + 1);

for (const conta of contas) {
  await client.query(
    `insert into tipos_obrigacao (conta_id, nome, ordem)
     select $1, * from unnest($2::text[], $3::int[])
     on conflict (conta_id, nome) do update set ordem = excluded.ordem`,
    [conta.id, TIPOS_PADRAO, ordens],
  );

  const { rows } = await client.query<{ n: number }>(
    "select count(*)::int n from tipos_obrigacao where conta_id = $1",
    [conta.id],
  );
  console.log(
    `[seed-tipos] conta #${conta.id} (${conta.nome}): ${TIPOS_PADRAO.length} tipos garantidos · ${rows[0].n} no catálogo`,
  );
}

await client.end();
