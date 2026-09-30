/**
 * Periodicidade e vencimento das obrigações. É daqui que a API decide em que
 * meses uma obrigação entra no checklist e quando ela vence; a tela usa as
 * mesmas funções para explicar isso à contadora.
 */
import { diasEntre } from "./data";

export type Periodicidade = "mensal" | "bimestral" | "trimestral" | "semestral" | "anual";

export const PERIODICIDADES: ReadonlyArray<{
  valor: Periodicidade;
  rotulo: string;
  intervalo: number;
}> = [
  { valor: "mensal", rotulo: "Mensal", intervalo: 1 },
  { valor: "bimestral", rotulo: "Bimestral", intervalo: 2 },
  { valor: "trimestral", rotulo: "Trimestral", intervalo: 3 },
  { valor: "semestral", rotulo: "Semestral", intervalo: 6 },
  { valor: "anual", rotulo: "Anual", intervalo: 12 },
];

export const INTERVALO_MESES: Record<Periodicidade, number> = {
  mensal: 1,
  bimestral: 2,
  trimestral: 3,
  semestral: 6,
  anual: 12,
};

export function rotuloPeriodicidade(valor: string | null | undefined): string {
  return PERIODICIDADES.find((p) => p.valor === valor)?.rotulo ?? "Mensal";
}

function intervaloDe(periodicidade: string): number {
  const p = PERIODICIDADES.find((x) => x.valor === periodicidade);
  // Periodicidade desconhecida não pode virar mensal em silêncio: seria uma
  // obrigação anual aparecendo nos doze meses.
  if (!p) throw new Error(`Periodicidade desconhecida: ${periodicidade}`);
  return p.intervalo;
}

/**
 * A obrigação vale neste mês? Mensal sempre vale. As demais caem nos meses em
 * que a distância até o mês de referência é múltipla do intervalo — anual com
 * referência 7 só em julho, trimestral com referência 3 em 3/6/9/12.
 * Sem referência válida, o ciclo é ancorado em janeiro.
 */
export function aplicaNoMes(
  periodicidade: string,
  mesReferencia: number | null | undefined,
  mes: number,
): boolean {
  const intervalo = intervaloDe(periodicidade);
  if (intervalo === 1) return true;
  const ref = mesReferencia && mesReferencia >= 1 && mesReferencia <= 12 ? mesReferencia : 1;
  return (((mes - ref) % intervalo) + intervalo) % intervalo === 0;
}

/** Meses (1-12) em que a obrigação cai. Lista vazia para mensal. */
export function mesesDaPeriodicidade(
  periodicidade: string,
  mesReferencia: number | null | undefined,
): number[] {
  if (intervaloDe(periodicidade) === 1) return [];
  const meses: number[] = [];
  for (let m = 1; m <= 12; m++) if (aplicaNoMes(periodicidade, mesReferencia, m)) meses.push(m);
  return meses;
}

/**
 * Vencimento de uma obrigação da competência `ano/mes`: `dia` no mês
 * `offsetMes` meses depois (0 = mesmo mês, 1 = mês seguinte). O dia é ajustado
 * ao último dia do mês alvo quando ele é mais curto (31 → 28 em fevereiro).
 * Dia nulo ou zero = obrigação sem vencimento definido.
 */
export function calcularVencimento(
  ano: number,
  mes: number,
  dia: number | null | undefined,
  offsetMes: number,
): string | null {
  if (!dia || dia < 1) return null;
  const base = mes - 1 + offsetMes;
  const alvoAno = ano + Math.floor(base / 12);
  const alvoMes = ((base % 12) + 12) % 12;
  const ultimoDia = new Date(Date.UTC(alvoAno, alvoMes + 1, 0)).getUTCDate();
  const diaFinal = Math.min(dia, ultimoDia);
  const mm = String(alvoMes + 1).padStart(2, "0");
  const dd = String(diaFinal).padStart(2, "0");
  return `${alvoAno}-${mm}-${dd}`;
}

/** Dias de atraso de um vencimento em relação a `hoje`; 0 quando ainda não venceu. */
export function diasAtraso(vencimento: string | null | undefined, hoje: string): number {
  if (!vencimento) return 0;
  const d = diasEntre(vencimento.slice(0, 10), hoje);
  return d > 0 ? d : 0;
}

/** `true` quando o vencimento é anterior a `hoje`. */
export function vencido(vencimento: string | null | undefined, hoje: string): boolean {
  return !!vencimento && vencimento.slice(0, 10) < hoje;
}
