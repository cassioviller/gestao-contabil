export const MODELO_WHATSAPP_PADRAO =
  "Olá {cliente}, identificamos que o honorário referente a {competencia} " +
  "(venc. {vencimento}, valor {valor}) está em aberto há {dias_atraso} dias. " +
  "Poderia regularizar? Qualquer dúvida estamos à disposição.";

export function normalizarTelefone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let d = raw.replace(/\D/g, "");
  if (d.length === 10 || d.length === 11) d = "55" + d;
  if (d.length < 12 || d.length > 13) return null;
  return d;
}

export function montarMensagem(modelo: string, dados: Record<string, string>): string {
  return modelo.replace(/\{(\w+)\}/g, (original, chave) =>
    chave in dados ? dados[chave] : original
  );
}

export function linkWhatsapp(telefone: string, mensagem: string): string {
  return `https://wa.me/${telefone}?text=${encodeURIComponent(mensagem)}`;
}
