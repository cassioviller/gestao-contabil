/**
 * Cria um escritório novo (conta + primeiro usuário) já com o catálogo padrão
 * de obrigações. É por aqui que entram novos clientes do sistema — não existe
 * tela de cadastro aberta.
 *
 * Uso:
 *   pnpm --filter @workspace/db run criar-conta -- --nome="Contabilidade X" --login=x --senha=segredo
 *
 * O perfil aceita também --cnpj, --responsavel, --crc, --telefone e --email;
 * o que faltar a contadora completa depois na tela de Perfil do escritório.
 *
 * Sem `--senha`, sorteia uma e imprime na tela (anote: não dá para recuperar).
 * Para trocar a senha de um usuário que já existe, use `--trocar-senha`.
 */
import { randomBytes } from "node:crypto";
import pg from "pg";
import { gerarHashSenha } from "../src/senha.ts";
import { TIPOS_PADRAO } from "../src/tipos-padrao.ts";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL must be set.");
}

function arg(nome: string): string | undefined {
  return process.argv
    .slice(2)
    .find((a) => a.startsWith(`--${nome}=`))
    ?.slice(nome.length + 3);
}

// A tela de login normaliza para minúsculas antes de consultar, então gravar em
// caixa alta aqui criaria um usuário que nunca consegue entrar.
const login = arg("login")?.trim().toLowerCase();
const nome = arg("nome") ?? login;
const trocarSenha = process.argv.includes("--trocar-senha");

if (!login) {
  console.error(
    'Informe o login: pnpm --filter @workspace/db run criar-conta -- --nome="Contabilidade X" --login=x [--senha=segredo]',
  );
  process.exit(1);
}

// base64url de 12 bytes: 16 caracteres, sem símbolo que atrapalhe copiar/colar.
const senha = arg("senha") ?? randomBytes(12).toString("base64url");

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();

try {
  await client.query("begin");

  const { rows: jaExiste } = await client.query<{ id: number; conta_id: number }>(
    "select id, conta_id from usuarios where login = $1",
    [login],
  );

  if (jaExiste.length) {
    if (!trocarSenha) {
      console.error(
        `Já existe um usuário "${login}" (conta #${jaExiste[0].conta_id}). ` +
          "Use --trocar-senha para redefinir a senha dele, ou escolha outro login.",
      );
      await client.query("rollback");
      await client.end();
      process.exit(1);
    }
    await client.query("update usuarios set senha_hash = $1 where id = $2", [
      await gerarHashSenha(senha),
      jaExiste[0].id,
    ]);
    await client.query("delete from sessoes where usuario_id = $1", [jaExiste[0].id]);
    await client.query("commit");
    console.log(`\nSenha de "${login}" redefinida. As sessões abertas caíram.`);
    console.log(`  login: ${login}\n  senha: ${senha}\n`);
    await client.end();
    process.exit(0);
  }

  const { rows: contaRows } = await client.query<{ id: number }>(
    `insert into contas (nome, cnpj, responsavel, crc, telefone, email)
     values ($1, $2, $3, $4, $5, $6) returning id`,
    [
      nome,
      arg("cnpj") ?? null,
      arg("responsavel") ?? null,
      arg("crc") ?? null,
      arg("telefone") ?? null,
      arg("email") ?? null,
    ],
  );
  const contaId = contaRows[0].id;

  await client.query(
    "insert into usuarios (conta_id, login, senha_hash, nome) values ($1, $2, $3, $4)",
    [contaId, login, await gerarHashSenha(senha), nome],
  );

  await client.query(
    `insert into tipos_obrigacao (conta_id, nome, ordem)
     select $1, * from unnest($2::text[], $3::int[])
     on conflict (conta_id, nome) do nothing`,
    [contaId, TIPOS_PADRAO, TIPOS_PADRAO.map((_, i) => i + 1)],
  );

  await client.query("commit");

  console.log(`\nConta #${contaId} "${nome}" criada com ${TIPOS_PADRAO.length} tipos padrão.`);
  console.log(`  login: ${login}`);
  console.log(`  senha: ${senha}\n`);
  console.log("Anote a senha — ela não fica guardada em texto e não dá para recuperar.");
} catch (erro) {
  await client.query("rollback");
  throw erro;
} finally {
  await client.end();
}
