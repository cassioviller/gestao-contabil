/**
 * Datas do sistema. Tudo em "YYYY-MM-DD" (o formato das colunas `date`) e no
 * fuso oficial do ContaFácil, `America/Sao_Paulo`.
 *
 * Antes, "hoje" era calculado de três jeitos (UTC no Postgres, UTC no navegador
 * via `toISOString`, hora local via `getMonth`), e depois das 21h em Brasília
 * vencimentos do dia apareciam como atrasados.
 */

export const FUSO = "America/Sao_Paulo";

const formatador = new Intl.DateTimeFormat("en-CA", {
  timeZone: FUSO,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** A data de hoje em Brasília, "YYYY-MM-DD". `agora` existe para os testes. */
export function hojeBR(agora: Date = new Date()): string {
  // en-CA devolve exatamente YYYY-MM-DD.
  return formatador.format(agora);
}

/** Ano e mês correntes em Brasília. */
export function mesAtualBR(agora: Date = new Date()): { ano: number; mes: number } {
  const [ano, mes] = hojeBR(agora).split("-").map(Number);
  return { ano, mes };
}

/** "YYYY-MM-DD" → "DD/MM/YYYY"; devolve "—" para vazio e o texto original se não for ISO. */
export function formatarData(iso: string | null | undefined): string {
  if (!iso) return "—";
  const [ano, mes, dia] = iso.slice(0, 10).split("-");
  if (!ano || !mes || !dia) return iso;
  return `${dia}/${mes}/${ano}`;
}

/** Diferença em dias inteiros entre duas datas ISO (b - a). */
export function diasEntre(a: string, b: string): number {
  const ta = Date.UTC(...partes(a));
  const tb = Date.UTC(...partes(b));
  return Math.round((tb - ta) / 86_400_000);
}

/** Soma dias a uma data ISO. */
export function somarDias(iso: string, dias: number): string {
  const [ano, mes, dia] = partes(iso);
  return paraISO(new Date(Date.UTC(ano, mes, dia + dias)));
}

/** Soma meses a uma data ISO, ajustando o dia ao último do mês quando preciso. */
export function somarMeses(iso: string, meses: number): string {
  const [ano, mes, dia] = partes(iso);
  const alvo = new Date(Date.UTC(ano, mes + meses, 1));
  const ultimo = new Date(Date.UTC(alvo.getUTCFullYear(), alvo.getUTCMonth() + 1, 0)).getUTCDate();
  return paraISO(
    new Date(Date.UTC(alvo.getUTCFullYear(), alvo.getUTCMonth(), Math.min(dia, ultimo))),
  );
}

/** Data UTC → "YYYY-MM-DD" pelos componentes UTC. */
export function paraISO(data: Date): string {
  const mm = String(data.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(data.getUTCDate()).padStart(2, "0");
  return `${data.getUTCFullYear()}-${mm}-${dd}`;
}

/** `true` quando o texto tem a forma "YYYY-MM-DD" e é uma data de calendário válida. */
export function dataISOValida(texto: string | null | undefined): boolean {
  if (!texto || !/^\d{4}-\d{2}-\d{2}$/.test(texto)) return false;
  const [ano, mes, dia] = texto.split("-").map(Number);
  if (mes < 1 || mes > 12 || dia < 1) return false;
  const ultimo = new Date(Date.UTC(ano, mes, 0)).getUTCDate();
  return dia <= ultimo;
}

function partes(iso: string): [number, number, number] {
  const [ano, mes, dia] = iso.slice(0, 10).split("-").map(Number);
  return [ano, mes - 1, dia];
}
