/**
 * Formatação e enums usados pelas telas. Tudo vem de `@workspace/dominio`, o
 * mesmo módulo que a API usa — assim periodicidade, moeda e datas se comportam
 * igual dos dois lados. Este arquivo só existe para os imports antigos
 * (`@/lib/formato`) continuarem valendo.
 */
export {
  MESES,
  PERIODICIDADES,
  REGIMES,
  formatarData,
  formatarMoeda,
  formatarNumeroBR,
  hojeBR,
  mesAtualBR,
  mesesDaPeriodicidade,
  nomeMes,
  paraDecimalAPI,
  paraNumeroBR,
  rotuloCompetencia,
  rotuloPeriodicidade,
  rotuloRegime,
  type RegimeValor,
} from "@workspace/dominio";
