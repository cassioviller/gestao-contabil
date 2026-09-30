/**
 * CSV para o Excel em português: BOM, separador ";", aspas dobradas e proteção
 * contra injeção de fórmula — uma célula que começa com `=`, `+`, `-`, `@`,
 * tab ou CR seria executada pela planilha ao abrir o arquivo.
 */

const INICIO_PERIGOSO = /^[=+\-@\t\r]/;

export function escaparCelulaCsv(valor: string | number | null | undefined): string {
  let texto = valor === null || valor === undefined ? "" : String(valor);
  if (INICIO_PERIGOSO.test(texto)) texto = `'${texto}`;
  return `"${texto.replace(/"/g, '""')}"`;
}

export function paraCsv(linhas: Array<Array<string | number | null | undefined>>): string {
  return "﻿" + linhas.map((l) => l.map(escaparCelulaCsv).join(";")).join("\r\n");
}
