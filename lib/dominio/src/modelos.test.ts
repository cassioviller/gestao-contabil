import { describe, expect, test } from "vitest";
import { montarAviso } from "./modelos";

const base = {
  cliente: "Padaria Pão Quente",
  escritorio: "AZ Contabilidade",
  contato: "(11) 99999-0000",
};

describe("montarAviso", () => {
  test("guia disponível cita obrigação, competência, vencimento e link", () => {
    const m = montarAviso("guia_disponivel", {
      ...base,
      obrigacao: "DAS",
      competencia: "09/2026",
      vencimento: "20/10/2026",
      link: "https://x/protocolo/abc",
    });
    expect(m.assunto).toBe("DAS 09/2026 disponível");
    expect(m.texto).toContain("Olá, Padaria Pão Quente.");
    expect(m.texto).toContain("DAS da competência 09/2026 está pronta e vence em 20/10/2026");
    expect(m.texto).toContain("https://x/protocolo/abc");
    expect(m.texto).toContain("AZ Contabilidade · (11) 99999-0000");
  });

  test("honorário vencido traz valor, vencimento e Pix", () => {
    const m = montarAviso("honorario_vencido", {
      ...base,
      competencia: "Agosto 2026",
      valor: "R$ 350,00",
      vencimento: "10/09/2026",
      chavePix: "12.345.678/0001-90",
    });
    expect(m.assunto).toBe("Honorário de Agosto 2026 em aberto");
    expect(m.texto).toContain("no valor de R$ 350,00, vencido em 10/09/2026");
    expect(m.texto).toContain("Pix: 12.345.678/0001-90");
    expect(m.texto).toContain("Se já pagou, desconsidere");
  });

  test("campos ausentes não deixam buracos no texto", () => {
    const m = montarAviso("vencimento_proximo", { cliente: "X", escritorio: "Y" });
    expect(m.texto).not.toContain("undefined");
    expect(m.texto).toContain("vence em breve");
    expect(m.assunto).toBe("Obrigação vence em breve");
  });
});
