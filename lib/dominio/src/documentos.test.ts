import { describe, expect, test } from "vitest";
import { cnpjValido, cpfValido, formatarCnpj, formatarCpf, normalizarCnpj } from "./documentos";
import { liquidoSugerido } from "./folha";
import { escaparCelulaCsv, paraCsv } from "./csv";

describe("CNPJ", () => {
  test("valida dígitos verificadores", () => {
    expect(cnpjValido("11.222.333/0001-81")).toBe(true);
    expect(cnpjValido("11222333000181")).toBe(true);
    expect(cnpjValido("11.222.333/0001-82")).toBe(false);
    expect(cnpjValido("00.000.000/0000-00")).toBe(false);
    expect(cnpjValido("123")).toBe(false);
    expect(cnpjValido(null)).toBe(false);
  });

  test("normaliza e formata", () => {
    expect(normalizarCnpj("11.222.333/0001-81")).toBe("11222333000181");
    expect(formatarCnpj("11222333000181")).toBe("11.222.333/0001-81");
    expect(formatarCnpj("123")).toBe("123");
  });
});

describe("CPF", () => {
  test("valida dígitos verificadores", () => {
    expect(cpfValido("529.982.247-25")).toBe(true);
    expect(cpfValido("52998224725")).toBe(true);
    expect(cpfValido("529.982.247-26")).toBe(false);
    expect(cpfValido("111.111.111-11")).toBe(false);
  });

  test("formata", () => {
    expect(formatarCpf("52998224725")).toBe("529.982.247-25");
  });
});

describe("folha", () => {
  test("líquido sugerido soma proventos e subtrai descontos, sem FGTS", () => {
    expect(
      liquidoSugerido({ salarioBase: "3000.00", proventos: "500.00", descontos: "100.00", inss: "300.00", irrf: "50.00" }),
    ).toBe(3050);
    expect(liquidoSugerido({ salarioBase: "0.10", proventos: "0.20" })).toBe(0.3);
    expect(liquidoSugerido({})).toBe(0);
  });
});

describe("csv", () => {
  test("escapa aspas e neutraliza fórmulas", () => {
    expect(escaparCelulaCsv('a"b')).toBe('"a""b"');
    expect(escaparCelulaCsv("=HYPERLINK(\"x\")")).toBe("\"'=HYPERLINK(\"\"x\"\")\"");
    expect(escaparCelulaCsv("+55 11")).toBe("\"'+55 11\"");
    expect(escaparCelulaCsv("-10")).toBe("\"'-10\"");
    expect(escaparCelulaCsv("@user")).toBe("\"'@user\"");
    expect(escaparCelulaCsv(null)).toBe('""');
  });

  test("monta com BOM e ponto e vírgula", () => {
    const csv = paraCsv([
      ["Cód.", "Empresa"],
      [1, "ACME"],
    ]);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv.slice(1)).toBe('"Cód.";"Empresa"\r\n"1";"ACME"');
  });
});
