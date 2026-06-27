// Importa o controle contábil da planilha Excel para o Postgres.
//
// Estratégia (ver conversa de planejamento):
//  - A aba "DADOS" tem os campos de cadastro fixo (Procuração, Senha NFS-e, OBS).
//  - A aba do mês mais recente ("JUNHO 2026") tem as obrigações operacionais
//    atuais e a forma de envio. As duas divergiram ao longo do tempo.
//  - Mesclamos as duas POR CÓDIGO: nome/CNPJ/obrigações vêm do mês (mais atual),
//    e Procuração/Senha/OBS vêm da DADOS. Divergências de nome são reportadas.
//  - O valor do honorário NÃO existe na planilha -> fica nulo para preencher depois.
//
// Não inventa: o marcador original de cada obrigação é guardado em "detalhe".
//
// Rodar:  npx tsx scripts/importar-planilha.ts [--apagar]
//   --apagar  limpa as tabelas antes de importar (reexecução limpa).

import "dotenv/config";
import { execFileSync } from "node:child_process";
import { readFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { db } from "../src/db";
import {
  clientes,
  tiposObrigacao,
  clienteObrigacoes,
} from "../src/db/schema";

const ARQUIVO_XLSX =
  process.env.XLSX_PATH ??
  "../clientes 06 (Salvo automaticamente) (Salvo automaticamente).xlsx";

const ABA_CADASTRO = "DADOS";
const ABA_MES = "JUNHO 2026";

// Catálogo canônico de obrigações + apelidos de cabeçalho usados nas abas.
// A ordem aqui vira a ordem de exibição na grade.
const OBRIGACOES: { nome: string; aliases: string[] }[] = [
  { nome: "DEFIS", aliases: ["DEFIS"] },
  { nome: "DAS", aliases: ["DAS", "DASS"] },
  { nome: "INSS/DCTFweb", aliases: ["INSS/DCTF web", "INSS/DCTFweb"] },
  { nome: "FGTS", aliases: ["FGTS"] },
  { nome: "REINF/MIT", aliases: ["REINF/MIT", "REINF"] },
  { nome: "PARCELAMENTO", aliases: ["PARCELAMENTO"] },
  { nome: "GIA", aliases: ["GIA"] },
  { nome: "SEDIF", aliases: ["SEDIF"] },
  { nome: "DIFAL", aliases: ["DIFAL"] },
  { nome: "BALANCETE", aliases: ["BALANCETE"] },
];

// Marcadores que significam "não se aplica / vazio" -> não cria a obrigação.
const NEGATIVOS = new Set(["", "-", "N", "NÃO", "NAO"]);

// ---------- Leitura crua do .xlsx (descompacta + parseia XML) ----------

type Linha = { cells: Record<string, string> };

function abrirPlanilha(caminho: string) {
  const dir = mkdtempSync(join(tmpdir(), "xlsx-"));
  execFileSync("unzip", ["-o", caminho, "-d", dir], { stdio: "ignore" });

  const decode = (s: string) =>
    s
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'");

  // shared strings
  const ss = readFileSync(join(dir, "xl/sharedStrings.xml"), "utf8");
  const strings: string[] = [];
  for (const m of ss.matchAll(/<si>(.*?)<\/si>/gs)) {
    const ts = [...m[1].matchAll(/<t[^>]*>(.*?)<\/t>/gs)].map((x) => x[1]);
    strings.push(decode(ts.join("")));
  }

  // mapa nome-da-aba -> arquivo
  const wb = readFileSync(join(dir, "xl/workbook.xml"), "utf8");
  const rels = readFileSync(join(dir, "xl/_rels/workbook.xml.rels"), "utf8");
  const ridParaArquivo = new Map<string, string>();
  for (const m of rels.matchAll(/<Relationship\b[^>]*\/>/gs)) {
    const id = m[0].match(/Id="([^"]+)"/)?.[1];
    const tgt = m[0].match(/Target="([^"]+)"/)?.[1];
    if (id && tgt && /worksheets\//.test(tgt))
      ridParaArquivo.set(id, tgt.replace(/^\/?xl\//, "").replace(/^worksheets\//, "worksheets/"));
  }
  const nomeParaArquivo = new Map<string, string>();
  for (const m of wb.matchAll(/<sheet\b[^>]*\/>/gs)) {
    const nome = decode(m[0].match(/name="([^"]+)"/)?.[1] ?? "");
    const rid = m[0].match(/r:id="([^"]+)"/)?.[1] ?? "";
    const arq = ridParaArquivo.get(rid);
    if (arq) nomeParaArquivo.set(nome.trim(), join(dir, "xl", arq));
  }

  function lerAba(nome: string): Linha[] {
    const arq = nomeParaArquivo.get(nome.trim());
    if (!arq) throw new Error(`Aba não encontrada: "${nome}"`);
    const xml = readFileSync(arq, "utf8");
    const linhas: Linha[] = [];
    for (const r of xml.matchAll(/<row\b[^>]*r="(\d+)"[^>]*>(.*?)<\/row>/gs)) {
      const cells: Record<string, string> = {};
      for (const c of r[2].matchAll(
        /<c r="([A-Z]+)\d+"(?:[^>]*t="(\w+)")?[^>]*>(?:<v>(.*?)<\/v>|<is><t[^>]*>(.*?)<\/t><\/is>)?<\/c>/gs
      )) {
        const col = c[1];
        let v = c[3] ?? c[4] ?? "";
        if (c[2] === "s") v = strings[+v] ?? "";
        else v = decode(v);
        if (v.trim() !== "") cells[col] = v.trim();
      }
      linhas.push({ cells });
    }
    return linhas;
  }

  return { lerAba, fechar: () => rmSync(dir, { recursive: true, force: true }) };
}

// Constrói: cabeçalho-normalizado -> letra da coluna, a partir da linha 1.
function mapaCabecalho(linhas: Linha[]): Record<string, string> {
  const m: Record<string, string> = {};
  for (const [col, txt] of Object.entries(linhas[0]?.cells ?? {})) {
    m[txt.trim().toUpperCase()] = col;
  }
  return m;
}

function colDe(mapa: Record<string, string>, aliases: string[]): string | null {
  for (const a of aliases) {
    const c = mapa[a.trim().toUpperCase()];
    if (c) return c;
  }
  return null;
}

// ---------- Programa principal ----------

async function main() {
  const apagar = process.argv.includes("--apagar");
  const { lerAba, fechar } = abrirPlanilha(ARQUIVO_XLSX);

  const dados = lerAba(ABA_CADASTRO);
  const mes = lerAba(ABA_MES);

  const hDados = mapaCabecalho(dados);
  const hMes = mapaCabecalho(mes);

  // Indexa linhas por Código (coluna A em ambas as abas).
  const colCodD = colDe(hDados, ["Cód.", "Cód"]) ?? "A";
  const colCodM = colDe(hMes, ["Cód.", "Cód"]) ?? "A";
  const porCodDados = new Map<string, Linha>();
  const porCodMes = new Map<string, Linha>();
  for (const l of dados.slice(1))
    if (/^\d+$/.test(l.cells[colCodD] ?? "")) porCodDados.set(l.cells[colCodD], l);
  for (const l of mes.slice(1))
    if (/^\d+$/.test(l.cells[colCodM] ?? "")) porCodMes.set(l.cells[colCodM], l);

  const todosCods = [
    ...new Set([...porCodMes.keys(), ...porCodDados.keys()]),
  ].sort((a, b) => +a - +b);

  // Colunas de cadastro
  const cRazaoM = colDe(hMes, ["Razão Social"]) ?? "B";
  const cRazaoD = colDe(hDados, ["Razão Social"]) ?? "B";
  const cInscrM = colDe(hMes, ["Inscrição Estad."]) ?? "D";
  const cEnvioM = colDe(hMes, ["Envio"]);
  const cEnvioD = colDe(hDados, ["Envio"]);
  const cProc = colDe(hDados, ["Procuração"]);
  const cSenha = colDe(hDados, ["SENHA NFS-E"]);
  const cObs = colDe(hDados, ["OBS"]);
  const cTipoDas = colDe(hMes, ["TIPO/DAS"]);
  const cDividas = colDe(hMes, ["Dividas"]);

  // Resolve colunas de obrigação em cada aba.
  const obrM = OBRIGACOES.map((o) => ({ ...o, col: colDe(hMes, o.aliases) }));
  const obrD = OBRIGACOES.map((o) => ({ ...o, col: colDe(hDados, o.aliases) }));

  // Monta registros a importar (sem tocar o banco ainda).
  const divergenciasNome: string[] = [];
  const semCnpj: string[] = [];
  const registros = todosCods.map((cod) => {
    const m = porCodMes.get(cod);
    const d = porCodDados.get(cod);
    const fonte = m ?? d!; // mês é preferido; cai pra DADOS se só existir lá
    const obr = m ? obrM : obrD;

    const razaoM = m?.cells[cRazaoM];
    const razaoD = d?.cells[cRazaoD];
    const razaoSocial = (razaoM ?? razaoD ?? "").trim();
    if (razaoM && razaoD && razaoM.trim() !== razaoD.trim())
      divergenciasNome.push(`#${cod}: mês="${razaoM}"  |  DADOS="${razaoD}"`);

    const cnpj = (fonte.cells["C"] ?? "").trim() || null;
    if (!cnpj || cnpj === "-") semCnpj.push(`#${cod} ${razaoSocial}`);

    // Observação combinada: OBS + TIPO/DAS + Dívidas (informação que não é status).
    const obsPartes: string[] = [];
    if (d && cObs && d.cells[cObs]) obsPartes.push(d.cells[cObs]);
    if (m && cTipoDas && m.cells[cTipoDas])
      obsPartes.push(`TIPO/DAS: ${m.cells[cTipoDas]}`);
    if (m && cDividas && m.cells[cDividas])
      obsPartes.push(`Dívidas: ${m.cells[cDividas]}`);

    const formaEnvio =
      (m && cEnvioM && m.cells[cEnvioM]) ||
      (d && cEnvioD && d.cells[cEnvioD]) ||
      null;

    // Obrigações aplicáveis: célula preenchida e não-negativa.
    const obrigacoes = obr
      .map((o) => {
        if (!o.col) return null;
        const val = (fonte.cells[o.col] ?? "").trim();
        if (NEGATIVOS.has(val.toUpperCase())) return null;
        // DAS guarda o marcador (V, S/V-Site...) e o TIPO/DAS como detalhe.
        let detalhe: string | null = val || null;
        if (o.nome === "DAS" && m && cTipoDas && m.cells[cTipoDas])
          detalhe = [val, m.cells[cTipoDas]].filter(Boolean).join(" · ");
        return { nome: o.nome, detalhe };
      })
      .filter((x): x is { nome: string; detalhe: string | null } => x !== null);

    return {
      codigo: +cod,
      razaoSocial,
      cnpj,
      inscricaoEstadual:
        ((m?.cells[cInscrM] ?? d?.cells["D"] ?? "").trim() || null) === "-"
          ? null
          : (m?.cells[cInscrM] ?? d?.cells["D"] ?? "").trim() || null,
      formaEnvio,
      procuracao: (d && cProc && d.cells[cProc]) || null,
      senhaNfse: (d && cSenha && d.cells[cSenha]) || null,
      observacao: obsPartes.join(" | ") || null,
      soEmDados: !m,
      obrigacoes,
    };
  });

  // ---------- Escrita no banco ----------
  if (apagar) {
    await db.delete(clienteObrigacoes);
    await db.delete(clientes);
    await db.delete(tiposObrigacao);
  }

  // 1) catálogo de tipos de obrigação
  const tiposInseridos = await db
    .insert(tiposObrigacao)
    .values(OBRIGACOES.map((o, i) => ({ nome: o.nome, ordem: i })))
    .onConflictDoNothing()
    .returning();
  const tipoIdPorNome = new Map(tiposInseridos.map((t) => [t.nome, t.id]));
  // (se já existiam, busca de novo)
  if (tipoIdPorNome.size < OBRIGACOES.length) {
    const todos = await db.select().from(tiposObrigacao);
    for (const t of todos) tipoIdPorNome.set(t.nome, t.id);
  }

  // 2) clientes
  let totalObr = 0;
  for (const r of registros) {
    const [cli] = await db
      .insert(clientes)
      .values({
        codigo: r.codigo,
        razaoSocial: r.razaoSocial,
        cnpj: r.cnpj,
        inscricaoEstadual: r.inscricaoEstadual,
        formaEnvio: r.formaEnvio,
        procuracao: r.procuracao,
        senhaNfse: r.senhaNfse,
        observacao: r.observacao,
        valorHonorario: null,
      })
      .returning();

    if (r.obrigacoes.length) {
      await db.insert(clienteObrigacoes).values(
        r.obrigacoes.map((o) => ({
          clienteId: cli.id,
          tipoObrigacaoId: tipoIdPorNome.get(o.nome)!,
          detalhe: o.detalhe,
        }))
      );
      totalObr += r.obrigacoes.length;
    }
  }

  fechar();

  // ---------- Relatório ----------
  const linha = (s = "") => console.log(s);
  linha("\n================  RELATÓRIO DE IMPORTAÇÃO  ================");
  linha(`Clientes importados......: ${registros.length}`);
  linha(`  - presentes só na DADOS: ${registros.filter((r) => r.soEmDados).length}`);
  linha(`Tipos de obrigação.......: ${OBRIGACOES.length} (${OBRIGACOES.map((o) => o.nome).join(", ")})`);
  linha(`Vínculos cliente↔obrigação: ${totalObr}`);
  linha(`Clientes sem honorário....: ${registros.length} (preencher depois)`);

  linha(`\nClientes sem CNPJ (${semCnpj.length}):`);
  semCnpj.slice(0, 30).forEach((s) => linha("  • " + s));

  linha(`\nDivergências de NOME entre mês e DADOS (${divergenciasNome.length}) — escolher qual vale:`);
  divergenciasNome.forEach((s) => linha("  • " + s));

  linha("\nAmostra (5 primeiros):");
  for (const r of registros.slice(0, 5)) {
    linha(`  #${r.codigo} ${r.razaoSocial}`);
    linha(`     CNPJ=${r.cnpj ?? "—"}  IE=${r.inscricaoEstadual ?? "—"}  envio=${r.formaEnvio ?? "—"}`);
    linha(`     obrigações: ${r.obrigacoes.map((o) => o.detalhe ? `${o.nome}(${o.detalhe})` : o.nome).join(", ") || "—"}`);
    if (r.observacao) linha(`     obs: ${r.observacao}`);
  }
  linha("==========================================================\n");

  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
