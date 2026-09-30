/** Situações do enum `situacao_funcionario` do banco. */
export const SITUACOES = [
  { valor: "ativo", rotulo: "Ativo" },
  { valor: "ferias", rotulo: "Em férias" },
  { valor: "afastado", rotulo: "Afastado" },
  { valor: "demitido", rotulo: "Demitido" },
] as const;

export function rotuloSituacao(valor: string | null | undefined): string {
  if (valor === "todas") return "todas";
  return SITUACOES.find((s) => s.valor === valor)?.rotulo ?? "—";
}

/** Tipos do enum `tipo_folha` — o que cada lançamento representa. */
export const TIPOS_FOLHA = [
  { valor: "mensal", rotulo: "Salário do mês" },
  { valor: "ferias", rotulo: "Férias" },
  { valor: "decimo_terceiro", rotulo: "13º salário" },
] as const;

export function rotuloTipoFolha(valor: string | null | undefined): string {
  return TIPOS_FOLHA.find((t) => t.valor === valor)?.rotulo ?? "—";
}

/**
 * Líquido sugerido: proventos somados, descontos subtraídos. O FGTS fica de
 * fora de propósito — é encargo do empregador, não desconto do funcionário.
 */
export function liquidoSugerido(l: {
  salarioBase?: string | null;
  proventos?: string | null;
  descontos?: string | null;
  inss?: string | null;
  irrf?: string | null;
}): number {
  const n = (v: string | null | undefined) => Number(v ?? 0) || 0;
  return n(l.salarioBase) + n(l.proventos) - n(l.descontos) - n(l.inss) - n(l.irrf);
}
