import { paraNumeroBR } from "./moeda";

export type LinhaFolha = {
  salarioBase?: string | number | null;
  proventos?: string | number | null;
  descontos?: string | number | null;
  inss?: string | number | null;
  irrf?: string | number | null;
};

/**
 * Líquido sugerido: proventos somados, descontos subtraídos. O FGTS fica de
 * fora de propósito — é encargo do empregador, não desconto do funcionário.
 * Trabalha em centavos para não acumular erro de ponto flutuante.
 */
export function liquidoSugerido(l: LinhaFolha): number {
  const c = (v: string | number | null | undefined) => Math.round((paraNumeroBR(v) ?? 0) * 100);
  const centavos = c(l.salarioBase) + c(l.proventos) - c(l.descontos) - c(l.inss) - c(l.irrf);
  return centavos / 100;
}
