import { describe, expect, test } from "vitest";
import { linkWhatsapp, montarMensagem, normalizarTelefone } from "./whatsapp";

describe("normalizarTelefone", () => {
  test("normaliza celular com máscara e adiciona DDI 55", () => {
    expect(normalizarTelefone("(11) 99999-9999")).toBe("5511999999999");
  });

  test("mantém número que já tem 55", () => {
    expect(normalizarTelefone("5511999999999")).toBe("5511999999999");
    expect(normalizarTelefone("+55 11 99999-9999")).toBe("5511999999999");
  });

  test("fixo com 10 dígitos", () => {
    expect(normalizarTelefone("(11) 3333-4444")).toBe("551133334444");
  });

  test("zero antes do DDD não vira número errado", () => {
    expect(normalizarTelefone("(011) 99999-9999")).toBe("5511999999999");
    expect(normalizarTelefone("011 3333-4444")).toBe("551133334444");
  });

  test("rejeita número curto, longo ou vazio", () => {
    expect(normalizarTelefone("123")).toBeNull();
    expect(normalizarTelefone(null)).toBeNull();
    expect(normalizarTelefone("")).toBeNull();
    expect(normalizarTelefone("55119999999991234")).toBeNull();
  });

  test("rejeita número com 12 ou 13 dígitos que não começa com 55", () => {
    expect(normalizarTelefone("4411999999999")).toBeNull();
  });
});

describe("montarMensagem", () => {
  test("troca as variáveis", () => {
    expect(montarMensagem("Oi {cliente}, valor {valor}", { cliente: "ACME", valor: "R$ 350,00" })).toBe(
      "Oi ACME, valor R$ 350,00",
    );
  });

  test("deixa intacta a variável sem valor", () => {
    expect(montarMensagem("Oi {cliente} {x}", { cliente: "ACME" })).toBe("Oi ACME {x}");
    expect(montarMensagem("Oi {cliente}", { cliente: undefined })).toBe("Oi {cliente}");
  });
});

test("link encoda a mensagem", () => {
  expect(linkWhatsapp("5511999999999", "oi mundo")).toBe(
    "https://wa.me/5511999999999?text=oi%20mundo",
  );
});
