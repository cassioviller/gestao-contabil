export const MESES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

/** Periodicidade de uma obrigação — define em que meses ela entra no checklist. */
export const PERIODICIDADES = [
  { valor: "mensal", rotulo: "Mensal", intervalo: 1 },
  { valor: "bimestral", rotulo: "Bimestral", intervalo: 2 },
  { valor: "trimestral", rotulo: "Trimestral", intervalo: 3 },
  { valor: "semestral", rotulo: "Semestral", intervalo: 6 },
  { valor: "anual", rotulo: "Anual", intervalo: 12 },
] as const;

export function rotuloPeriodicidade(valor: string | null | undefined): string {
  return PERIODICIDADES.find((p) => p.valor === valor)?.rotulo ?? "Mensal";
}

/** Meses em que a obrigação cai, para mostrar ao lado do rótulo. */
export function mesesDaPeriodicidade(periodicidade: string, mesReferencia: number | null): number[] {
  const intervalo = PERIODICIDADES.find((p) => p.valor === periodicidade)?.intervalo ?? 1;
  if (intervalo === 1) return [];
  const ref = mesReferencia && mesReferencia >= 1 && mesReferencia <= 12 ? mesReferencia : 1;
  const meses: number[] = [];
  for (let m = 1; m <= 12; m++) {
    if ((((m - ref) % intervalo) + intervalo) % intervalo === 0) meses.push(m);
  }
  return meses;
}

/** Regimes tributários aceitos pelo enum `regime_tributario` do banco. */
export const REGIMES = [
  { valor: "simples_nacional", rotulo: "Simples Nacional" },
  { valor: "mei", rotulo: "MEI" },
  { valor: "lucro_presumido", rotulo: "Lucro Presumido" },
  { valor: "lucro_real", rotulo: "Lucro Real" },
] as const;

export type RegimeValor = (typeof REGIMES)[number]["valor"];

export function rotuloRegime(valor: string | null | undefined): string {
  return REGIMES.find((r) => r.valor === valor)?.rotulo ?? "";
}

export function nomeMes(mes: number): string {
  return MESES[mes - 1] ?? String(mes);
}

export function rotuloCompetencia(ano: number, mes: number): string {
  return `${nomeMes(mes)} ${ano}`;
}

export function formatarMoeda(valor: string | number | null | undefined): string {
  if (valor === null || valor === undefined || valor === "") return "—";
  const n = typeof valor === "string" ? Number(valor) : valor;
  if (Number.isNaN(n)) return "—";
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function formatarData(iso: string | null | undefined): string {
  if (!iso) return "—";
  const [ano, mes, dia] = iso.slice(0, 10).split("-");
  if (!ano || !mes || !dia) return iso;
  return `${dia}/${mes}/${ano}`;
}
