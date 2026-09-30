/**
 * Repõe o catálogo padrão de tipos de obrigação (o mesmo que `criar-conta` e o
 * bootstrap da API usam) nas contas existentes.
 *
 * Idempotente: o nome é único dentro da conta, então rodar de novo só insere o
 * que faltar e completa descrição/vencimento/regimes de quem estava sem —
 * nunca duplica, nunca apaga nem reordena o que a contadora criou ou editou
 * na tela de Tipos de obrigação.
 *
 * Uso: pnpm --filter @workspace/db run seed-tipos [-- --conta=2]
 * Sem `--conta`, repõe o catálogo de **todas** as contas.
 */
import pg from "pg";
import { inserirCatalogoPadrao } from "../src/instalacao.ts";
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

for (const conta of contas) {
  const { rows: antes } = await client.query<{ n: number }>(
    "select count(*)::int n from tipos_obrigacao where conta_id = $1",
    [conta.id],
  );
  await inserirCatalogoPadrao(client, conta.id);
  const { rows: depois } = await client.query<{ n: number }>(
    "select count(*)::int n from tipos_obrigacao where conta_id = $1",
    [conta.id],
  );
  console.log(
    `[seed-tipos] conta #${conta.id} (${conta.nome}): ${TIPOS_PADRAO.length} tipos padrão garantidos · ` +
      `${depois[0].n - antes[0].n} novo(s) · ${depois[0].n} no catálogo`,
  );
}

await client.end();
