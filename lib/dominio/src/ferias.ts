/**
 * Prazo legal das férias: o período de gozo tem de começar até 12 meses depois
 * do fim do período aquisitivo (CLT, art. 134). Passou disso, as férias são
 * devidas em dobro (art. 137) — daí o estado "vencida".
 */
import { somarDias, somarMeses } from "./data";

/** Faltando este tanto para o limite, o período já entra como "vencendo". */
export const AVISO_DIAS = 90;

export type LinhaFeriasBase = {
  aquisitivoFim: string;
  gozoInicio: string | null;
};

export type SituacaoFerias = "gozada" | "vencida" | "vencendo" | "a_vencer";

/**
 * Acrescenta o limite de gozo e a situação. `hoje` é obrigatório para o
 * cálculo ser o mesmo na API e em qualquer teste.
 *
 * `somarMeses` trata 29/02: aquisitivo terminando em 29/02 tem limite em
 * 28/02 do ano seguinte, não em 01/03.
 */
export function comVencimento<T extends LinhaFeriasBase>(
  linha: T,
  hoje: string,
): T & { limiteGozo: string; vencendo: boolean; vencida: boolean; situacao: SituacaoFerias } {
  const limiteGozo = somarMeses(linha.aquisitivoFim.slice(0, 10), 12);
  const aviso = somarDias(limiteGozo, -AVISO_DIAS);

  if (linha.gozoInicio) {
    return { ...linha, limiteGozo, vencendo: false, vencida: false, situacao: "gozada" };
  }
  if (hoje > limiteGozo) {
    return { ...linha, limiteGozo, vencendo: true, vencida: true, situacao: "vencida" };
  }
  if (hoje >= aviso) {
    return { ...linha, limiteGozo, vencendo: true, vencida: false, situacao: "vencendo" };
  }
  return { ...linha, limiteGozo, vencendo: false, vencida: false, situacao: "a_vencer" };
}
