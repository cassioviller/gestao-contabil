/**
 * Importa o cadastro de empresas a partir de uma planilha .xlsx.
 *
 * Colunas esperadas (as da Pasta1.xlsx): Cód. | Razão Social | CNPJ |
 * Inscrição Estadual | Envio.
 *
 * A coluna "Envio" mistura canal, nome do contato e às vezes um CPF, então ela
 * vai inteira para `forma_envio` (nada se perde) e, quando dá para separar com
 * segurança, o nome vai também para `contato_nome` e o CPF para `socio_cpf`.
 *
 * Idempotente: pula linhas cujo CNPJ ou código já exista no banco.
 *
 * Uso: pnpm --filter @workspace/db run import-clientes -- ./Pasta1.xlsx
 */
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import pg from "pg";

// `pnpm run ... -- arquivo.xlsx` repassa o "--", então ignoramos separador e flags.
const argumentos = process.argv.slice(2).filter((a) => a !== "--" && !a.startsWith("--"));
const arquivo = argumentos[0];
if (!arquivo) throw new Error("Informe o caminho do .xlsx");
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL must be set.");

// --- leitura do .xlsx (formato OOXML: um zip com XMLs) -----------------------

const dir = mkdtempSync(path.join(tmpdir(), "xlsx-"));
// `pnpm --filter` roda com cwd em lib/db; INIT_CWD guarda de onde o comando saiu,
// então caminhos relativos funcionam a partir da raiz do workspace.
const caminho = path.resolve(process.env.INIT_CWD || process.cwd(), arquivo);
execFileSync("unzip", ["-o", "-q", caminho, "-d", dir]);

const desescapar = (s) =>
  s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(+d))
    .replace(/&amp;/g, "&");

const compartilhadas = [];
for (const m of readFileSync(`${dir}/xl/sharedStrings.xml`, "utf8").matchAll(/<si>([\s\S]*?)<\/si>/g)) {
  compartilhadas.push(desescapar([...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => t[1]).join("")));
}

const colunaParaIndice = (ref) => {
  let n = 0;
  for (const ch of ref.match(/^[A-Z]+/)[0]) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
};

const linhas = [];
for (const rowM of readFileSync(`${dir}/xl/worksheets/sheet1.xml`, "utf8").matchAll(
  /<row[^>]*r="(\d+)"[^>]*>([\s\S]*?)<\/row>/g
)) {
  const celulas = [];
  for (const cM of rowM[2].matchAll(/<c([^>]*)>([\s\S]*?)<\/c>/g)) {
    const ref = cM[1].match(/r="([A-Z]+\d+)"/)?.[1];
    const tipo = cM[1].match(/t="([^"]+)"/)?.[1];
    let valor = "";
    if (tipo === "s") {
      const v = cM[2].match(/<v>(\d+)<\/v>/);
      valor = v ? compartilhadas[+v[1]] : "";
    } else if (tipo === "inlineStr") {
      valor = desescapar([...cM[2].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => t[1]).join(""));
    } else {
      const v = cM[2].match(/<v>([\s\S]*?)<\/v>/);
      valor = v ? desescapar(v[1]) : "";
    }
    if (ref && valor !== "") celulas[colunaParaIndice(ref)] = valor;
  }
  if (celulas.length) linhas.push({ num: +rowM[1], celulas });
}

// --- normalização ------------------------------------------------------------

const limpar = (v) => (v ?? "").replace(/\s+/g, " ").trim();
/** "-" e vazio significam "não tem". */
const ouNulo = (v) => {
  const s = limpar(v);
  return s && s !== "-" ? s : null;
};

/** Separa a coluna "Envio" em contato e CPF sem descartar o texto original. */
function separarEnvio(bruto) {
  const raw = limpar(bruto);
  if (!raw) return { formaEnvio: null, contatoNome: null, socioCpf: null };

  const cpf = raw.match(/\b(\d{11})\b/)?.[1] ?? null;
  let resto = cpf ? raw.replace(cpf, " ") : raw;
  resto = resto
    .replace(/\b(e-?mails?|wpp|whatsapp|zap)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^[-–,;:]+\s*/, "")
    .replace(/\s*[-–,;:]+$/, "")
    .trim();

  return {
    formaEnvio: raw,
    contatoNome: /[a-zà-úA-ZÀ-Ú]/.test(resto) ? resto : null,
    socioCpf: cpf,
  };
}

const SEM_NOME = "(sem razão social)";
const registros = [];
for (const { num, celulas } of linhas) {
  if (num === 1) continue; // cabeçalho
  const [codigo, razao, cnpj, ie, envio] = celulas;
  const nome = limpar(razao);
  const temAlgo = limpar(codigo) || nome || limpar(cnpj) || limpar(ie) || limpar(envio);
  if (!temAlgo) continue;

  const { formaEnvio, contatoNome, socioCpf } = separarEnvio(envio);
  registros.push({
    linha: num,
    codigo: /^\d+$/.test(limpar(codigo)) ? Number(limpar(codigo)) : null,
    razaoSocial: nome || SEM_NOME,
    cnpj: ouNulo(cnpj),
    inscricaoEstadual: ouNulo(ie),
    formaEnvio,
    contatoNome,
    socioCpf,
  });
}

// --- gravação ----------------------------------------------------------------

if (process.argv.includes("--dry")) {
  console.log(`[dry-run] ${registros.length} linhas lidas — nada gravado\n`);
  console.table(
    registros.map((r) => ({
      lin: r.linha,
      cod: r.codigo,
      razaoSocial: r.razaoSocial.slice(0, 42),
      cnpj: r.cnpj,
      ie: r.inscricaoEstadual,
      envio: r.formaEnvio,
      contato: r.contatoNome,
      cpf: r.socioCpf,
    }))
  );
  process.exit(0);
}

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();

// A planilha entra dentro de uma conta. Sem `--conta=`, vale a primeira (o caso
// de quem só tem um escritório); com mais de uma, exigir a escolha evita
// despejar 90 empresas no escritório errado.
const contaPedida = process.argv.slice(2).find((a) => a.startsWith("--conta="))?.slice(8);
const { rows: contas } = await client.query("select id, nome from contas order by id");
if (!contas.length) {
  console.error("Nenhuma conta cadastrada. Rode antes: pnpm --filter @workspace/db run criar-conta");
  await client.end();
  process.exit(1);
}
const conta = contaPedida
  ? contas.find((c) => String(c.id) === contaPedida)
  : contas.length === 1
    ? contas[0]
    : null;
if (!conta) {
  console.error(
    contaPedida
      ? `Conta ${contaPedida} não existe.`
      : `Há mais de uma conta — escolha com --conta=<id>: ${contas.map((c) => `${c.id}=${c.nome}`).join(", ")}`
  );
  await client.end();
  process.exit(1);
}
console.log(`[import] importando para a conta #${conta.id} (${conta.nome})`);

const existentes = await client.query("select codigo, cnpj from clientes where conta_id = $1", [
  conta.id,
]);
const cnpjsUsados = new Set(existentes.rows.map((r) => r.cnpj).filter(Boolean));
const codigosUsados = new Set(existentes.rows.map((r) => r.codigo).filter((c) => c !== null));

let inseridos = 0;
const pulados = [];
for (const r of registros) {
  if (r.cnpj && cnpjsUsados.has(r.cnpj)) {
    pulados.push(`linha ${r.linha}: CNPJ ${r.cnpj} já cadastrado`);
    continue;
  }
  if (r.codigo !== null && codigosUsados.has(r.codigo)) {
    pulados.push(`linha ${r.linha}: código ${r.codigo} já cadastrado`);
    continue;
  }
  await client.query(
    `insert into clientes
       (conta_id, codigo, razao_social, cnpj, inscricao_estadual, forma_envio, contato_nome, socio_cpf, ativo)
     values ($1,$2,$3,$4,$5,$6,$7,$8,true)`,
    [conta.id, r.codigo, r.razaoSocial, r.cnpj, r.inscricaoEstadual, r.formaEnvio, r.contatoNome, r.socioCpf]
  );
  if (r.cnpj) cnpjsUsados.add(r.cnpj);
  if (r.codigo !== null) codigosUsados.add(r.codigo);
  inseridos++;
}

const total = (
  await client.query("select count(*)::int n from clientes where conta_id = $1", [conta.id])
).rows[0].n;
console.log(`[import] ${inseridos} inseridos · ${pulados.length} pulados · ${total} clientes no banco`);
for (const p of pulados) console.log(`  · ${p}`);
await client.end();
