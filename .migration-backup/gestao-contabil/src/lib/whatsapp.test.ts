import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizarTelefone, montarMensagem, linkWhatsapp } from "./whatsapp";

test("normaliza celular com máscara e adiciona DDI 55", () => {
  assert.equal(normalizarTelefone("(11) 99999-9999"), "5511999999999");
});

test("mantém número que já tem 55", () => {
  assert.equal(normalizarTelefone("5511999999999"), "5511999999999");
});

test("rejeita número curto ou vazio", () => {
  assert.equal(normalizarTelefone("123"), null);
  assert.equal(normalizarTelefone(null), null);
  assert.equal(normalizarTelefone(""), null);
});

test("monta mensagem trocando as variáveis", () => {
  const msg = montarMensagem("Oi {cliente}, valor {valor}", {
    cliente: "ACME",
    valor: "R$ 350,00",
  });
  assert.equal(msg, "Oi ACME, valor R$ 350,00");
});

test("deixa intacta a variável sem valor", () => {
  assert.equal(montarMensagem("Oi {cliente} {x}", { cliente: "ACME" }), "Oi ACME {x}");
});

test("link encoda a mensagem", () => {
  assert.equal(
    linkWhatsapp("5511999999999", "oi mundo"),
    "https://wa.me/5511999999999?text=oi%20mundo"
  );
});
