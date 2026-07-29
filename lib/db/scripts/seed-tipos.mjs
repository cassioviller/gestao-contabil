/**
 * Popula o catálogo de tipos de obrigação com a lista padrão do escritório.
 *
 * Idempotente: `tipos_obrigacao.nome` é único, então rodar de novo só reordena
 * os que já existem e insere o que faltar — nunca duplica, nunca apaga tipos
 * criados à mão na tela de Tipos de obrigação.
 *
 * Uso: pnpm --filter @workspace/db run seed-tipos
 */
import pg from "pg";

const TIPOS_PADRAO = [
  "INSS",
  "FGTS",
  "FOLHA DE PAGAMENTO",
  "PARCELAMENTO",
  "REINF",
  "MIT",
  "BALANCETE",
  "DIFAL",
  "ECB",
  "ECF",
  "DECLARAÇÃO MEI",
  "SEDIF",
  "EFD ICMS",
  "EFD CONTRIBUIÇÕES",
];

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL must be set.");
}

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();

const nomes = TIPOS_PADRAO;
const ordens = TIPOS_PADRAO.map((_, i) => i + 1);

await client.query(
  `insert into tipos_obrigacao (nome, ordem)
   select * from unnest($1::text[], $2::int[])
   on conflict (nome) do update set ordem = excluded.ordem`,
  [nomes, ordens],
);

const { rows } = await client.query("select count(*)::int n from tipos_obrigacao");
console.log(`[seed-tipos] ${TIPOS_PADRAO.length} tipos garantidos · ${rows[0].n} no catálogo`);
await client.end();
