/**
 * Textos dos avisos ao cliente. Um só lugar para o e-mail, o WhatsApp e o
 * portal dizerem a mesma coisa; a API monta e grava em `avisos`.
 */

export type ModeloAviso = "guia_disponivel" | "vencimento_proximo" | "honorario_vencido" | "manual";

export type VariaveisAviso = {
  cliente: string;
  escritorio: string;
  obrigacao?: string;
  competencia?: string;
  vencimento?: string;
  valor?: string;
  link?: string;
  chavePix?: string;
  contato?: string;
};

export type Mensagem = { assunto: string; texto: string };

function rodape(v: VariaveisAviso): string {
  const partes = [v.escritorio];
  if (v.contato) partes.push(v.contato);
  return `\n\n— ${partes.join(" · ")}`;
}

export function montarAviso(modelo: ModeloAviso, v: VariaveisAviso): Mensagem {
  switch (modelo) {
    case "guia_disponivel":
      return {
        assunto: `${v.obrigacao ?? "Guia"}${v.competencia ? ` ${v.competencia}` : ""} disponível`,
        texto:
          `Olá, ${v.cliente}.\n\n` +
          `A guia ${v.obrigacao ?? ""}${v.competencia ? ` da competência ${v.competencia}` : ""} está pronta` +
          `${v.vencimento ? ` e vence em ${v.vencimento}` : ""}.` +
          (v.link ? `\n\nAcesse aqui: ${v.link}` : "") +
          rodape(v),
      };
    case "vencimento_proximo":
      return {
        assunto: `${v.obrigacao ?? "Obrigação"} vence em ${v.vencimento ?? "breve"}`,
        texto:
          `Olá, ${v.cliente}.\n\n` +
          `Lembrete: ${v.obrigacao ?? "a obrigação"}${v.competencia ? ` (${v.competencia})` : ""} vence em ${v.vencimento ?? "breve"}.` +
          (v.link ? `\n\nGuia: ${v.link}` : "") +
          rodape(v),
      };
    case "honorario_vencido":
      return {
        assunto: `Honorário${v.competencia ? ` de ${v.competencia}` : ""} em aberto`,
        texto:
          `Olá, ${v.cliente}.\n\n` +
          `Consta em aberto o honorário${v.competencia ? ` de ${v.competencia}` : ""}` +
          `${v.valor ? ` no valor de ${v.valor}` : ""}${v.vencimento ? `, vencido em ${v.vencimento}` : ""}.` +
          (v.chavePix ? `\n\nPix: ${v.chavePix}` : "") +
          (v.link ? `\nPagamento: ${v.link}` : "") +
          `\n\nSe já pagou, desconsidere esta mensagem.` +
          rodape(v),
      };
    case "manual":
      return { assunto: `Aviso de ${v.escritorio}`, texto: "" };
  }
}
