import { test, expect } from "@playwright/test";
import { apagarCliente } from "./apoio";

// Meses anteriores ao início do uso do sistema entram só com os honorários:
// o checklist daqueles meses seria ruído. Cobre o caminho de registrar
// honorário em atraso antes de começar de fato em junho/2026.
const EMPRESA = "Atraso LTDA";

test("competência 'somente honorários' gera pagamento sem checklist", async ({ page, request }) => {
  const c = await request.post("/api/clientes", {
    data: { razaoSocial: EMPRESA, valorHonorario: "350.00" },
  });
  const { id: clienteId } = await c.json();
  const t = await request.post("/api/tipos", { data: { nome: "INSS" } });
  const { id: tipoId } = await t.json();
  // Vincula a obrigação: sem isso o teste passaria por acidente.
  await request.post("/api/clientes", {
    data: { id: clienteId, razaoSocial: EMPRESA, valorHonorario: "350.00", obrigacoes: [tipoId] },
  });

  await page.goto("/competencias");
  await page.getByRole("button", { name: "+ Abrir mês" }).click();
  await page.locator('select[name="mes"]').selectOption("3"); // Março
  await page.locator('input[name="ano"]').fill("2026");
  await page.locator('input[name="somenteHonorarios"]').check();
  await page.getByRole("button", { name: "Gerar honorários" }).click();

  const marco = page.locator("li, tr, div").filter({ hasText: "Março 2026" }).first();
  await expect(marco).toBeVisible();

  // Confere na API: pagamento gerado, checklist vazio.
  const comps = await (await request.get("/api/competencias")).json();
  const compMarco = comps.find((k: { ano: number; mes: number }) => k.ano === 2026 && k.mes === 3);
  expect(compMarco.resumo.pagamentos.total).toBeGreaterThan(0);
  expect(compMarco.resumo.obrigacoes.total).toBe(0);
});

test("competência normal continua gerando o checklist", async ({ request }) => {
  const r = await request.post("/api/competencias", { data: { ano: 2026, mes: 6 } });
  expect(r.status()).toBe(200);

  const comps = await (await request.get("/api/competencias")).json();
  const junho = comps.find((k: { ano: number; mes: number }) => k.ano === 2026 && k.mes === 6);
  expect(junho.resumo.obrigacoes.total).toBeGreaterThan(0);
  expect(junho.resumo.pagamentos.total).toBeGreaterThan(0);
});

// Este é o único spec que deixa uma empresa com obrigação vinculada. Sem limpar,
// ela entra no checklist das competências que os testes seguintes abrem e
// bagunça as contagens deles.
test.afterAll(async ({ playwright }) => {
  const api = await playwright.request.newContext({ baseURL: "http://localhost:5179" });
  const clientes = await (await api.get("/api/clientes")).json();
  for (const c of clientes) {
    if (c.razaoSocial === EMPRESA) await apagarCliente(api, c.id);
  }
  const comps = await (await api.get("/api/competencias")).json();
  for (const k of comps) {
    if (k.ano === 2026) await api.delete(`/api/competencias/${k.id}`);
  }
  await api.dispose();
});
