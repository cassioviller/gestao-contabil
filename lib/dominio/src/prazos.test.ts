import { describe, expect, test } from "vitest";
import {
  aplicaNoMes,
  calcularVencimento,
  diasAtraso,
  mesesDaPeriodicidade,
  vencido,
} from "./prazos";

describe("calcularVencimento", () => {
  test("offset 1 joga para o mês seguinte", () => {
    expect(calcularVencimento(2026, 5, 20, 1)).toBe("2026-06-20");
  });

  test("offset 0 fica no mesmo mês", () => {
    expect(calcularVencimento(2026, 5, 10, 0)).toBe("2026-05-10");
  });

  test("vira o ano quando passa de dezembro", () => {
    expect(calcularVencimento(2026, 12, 15, 1)).toBe("2027-01-15");
    expect(calcularVencimento(2026, 11, 10, 2)).toBe("2027-01-10");
  });

  test("clampa para o último dia do mês curto", () => {
    expect(calcularVencimento(2026, 1, 31, 1)).toBe("2026-02-28");
    expect(calcularVencimento(2024, 1, 31, 1)).toBe("2024-02-29");
    expect(calcularVencimento(2026, 3, 31, 1)).toBe("2026-04-30");
  });

  test("offset negativo volta um mês", () => {
    expect(calcularVencimento(2026, 1, 10, -1)).toBe("2025-12-10");
  });

  test("dia nulo ou zero retorna null", () => {
    expect(calcularVencimento(2026, 5, null, 1)).toBeNull();
    expect(calcularVencimento(2026, 5, 0, 1)).toBeNull();
    expect(calcularVencimento(2026, 5, undefined, 1)).toBeNull();
  });
});

describe("aplicaNoMes", () => {
  test("mensal vale sempre", () => {
    for (let m = 1; m <= 12; m++) expect(aplicaNoMes("mensal", null, m)).toBe(true);
  });

  test("anual só no mês de referência", () => {
    expect(aplicaNoMes("anual", 7, 7)).toBe(true);
    expect(aplicaNoMes("anual", 7, 8)).toBe(false);
    expect(mesesDaPeriodicidade("anual", 7)).toEqual([7]);
  });

  test("trimestral com referência 3 cai em 3, 6, 9, 12", () => {
    expect(mesesDaPeriodicidade("trimestral", 3)).toEqual([3, 6, 9, 12]);
    expect(mesesDaPeriodicidade("trimestral", 1)).toEqual([1, 4, 7, 10]);
  });

  test("sem referência válida ancora em janeiro", () => {
    expect(mesesDaPeriodicidade("semestral", null)).toEqual([1, 7]);
    expect(mesesDaPeriodicidade("bimestral", 0)).toEqual([1, 3, 5, 7, 9, 11]);
    expect(mesesDaPeriodicidade("anual", 13)).toEqual([1]);
  });

  test("periodicidade desconhecida não vira mensal em silêncio", () => {
    expect(() => aplicaNoMes("quinzenal", null, 1)).toThrow(/desconhecida/);
  });

  test("mensal não tem lista de meses", () => {
    expect(mesesDaPeriodicidade("mensal", null)).toEqual([]);
  });
});

describe("atraso", () => {
  test("diasAtraso conta só o passado", () => {
    expect(diasAtraso("2026-03-01", "2026-03-11")).toBe(10);
    expect(diasAtraso("2026-03-11", "2026-03-11")).toBe(0);
    expect(diasAtraso("2026-03-20", "2026-03-11")).toBe(0);
    expect(diasAtraso(null, "2026-03-11")).toBe(0);
  });

  test("vencido é estritamente antes de hoje", () => {
    expect(vencido("2026-03-10", "2026-03-11")).toBe(true);
    expect(vencido("2026-03-11", "2026-03-11")).toBe(false);
    expect(vencido(null, "2026-03-11")).toBe(false);
  });
});
