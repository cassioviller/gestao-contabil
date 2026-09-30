/**
 * CNPJ e CPF: normalização, formatação e dígito verificador. A validação é a
 * mesma no cadastro (tela), na API e na importação por planilha.
 */

export function somenteDigitos(v: string | null | undefined): string {
  return (v ?? "").replace(/\D/g, "");
}

export function normalizarCnpj(v: string | null | undefined): string {
  return somenteDigitos(v);
}

export function normalizarCpf(v: string | null | undefined): string {
  return somenteDigitos(v);
}

export function formatarCnpj(v: string | null | undefined): string {
  const d = somenteDigitos(v);
  if (d.length !== 14) return v ?? "";
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}

export function formatarCpf(v: string | null | undefined): string {
  const d = somenteDigitos(v);
  if (d.length !== 11) return v ?? "";
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

function digitoVerificador(base: string, pesos: number[]): number {
  const soma = base.split("").reduce((s, ch, i) => s + Number(ch) * pesos[i], 0);
  const resto = soma % 11;
  return resto < 2 ? 0 : 11 - resto;
}

/** CNPJ com 14 dígitos e verificadores corretos; sequências repetidas são inválidas. */
export function cnpjValido(v: string | null | undefined): boolean {
  const d = somenteDigitos(v);
  if (d.length !== 14 || /^(\d)\1{13}$/.test(d)) return false;
  const p1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const p2 = [6, ...p1];
  const dv1 = digitoVerificador(d.slice(0, 12), p1);
  const dv2 = digitoVerificador(d.slice(0, 12) + dv1, p2);
  return d[12] === String(dv1) && d[13] === String(dv2);
}

/** CPF com 11 dígitos e verificadores corretos; sequências repetidas são inválidas. */
export function cpfValido(v: string | null | undefined): boolean {
  const d = somenteDigitos(v);
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
  const p1 = [10, 9, 8, 7, 6, 5, 4, 3, 2];
  const p2 = [11, ...p1];
  const dv1 = digitoVerificador(d.slice(0, 9), p1);
  const dv2 = digitoVerificador(d.slice(0, 9) + dv1, p2);
  return d[9] === String(dv1) && d[10] === String(dv2);
}
