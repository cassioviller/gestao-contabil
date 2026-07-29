import { test, expect } from "@playwright/test";

// A periodicidade decide em que meses a obrigação entra no checklist: uma anual
// não pode aparecer nos outros onze meses.
const EMPRESA = "Periodo LTDA";

test("obrigação anual só entra no mês de referência", async ({ request }) => {
  const mensal = await request.post("/api/tipos", {
    data: { nome: "INSS mensal", periodicidade: "mensal" },
  });
  const anual = await request.post("/api/tipos", {
    data: { nome: "ECF anual", periodicidade: "anual", mesReferencia: 7 },
  });
  const trimestral = await request.post("/api/tipos", {
    data: { nome: "DEFIS trimestral", periodicidade: "trimestral", mesReferencia: 3 },
  });
  const ids = [
    (await mensal.json()).id,
    (await anual.json()).id,
    (await trimestral.json()).id,
  ];

  await request.post("/api/clientes", { data: { razaoSocial: EMPRESA, obrigacoes: ids } });

  // Julho: mensal + anual (ref. 7) + trimestral (3,6,9,12 → julho não) = 2 itens.
  const julho = await request.post("/api/competencias", { data: { ano: 2095, mes: 7 } });
  const { id: idJulho } = await julho.json();
  const itensJulho = await (await request.get(`/api/competencias/${idJulho}/checklist`)).json();
  const nomesJulho = itensJulho.filter((i: { cliente: string }) => i.cliente === EMPRESA)
    .map((i: { obrigacao: string }) => i.obrigacao).sort();
  expect(nomesJulho).toEqual(["ECF anual", "INSS mensal"]);

  // Agosto: só a mensal.
  const agosto = await request.post("/api/competencias", { data: { ano: 2095, mes: 8 } });
  const { id: idAgosto } = await agosto.json();
  const itensAgosto = await (await request.get(`/api/competencias/${idAgosto}/checklist`)).json();
  const nomesAgosto = itensAgosto.filter((i: { cliente: string }) => i.cliente === EMPRESA)
    .map((i: { obrigacao: string }) => i.obrigacao);
  expect(nomesAgosto).toEqual(["INSS mensal"]);

  // Setembro: mensal + trimestral.
  const setembro = await request.post("/api/competencias", { data: { ano: 2095, mes: 9 } });
  const { id: idSet } = await setembro.json();
  const itensSet = await (await request.get(`/api/competencias/${idSet}/checklist`)).json();
  const nomesSet = itensSet.filter((i: { cliente: string }) => i.cliente === EMPRESA)
    .map((i: { obrigacao: string }) => i.obrigacao).sort();
  expect(nomesSet).toEqual(["DEFIS trimestral", "INSS mensal"]);
});

test("tela de Tipos permite escolher periodicidade e filtra por ela", async ({ page }) => {
  await page.goto("/tipos");
  await expect(page.getByRole("heading", { name: "Tipos de obrigação", level: 1 })).toBeVisible();

  // O filtro mostra as cinco periodicidades.
  for (const p of ["Todas", "Mensal", "Bimestral", "Trimestral", "Semestral", "Anual"]) {
    await expect(page.getByRole("button", { name: new RegExp(`^${p}`) })).toBeVisible();
  }

  // Filtrando por Anual sobra a ECF, e a mensal some.
  await page.getByRole("button", { name: /^Anual/ }).click();
  await expect(page.locator('input[value="ECF anual"]')).toHaveCount(1);
  await expect(page.locator('input[value="INSS mensal"]')).toHaveCount(0);

  // O item anual informa em que mês cai.
  await expect(page.getByText(/cai em Julho/)).toBeVisible();

  // O seletor de mês só existe fora do mensal: a linha anual tem, a mensal não.
  const linhaAnual = page.locator("tbody tr").filter({ has: page.locator('input[value="ECF anual"]') });
  await expect(linhaAnual.locator('select[name="mesReferencia"]')).toHaveValue("7");

  await page.getByRole("button", { name: /^Mensal/ }).click();
  const linhaMensal = page.locator("tbody tr").filter({ has: page.locator('input[value="INSS mensal"]') });
  await expect(linhaMensal.locator('select[name="mesReferencia"]')).toHaveCount(0);
});

test.afterAll(async ({ playwright }) => {
  const api = await playwright.request.newContext({ baseURL: "http://localhost:5179" });
  for (const c of await (await api.get("/api/clientes")).json()) {
    if (c.razaoSocial === EMPRESA) await api.delete(`/api/clientes/${c.id}`);
  }
  for (const k of await (await api.get("/api/competencias")).json()) {
    if (k.ano === 2095) await api.delete(`/api/competencias/${k.id}`);
  }
  for (const t of await (await api.get("/api/tipos")).json()) {
    if (/mensal|anual|trimestral/.test(t.nome)) await api.delete(`/api/tipos/${t.id}`);
  }
  await api.dispose();
});
