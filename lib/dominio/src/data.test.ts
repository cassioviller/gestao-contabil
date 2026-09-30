import { describe, expect, test } from "vitest";
import {
  dataISOValida,
  diasEntre,
  formatarData,
  hojeBR,
  mesAtualBR,
  somarDias,
  somarMeses,
} from "./data";

describe("hojeBR", () => {
  test("depois das 21h em Brasília ainda é o mesmo dia, mesmo que em UTC seja amanhã", () => {
    // 2026-03-10 23:30 em Brasília = 2026-03-11 02:30 UTC.
    expect(hojeBR(new Date("2026-03-11T02:30:00Z"))).toBe("2026-03-10");
  });

  test("de manhã é o mesmo dia nos dois fusos", () => {
    expect(hojeBR(new Date("2026-03-10T12:00:00Z"))).toBe("2026-03-10");
  });

  test("mesAtualBR segue o mesmo fuso", () => {
    expect(mesAtualBR(new Date("2026-04-01T01:00:00Z"))).toEqual({ ano: 2026, mes: 3 });
  });
});

describe("aritmética de datas", () => {
  test("diasEntre e somarDias", () => {
    expect(diasEntre("2026-01-01", "2026-01-31")).toBe(30);
    expect(diasEntre("2026-01-31", "2026-01-01")).toBe(-30);
    expect(somarDias("2026-12-30", 3)).toBe("2027-01-02");
    expect(somarDias("2026-03-01", -1)).toBe("2026-02-28");
  });

  test("somarMeses ajusta ao último dia e trata 29/02", () => {
    expect(somarMeses("2024-02-29", 12)).toBe("2025-02-28");
    expect(somarMeses("2026-01-31", 1)).toBe("2026-02-28");
    expect(somarMeses("2026-11-15", 2)).toBe("2027-01-15");
  });

  test("formatarData", () => {
    expect(formatarData("2026-03-10")).toBe("10/03/2026");
    expect(formatarData("2026-03-10T15:00:00Z")).toBe("10/03/2026");
    expect(formatarData(null)).toBe("—");
    expect(formatarData("x")).toBe("x");
  });

  test("dataISOValida", () => {
    expect(dataISOValida("2026-02-28")).toBe(true);
    expect(dataISOValida("2026-02-30")).toBe(false);
    expect(dataISOValida("2024-02-29")).toBe(true);
    expect(dataISOValida("2026-13-01")).toBe(false);
    expect(dataISOValida("10/03/2026")).toBe(false);
    expect(dataISOValida(null)).toBe(false);
  });
});
