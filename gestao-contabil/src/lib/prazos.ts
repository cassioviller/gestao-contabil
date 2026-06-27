// Cálculo de datas de vencimento (puro, sem acesso a banco).
// Trabalha com datas ISO "YYYY-MM-DD" para casar com as colunas date do Drizzle.

// Dado a competência (ano/mês 1-12), o dia de vencimento e quantos meses depois
// ele cai (offsetMes: 0 = mesmo mês, 1 = mês seguinte), devolve a data ISO.
// O dia é ajustado para o último dia do mês quando o mês alvo é mais curto.
export function calcularVencimento(
  ano: number,
  mes: number,
  dia: number | null,
  offsetMes: number
): string | null {
  if (!dia || dia < 1) return null;

  // Índice de mês base-0 a partir de janeiro do ano da competência, somando o offset.
  const base = mes - 1 + offsetMes;
  const alvoAno = ano + Math.floor(base / 12);
  const alvoMes = ((base % 12) + 12) % 12; // 0..11

  // Dia 0 do mês seguinte = último dia do mês alvo.
  const ultimoDia = new Date(Date.UTC(alvoAno, alvoMes + 1, 0)).getUTCDate();
  const diaFinal = Math.min(dia, ultimoDia);

  const mm = String(alvoMes + 1).padStart(2, "0");
  const dd = String(diaFinal).padStart(2, "0");
  return `${alvoAno}-${mm}-${dd}`;
}
