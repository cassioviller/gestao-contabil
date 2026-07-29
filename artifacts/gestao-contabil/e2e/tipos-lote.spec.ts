import { test, expect } from "@playwright/test";

// A grade de obrigações acumula edições e grava tudo num clique só.
const A = "Lote A";
const B = "Lote B";

test("edita várias obrigações e grava de uma vez", async ({ page, request }) => {
  await request.post("/api/tipos", { data: { nome: A } });
  await request.post("/api/tipos", { data: { nome: B } });

  await page.goto("/tipos");
  const linhaA = page.locator("tbody tr").filter({ has: page.locator(`input[value="${A}"]`) });
  const linhaB = page.locator("tbody tr").filter({ has: page.locator(`input[value="${B}"]`) });

  await expect(page.getByText("Nenhuma alteração pendente")).toBeVisible();
  await expect(page.getByRole("button", { name: "Salvar alterações" })).toBeDisabled();

  // Duas edições em obrigações diferentes.
  await linhaA.locator('select[name="periodicidade"]').selectOption("anual");
  await linhaA.locator('select[name="mesReferencia"]').selectOption("7");
  await linhaB.getByRole("checkbox", { name: `${B}: MEI` }).check();
  await linhaB.locator('input[name="diaVencimento"]').fill("25");

  // A barra conta as duas e nomeia quais são.
  await expect(page.getByText(/2 alteração\(ões\) pendente\(s\)/)).toBeVisible();
  await expect(page.getByText(new RegExp(`${A}, ${B}|${B}, ${A}`))).toBeVisible();

  await page.getByRole("button", { name: "Salvar alterações" }).click();
  await expect(page.getByText("✓ alterações salvas")).toBeVisible();

  // Foi mesmo para o banco.
  const tipos = await (await request.get("/api/tipos")).json();
  const a = tipos.find((t: { nome: string }) => t.nome === A);
  const b = tipos.find((t: { nome: string }) => t.nome === B);
  expect(a.periodicidade).toBe("anual");
  expect(a.mesReferencia).toBe(7);
  expect(b.regimes).toEqual(["mei"]);
  expect(b.diaVencimento).toBe(25);

  // Sobrevive ao reload.
  await page.reload();
  await expect(linhaA.locator('select[name="periodicidade"]')).toHaveValue("anual");
  await expect(linhaB.locator('input[name="diaVencimento"]')).toHaveValue("25");
});

test("Descartar desfaz as edições sem tocar no banco", async ({ page, request }) => {
  await page.goto("/tipos");
  const linhaA = page.locator("tbody tr").filter({ has: page.locator(`input[value="${A}"]`) });

  await linhaA.locator('input[name="diaVencimento"]').fill("11");
  await expect(page.getByText(/1 alteração\(ões\) pendente\(s\)/)).toBeVisible();

  await page.getByRole("button", { name: "Descartar" }).click();
  await expect(page.getByText("Nenhuma alteração pendente")).toBeVisible();
  await expect(linhaA.locator('input[name="diaVencimento"]')).not.toHaveValue("11");

  const tipos = await (await request.get("/api/tipos")).json();
  expect(tipos.find((t: { nome: string }) => t.nome === A).diaVencimento).not.toBe(11);
});

test("voltar ao valor original deixa de contar como alteração", async ({ page }) => {
  await page.goto("/tipos");
  const linhaB = page.locator("tbody tr").filter({ has: page.locator(`input[value="${B}"]`) });

  await linhaB.locator('input[name="diaVencimento"]').fill("9");
  await expect(page.getByText(/1 alteração\(ões\) pendente\(s\)/)).toBeVisible();

  // 25 era o valor salvo no primeiro teste.
  await linhaB.locator('input[name="diaVencimento"]').fill("25");
  await expect(page.getByText("Nenhuma alteração pendente")).toBeVisible();
});

test.afterAll(async ({ playwright }) => {
  const api = await playwright.request.newContext({ baseURL: "http://localhost:5179" });
  for (const t of await (await api.get("/api/tipos")).json()) {
    if ([A, B].includes(t.nome)) await api.delete(`/api/tipos/${t.id}`);
  }
  await api.dispose();
});
