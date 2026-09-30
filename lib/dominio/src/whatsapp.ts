/**
 * Mensagens de cobrança e link do WhatsApp. Sem API paga: o link `wa.me` abre a
 * conversa já com o texto, e a contadora só aperta enviar.
 */

export const MODELO_WHATSAPP_PADRAO =
  "Olá {cliente}, identificamos que o honorário referente a {competencia} " +
  "(venc. {vencimento}, valor {valor}) está em aberto há {dias_atraso} dias. " +
  "Poderia regularizar? Qualquer dúvida estamos à disposição.";

/** Variáveis que os modelos de mensagem aceitam, para a tela listar. */
export const VARIAVEIS_MENSAGEM = [
  "cliente",
  "valor",
  "competencia",
  "vencimento",
  "dias_atraso",
  "escritorio",
  "responsavel",
  "telefone_escritorio",
  "chave_pix",
  "link_pagamento",
] as const;

/**
 * Telefone brasileiro → dígitos com DDI 55, ou `null` se não for um número
 * discável. Aceita máscara, zero antes do DDD ("(011) 9…") e o 55 já presente.
 */
export function normalizarTelefone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let d = raw.replace(/\D/g, "");
  // Zero antes do DDD (jeito antigo de discar): "011 9…" → "11 9…".
  if ((d.length === 11 || d.length === 12) && d.startsWith("0") && !d.startsWith("055")) {
    d = d.slice(1);
  }
  if (d.length === 10 || d.length === 11) d = "55" + d;
  if (d.length < 12 || d.length > 13) return null;
  if (!d.startsWith("55")) return null;
  return d;
}

/** Troca `{chave}` pelos valores; variável sem valor fica como está. */
export function montarMensagem(modelo: string, dados: Record<string, string | undefined>): string {
  return modelo.replace(/\{(\w+)\}/g, (original, chave: string) =>
    chave in dados && dados[chave] !== undefined ? String(dados[chave]) : original,
  );
}

export function linkWhatsapp(telefone: string, mensagem: string): string {
  return `https://wa.me/${telefone}?text=${encodeURIComponent(mensagem)}`;
}
