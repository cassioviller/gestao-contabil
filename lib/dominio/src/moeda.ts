/**
 * Conversão entre o que a contadora digita (pt-BR) e o que a API/banco guardam
 * (decimal com ponto e duas casas).
 *
 * Existe uma única implementação de propósito: antes cada tela tinha a sua
 * cópia de `replace(/\./g, "")`, que transformava "350.00" (o valor que a API
 * devolve) em 35000 quando o campo era reeditado sem alteração.
 */

/**
 * Interpreta um texto digitado em pt-BR e devolve o número.
 *
 * Aceita "1.234,56", "1234,56", "1234.56", "R$ 350,00", "350" e sinal negativo.
 * A regra de desempate quando só há ponto: um único ponto seguido de exatamente
 * três dígitos é separador de milhar ("1.350" = 1350); qualquer outra forma é
 * decimal ("350.00" = 350, "1.5" = 1.5). Devolve `null` para vazio ou inválido.
 */
export function paraNumeroBR(texto: string | number | null | undefined): number | null {
  if (texto === null || texto === undefined) return null;
  if (typeof texto === "number") return Number.isFinite(texto) ? texto : null;

  let limpo = texto.replace(/[^\d,.\-]/g, "").trim();
  if (!limpo || limpo === "-" || limpo === "." || limpo === ",") return null;

  const negativo = limpo.startsWith("-");
  limpo = limpo.replace(/-/g, "");

  let normalizado: string;
  if (limpo.includes(",")) {
    // Vírgula é sempre o decimal em pt-BR; pontos são milhar.
    normalizado = limpo.replace(/\./g, "").replace(",", ".");
  } else {
    const pontos = limpo.split(".");
    if (pontos.length === 1) {
      normalizado = limpo;
    } else if (pontos.length === 2 && pontos[1].length === 3 && pontos[0].length > 0) {
      // "1.350" → milhar.
      normalizado = pontos.join("");
    } else if (pontos.length === 2) {
      // "350.00", "1.5" → decimal.
      normalizado = limpo;
    } else {
      // "1.234.567" ou "1.234.567.89": tudo antes do último ponto é milhar só
      // se o último grupo tiver 3 dígitos; senão o último ponto é decimal.
      const ultimo = pontos[pontos.length - 1];
      normalizado =
        ultimo.length === 3
          ? pontos.join("")
          : pontos.slice(0, -1).join("") + "." + ultimo;
    }
  }

  // Mais de uma vírgula ou resto inválido: não adivinha.
  if (!/^\d*(\.\d*)?$/.test(normalizado)) return null;
  const n = Number(normalizado);
  if (!Number.isFinite(n)) return null;
  return negativo ? -n : n;
}

/**
 * Texto digitado → string decimal com duas casas ("350.00"), que é o formato
 * que o `numeric` do Postgres aceita e a API espera. `null` para vazio.
 */
export function paraDecimalAPI(texto: string | number | null | undefined): string | null {
  const n = paraNumeroBR(texto);
  if (n === null) return null;
  return n.toFixed(2);
}

/** Número ou decimal da API → "1.234,56" (sem símbolo), para campos de edição. */
export function formatarNumeroBR(valor: string | number | null | undefined): string {
  if (valor === null || valor === undefined || valor === "") return "";
  const n = typeof valor === "string" ? Number(valor) : valor;
  if (!Number.isFinite(n)) return "";
  return n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Número ou decimal da API → "R$ 1.234,56"; "—" para vazio. */
export function formatarMoeda(valor: string | number | null | undefined): string {
  if (valor === null || valor === undefined || valor === "") return "—";
  const n = typeof valor === "string" ? Number(valor) : valor;
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/** Soma decimais da API sem os erros de ponto flutuante de `Number` acumulado. */
export function somarDecimais(valores: Array<string | number | null | undefined>): number {
  const centavos = valores.reduce<number>((soma, v) => {
    const n = paraNumeroBR(v);
    return soma + (n === null ? 0 : Math.round(n * 100));
  }, 0);
  return centavos / 100;
}
