import { describe, expect, test } from "vitest";
import {
  formatarMoeda,
  formatarNumeroBR,
  paraDecimalAPI,
  paraNumeroBR,
  somarDecimais,
} from "./moeda";

describe("paraNumeroBR", () => {
  test("vírgula é decimal, ponto é milhar", () => {
    expect(paraNumeroBR("1.234,56")).toBe(1234.56);
    expect(paraNumeroBR("1234,56")).toBe(1234.56);
    expect(paraNumeroBR("0,5")).toBe(0.5);
  });

  test("o valor que a API devolve não é multiplicado por 100 (bug do honorário)", () => {
    expect(paraNumeroBR("350.00")).toBe(350);
    expect(paraNumeroBR("1200.50")).toBe(1200.5);
    expect(paraNumeroBR("1.5")).toBe(1.5);
  });

  test("um único ponto seguido de três dígitos é milhar", () => {
    expect(paraNumeroBR("1.350")).toBe(1350);
    expect(paraNumeroBR("12.000")).toBe(12000);
    expect(paraNumeroBR("1.234.567")).toBe(1234567);
    expect(paraNumeroBR("1.234.567.89")).toBe(1234567.89);
  });

  test("ignora símbolo, espaços e aceita negativo", () => {
    expect(paraNumeroBR("R$ 350,00")).toBe(350);
    expect(paraNumeroBR(" 350 ")).toBe(350);
    expect(paraNumeroBR("-42,10")).toBe(-42.1);
  });

  test("vazio e lixo viram null", () => {
    expect(paraNumeroBR("")).toBeNull();
    expect(paraNumeroBR("   ")).toBeNull();
    expect(paraNumeroBR(null)).toBeNull();
    expect(paraNumeroBR(undefined)).toBeNull();
    expect(paraNumeroBR("abc")).toBeNull();
    expect(paraNumeroBR("1,2,3")).toBeNull();
  });

  test("número entra como está", () => {
    expect(paraNumeroBR(12.5)).toBe(12.5);
    expect(paraNumeroBR(Number.NaN)).toBeNull();
  });
});

describe("paraDecimalAPI", () => {
  test("sempre duas casas com ponto", () => {
    expect(paraDecimalAPI("350,00")).toBe("350.00");
    expect(paraDecimalAPI("350.00")).toBe("350.00");
    expect(paraDecimalAPI("1.234,5")).toBe("1234.50");
    expect(paraDecimalAPI("")).toBeNull();
  });

  test("reeditar sem mexer preserva o valor (ida e volta)", () => {
    const daApi = "350.00";
    const exibido = formatarNumeroBR(daApi);
    expect(exibido).toBe("350,00");
    expect(paraDecimalAPI(exibido)).toBe(daApi);
  });
});

describe("formatação", () => {
  test("formatarNumeroBR agrupa milhar e usa vírgula", () => {
    expect(formatarNumeroBR("1234.5")).toBe("1.234,50");
    expect(formatarNumeroBR(0)).toBe("0,00");
    expect(formatarNumeroBR(null)).toBe("");
    expect(formatarNumeroBR("x")).toBe("");
  });

  test("formatarMoeda", () => {
    expect(formatarMoeda("350.00").replace(/\u00a0/g, " ")).toBe("R$ 350,00");
    expect(formatarMoeda(null)).toBe("—");
    expect(formatarMoeda("")).toBe("—");
  });

  test("somarDecimais não acumula erro de ponto flutuante", () => {
    expect(somarDecimais(["0.10", "0.20", "0.30"])).toBe(0.6);
    expect(somarDecimais(["1.800,00", "200,00", null])).toBe(2000);
  });
});
