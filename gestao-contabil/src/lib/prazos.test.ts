import { test } from "node:test";
import assert from "node:assert/strict";
import { calcularVencimento } from "./prazos";

test("offset 1 joga para o mês seguinte", () => {
  // competência maio/2026, dia 20, mês seguinte => 20/06/2026
  assert.equal(calcularVencimento(2026, 5, 20, 1), "2026-06-20");
});

test("offset 0 fica no mesmo mês", () => {
  assert.equal(calcularVencimento(2026, 5, 10, 0), "2026-05-10");
});

test("vira o ano quando passa de dezembro", () => {
  // dezembro/2026 + 1 mês => janeiro/2027
  assert.equal(calcularVencimento(2026, 12, 15, 1), "2027-01-15");
});

test("clampa para o último dia do mês curto", () => {
  // janeiro/2026 dia 31 + 1 mês => fevereiro só tem 28 dias
  assert.equal(calcularVencimento(2026, 1, 31, 1), "2026-02-28");
});

test("dia nulo ou zero retorna null", () => {
  assert.equal(calcularVencimento(2026, 5, null, 1), null);
  assert.equal(calcularVencimento(2026, 5, 0, 1), null);
});
