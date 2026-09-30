/**
 * Rótulos em português dos enums do banco. Os valores são os mesmos do
 * `schema.ts` e do `openapi.yaml`; quem muda um, muda os três.
 */

export const MESES = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
] as const;

export function nomeMes(mes: number): string {
  return MESES[mes - 1] ?? String(mes);
}

export function rotuloCompetencia(ano: number, mes: number): string {
  return `${nomeMes(mes)} ${ano}`;
}

/** "MM/AAAA" */
export function competenciaCurta(ano: number, mes: number): string {
  return `${String(mes).padStart(2, "0")}/${ano}`;
}

export const REGIMES = [
  { valor: "simples_nacional", rotulo: "Simples Nacional", sigla: "S" },
  { valor: "mei", rotulo: "MEI", sigla: "M" },
  { valor: "lucro_presumido", rotulo: "Lucro Presumido", sigla: "P" },
  { valor: "lucro_real", rotulo: "Lucro Real", sigla: "R" },
] as const;

export type RegimeValor = (typeof REGIMES)[number]["valor"];

export function rotuloRegime(valor: string | null | undefined): string {
  return REGIMES.find((r) => r.valor === valor)?.rotulo ?? "";
}

export const STATUS_ITEM = [
  { valor: "pendente", rotulo: "Pendente", simbolo: "•" },
  { valor: "emitido", rotulo: "Emitido", simbolo: "E" },
  { valor: "enviado", rotulo: "Enviado", simbolo: "✓" },
  { valor: "nao_aplica", rotulo: "Não se aplica", simbolo: "–" },
] as const;

export type StatusItem = (typeof STATUS_ITEM)[number]["valor"];

/** Ciclo da guia no checklist: um clique avança; do fim volta ao começo. */
export const PROXIMO_STATUS_ITEM: Record<StatusItem, StatusItem> = {
  pendente: "emitido",
  emitido: "enviado",
  enviado: "nao_aplica",
  nao_aplica: "pendente",
};

export const STATUS_PAGAMENTO = [
  { valor: "pendente", rotulo: "Pendente" },
  { valor: "pago", rotulo: "Pago" },
  { valor: "isento", rotulo: "Isento" },
] as const;

export const STATUS_DEBITO = [
  { valor: "em_aberto", rotulo: "Em aberto" },
  { valor: "parcelado", rotulo: "Parcelado" },
  { valor: "pago", rotulo: "Pago" },
] as const;

export const STATUS_PROCESSO = [
  { valor: "aberto", rotulo: "Aberto" },
  { valor: "em_andamento", rotulo: "Em andamento" },
  { valor: "concluido", rotulo: "Concluído" },
  { valor: "cancelado", rotulo: "Cancelado" },
] as const;

export type StatusProcessoValor = (typeof STATUS_PROCESSO)[number]["valor"];

export function rotuloStatusProcesso(valor: string): string {
  return STATUS_PROCESSO.find((s) => s.valor === valor)?.rotulo ?? valor;
}

export const SITUACOES_FUNCIONARIO = [
  { valor: "ativo", rotulo: "Ativo" },
  { valor: "ferias", rotulo: "Em férias" },
  { valor: "afastado", rotulo: "Afastado" },
  { valor: "demitido", rotulo: "Demitido" },
] as const;

export function rotuloSituacao(valor: string | null | undefined): string {
  if (valor === "todas") return "todas";
  return SITUACOES_FUNCIONARIO.find((s) => s.valor === valor)?.rotulo ?? "—";
}

export const TIPOS_FOLHA = [
  { valor: "mensal", rotulo: "Salário do mês" },
  { valor: "ferias", rotulo: "Férias" },
  { valor: "decimo_terceiro", rotulo: "13º salário" },
] as const;

export function rotuloTipoFolha(valor: string | null | undefined): string {
  return TIPOS_FOLHA.find((t) => t.valor === valor)?.rotulo ?? "—";
}

export const PAPEIS_USUARIO = [
  { valor: "admin", rotulo: "Administrador", descricao: "Tudo, inclusive usuários e senhas" },
  { valor: "contador", rotulo: "Contador", descricao: "Tudo, exceto gerir usuários" },
  {
    valor: "auxiliar",
    rotulo: "Auxiliar",
    descricao: "Checklist e cadastros; não vê senhas nem honorários",
  },
] as const;

export type PapelUsuario = (typeof PAPEIS_USUARIO)[number]["valor"];

export const FORMAS_ENVIO = [
  { valor: "email", rotulo: "E-mail" },
  { valor: "whatsapp", rotulo: "WhatsApp" },
  { valor: "portal", rotulo: "Portal do cliente" },
  { valor: "nenhum", rotulo: "Não enviar" },
] as const;

export type FormaEnvio = (typeof FORMAS_ENVIO)[number]["valor"];
