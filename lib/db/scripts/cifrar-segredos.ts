/**
 * Cifra os segredos gravados em claro antes da cifra existir: senhas gov.br e
 * NFS-e dos clientes e as senhas por sistema (`credenciais`).
 *
 * Idempotente: o que já está no formato `v1$…` é pulado. Rode uma vez depois
 * de subir a versão com cifra, com a MESMA `CHAVE_CIFRA` que a API usa.
 *
 * Uso: CHAVE_CIFRA=… pnpm --filter @workspace/db run cifrar-segredos [-- --dry]
 */
import pg from "pg";
import { cifrar, estaCifrado } from "../src/cifra.ts";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL must be set.");
}
if (!process.env.CHAVE_CIFRA) {
  throw new Error(
    "CHAVE_CIFRA must be set: cifrar com a chave de desenvolvimento perderia as senhas.",
  );
}

const dry = process.argv.includes("--dry");
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();

const ALVOS: Array<{ tabela: string; colunas: string[] }> = [
  { tabela: "clientes", colunas: ["senha_gov", "senha_nfse"] },
  { tabela: "credenciais", colunas: ["senha"] },
];

try {
  for (const { tabela, colunas } of ALVOS) {
    const { rows } = await client.query<Record<string, string | null> & { id: number }>(
      `select id, ${colunas.join(", ")} from ${tabela} where ${colunas
        .map((c) => `(${c} is not null and ${c} not like 'v1$%')`)
        .join(" or ")} order by id`,
    );
    let cifradas = 0;
    for (const linha of rows) {
      const sets: string[] = [];
      const valores: unknown[] = [];
      for (const c of colunas) {
        const v = linha[c];
        if (v && !estaCifrado(v)) {
          valores.push(cifrar(v));
          sets.push(`${c} = $${valores.length}`);
          cifradas += 1;
        }
      }
      if (!sets.length) continue;
      valores.push(linha.id);
      if (!dry)
        await client.query(
          `update ${tabela} set ${sets.join(", ")} where id = $${valores.length}`,
          valores,
        );
    }
    console.log(
      `[cifrar-segredos] ${tabela}: ${rows.length} linha(s), ${cifradas} valor(es) ${dry ? "a cifrar (dry)" : "cifrado(s)"}`,
    );
  }
} finally {
  await client.end();
}
