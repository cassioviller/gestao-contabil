import { describe, expect, test } from "vitest";
import { comVencimento } from "./ferias";

describe("comVencimento", () => {
  test("limite é um ano depois do fim do aquisitivo", () => {
    const r = comVencimento({ aquisitivoFim: "2025-02-28", gozoInicio: null }, "2025-06-01");
    expect(r.limiteGozo).toBe("2026-02-28");
    expect(r.situacao).toBe("a_vencer");
    expect(r.vencendo).toBe(false);
  });

  test("29/02 não transborda para 01/03", () => {
    const r = comVencimento({ aquisitivoFim: "2024-02-29", gozoInicio: null }, "2024-06-01");
    expect(r.limiteGozo).toBe("2025-02-28");
  });

  test("a 90 dias do limite entra como vencendo", () => {
    const r = comVencimento({ aquisitivoFim: "2025-02-28", gozoInicio: null }, "2025-12-01");
    expect(r.situacao).toBe("vencendo");
    expect(r.vencendo).toBe(true);
    expect(r.vencida).toBe(false);
  });

  test("passou do limite: vencida (férias em dobro)", () => {
    const r = comVencimento({ aquisitivoFim: "2025-02-28", gozoInicio: null }, "2026-03-01");
    expect(r.situacao).toBe("vencida");
    expect(r.vencida).toBe(true);
    expect(r.vencendo).toBe(true);
  });

  test("já gozada nunca vence, mesmo com a data no passado", () => {
    const r = comVencimento(
      { aquisitivoFim: "2025-02-28", gozoInicio: "2025-07-01" },
      "2027-01-01",
    );
    expect(r.situacao).toBe("gozada");
    expect(r.vencendo).toBe(false);
    expect(r.vencida).toBe(false);
  });

  test("mantém os campos da linha original", () => {
    const r = comVencimento({ id: 7, aquisitivoFim: "2025-02-28", gozoInicio: null }, "2025-06-01");
    expect(r.id).toBe(7);
  });
});
