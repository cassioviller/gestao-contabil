/**
 * Converte um banco single-tenant (o de antes do login) em multitenant, sem
 * perder nada: cria `contas`/`usuarios`/`sessoes`, cria a conta inicial com um
 * usuário, carimba `conta_id` em tudo o que já existe e troca os índices únicos
 * globais por índices por conta.
 *
 * Idempotente — rodar duas vezes não duplica conta nem mexe em dados já
 * migrados. Roda inteiro numa transação: ou migra tudo, ou não migra nada.
 *
 * Uso: pnpm --filter @workspace/db run migrar-multitenant [-- --login=x --senha=y --nome="Escritório"]
 */
import pg from "pg";
import { gerarHashSenha } from "../src/senha.ts";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL must be set.");
}

function arg(nome: string, padrao: string): string {
  const achado = process.argv.slice(2).find((a) => a.startsWith(`--${nome}=`));
  return achado ? achado.slice(nome.length + 3) : padrao;
}

// Minúsculas: é assim que a API procura o login na hora de entrar.
const LOGIN = arg("login", "acesso").trim().toLowerCase();
const SENHA = arg("senha", "acesso123");
const NOME_CONTA = arg("nome", "Escritório");

/** Tabelas de dados que ganham `conta_id` apontando para `contas`. */
const TABELAS_COM_CONTA = [
  "clientes",
  "tipos_obrigacao",
  "competencias",
  "checklist_itens",
  "pagamentos",
  "debitos",
  "credenciais",
  "processos",
];

const { Client } = pg;
const cliente = new Client({ connectionString: process.env.DATABASE_URL });
await cliente.connect();

try {
  await cliente.query("begin");

  // ---------------------------------------------------------------- estrutura
  await cliente.query(`
    create table if not exists contas (
      id serial primary key,
      nome text not null,
      ativo boolean not null default true,
      criado_em timestamptz not null default now()
    )
  `);

  await cliente.query(`
    create table if not exists usuarios (
      id serial primary key,
      conta_id integer not null references contas(id) on delete cascade,
      login text not null unique,
      senha_hash text not null,
      nome text,
      ativo boolean not null default true,
      criado_em timestamptz not null default now()
    )
  `);

  await cliente.query(`
    create table if not exists sessoes (
      token text primary key,
      usuario_id integer not null references usuarios(id) on delete cascade,
      criado_em timestamptz not null default now(),
      expira_em timestamptz not null
    )
  `);
  await cliente.query(
    `create index if not exists ix_sessoes_usuario on sessoes (usuario_id)`,
  );

  // ------------------------------------------------------------- conta inicial
  // A conta só é criada se ainda não existe nenhuma: numa base já migrada, os
  // dados órfãos (sem conta_id) não existem mais e não há o que adotar.
  const { rows: contasExistentes } = await cliente.query<{ id: number }>(
    `select id from contas order by id limit 1`,
  );

  let contaId: number;
  if (contasExistentes.length) {
    contaId = contasExistentes[0].id;
    console.log(`Conta #${contaId} já existe — reaproveitando.`);
  } else {
    const { rows } = await cliente.query<{ id: number }>(
      `insert into contas (nome) values ($1) returning id`,
      [NOME_CONTA],
    );
    contaId = rows[0].id;
    console.log(`Conta #${contaId} "${NOME_CONTA}" criada.`);
  }

  const { rows: usuarioExistente } = await cliente.query<{ id: number }>(
    `select id from usuarios where login = $1`,
    [LOGIN],
  );
  if (usuarioExistente.length) {
    console.log(`Usuário "${LOGIN}" já existe — senha mantida.`);
  } else {
    await cliente.query(
      `insert into usuarios (conta_id, login, senha_hash, nome) values ($1, $2, $3, $4)`,
      [contaId, LOGIN, await gerarHashSenha(SENHA), NOME_CONTA],
    );
    console.log(`Usuário "${LOGIN}" criado na conta #${contaId}.`);
  }

  // ------------------------------------------------------- coluna + backfill
  for (const tabela of TABELAS_COM_CONTA) {
    const { rows: existe } = await cliente.query(
      `select 1 from information_schema.tables where table_schema = 'public' and table_name = $1`,
      [tabela],
    );
    if (!existe.length) {
      console.log(`Tabela ${tabela} não existe — pulando.`);
      continue;
    }

    // Adiciona nula, preenche as linhas antigas e só então trava como NOT NULL:
    // ADD COLUMN ... NOT NULL direto quebraria com dados já na tabela.
    await cliente.query(
      `alter table ${tabela} add column if not exists conta_id integer`,
    );
    const { rowCount } = await cliente.query(
      `update ${tabela} set conta_id = $1 where conta_id is null`,
      [contaId],
    );
    await cliente.query(`alter table ${tabela} alter column conta_id set not null`);
    await cliente.query(`
      do $$ begin
        alter table ${tabela}
          add constraint ${tabela}_conta_id_fkey
          foreign key (conta_id) references contas(id) on delete cascade;
      exception when duplicate_object then null; end $$
    `);
    await cliente.query(
      `create index if not exists ix_${tabela}_conta on ${tabela} (conta_id)`,
    );
    console.log(`${tabela}: ${rowCount ?? 0} linha(s) adotadas pela conta #${contaId}.`);
  }

  // `configuracoes` é o caso especial: a chave era a primary key global e passa
  // a ser única só dentro da conta.
  const { rows: temConfig } = await cliente.query(
    `select 1 from information_schema.tables where table_schema = 'public' and table_name = 'configuracoes'`,
  );
  if (temConfig.length) {
    await cliente.query(
      `alter table configuracoes add column if not exists conta_id integer`,
    );
    await cliente.query(`update configuracoes set conta_id = $1 where conta_id is null`, [
      contaId,
    ]);
    await cliente.query(`alter table configuracoes alter column conta_id set not null`);
    await cliente.query(`
      do $$ begin
        alter table configuracoes
          add constraint configuracoes_conta_id_fkey
          foreign key (conta_id) references contas(id) on delete cascade;
      exception when duplicate_object then null; end $$
    `);
    await cliente.query(`alter table configuracoes drop constraint if exists configuracoes_pkey`);
    await cliente.query(`
      do $$ begin
        alter table configuracoes add primary key (conta_id, chave);
      exception when invalid_table_definition then null; end $$
    `);
    console.log("configuracoes: chave passou a ser única por conta.");
  }

  // ------------------------------------------------------- índices por conta
  // O nome da obrigação era único no banco inteiro; agora é único no escritório.
  await cliente.query(
    `alter table tipos_obrigacao drop constraint if exists tipos_obrigacao_nome_unique`,
  );
  await cliente.query(
    `alter table tipos_obrigacao drop constraint if exists tipos_obrigacao_nome_key`,
  );
  await cliente.query(`drop index if exists tipos_obrigacao_nome_unique`);
  await cliente.query(
    `create unique index if not exists ux_tipo_obrigacao_nome on tipos_obrigacao (conta_id, nome)`,
  );

  // Mesma ideia para o mês aberto: dois escritórios podem abrir 05/2026.
  await cliente.query(`drop index if exists ux_competencia_ano_mes`);
  await cliente.query(
    `create unique index if not exists ux_competencia_ano_mes on competencias (conta_id, ano, mes)`,
  );
  console.log("Índices únicos passaram a ser por conta.");

  await cliente.query("commit");
  console.log("\nMigração concluída.");
} catch (erro) {
  await cliente.query("rollback");
  console.error("Migração revertida — nada foi alterado.");
  throw erro;
} finally {
  await cliente.end();
}
