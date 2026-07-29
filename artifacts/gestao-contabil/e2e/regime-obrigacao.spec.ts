import { test, expect } from "@playwright/test";

// Obrigação pode ser restrita a certos regimes. No cadastro do cliente, as que
// não são do regime dele saem da lista.
const SO_PRESUMIDO = "DIFAL presumido";
const TODOS = "INSS geral";
const EMPRESA = "Regime Obrig LTDA";

test("obrigação restrita some do cadastro de cliente de outro regime", async ({ page, request }) => {
  await request.post("/api/tipos", { data: { nome: TODOS } });
  await request.post("/api/tipos", { data: { nome: SO_PRESUMIDO, regimes: ["lucro_presumido"] } });

  await page.goto("/clientes");
  await page.getByRole("button", { name: "Novo cliente" }).click();
  await page.locator('input[name="razaoSocial"]').fill(EMPRESA);

  // Sem regime definido, tudo aparece — não dá para saber o que se aplica.
  await expect(page.locator("label").filter({ hasText: SO_PRESUMIDO })).toHaveCount(1);

  // Simples Nacional: a restrita ao presumido sai da lista.
  await page.locator('select[name="regime"]').selectOption("simples_nacional");
  await expect(page.locator("label").filter({ hasText: SO_PRESUMIDO })).toHaveCount(0);
  await expect(page.locator("label").filter({ hasText: TODOS })).toHaveCount(1);

  // Dá para trazer de volta quando é exceção.
  await page.getByRole("button", { name: /Mostrar todas/ }).click();
  await expect(page.locator("label").filter({ hasText: SO_PRESUMIDO })).toHaveCount(1);
  await page.getByRole("button", { name: "Mostrar só as do regime" }).click();
  await expect(page.locator("label").filter({ hasText: SO_PRESUMIDO })).toHaveCount(0);

  // Lucro presumido: volta a aparecer.
  await page.locator('select[name="regime"]').selectOption("lucro_presumido");
  await expect(page.locator("label").filter({ hasText: SO_PRESUMIDO })).toHaveCount(1);

  await page.locator("label").filter({ hasText: SO_PRESUMIDO }).getByRole("checkbox").check();
  await page.getByRole("button", { name: "Salvar" }).click();
  await expect(page.getByRole("cell", { name: EMPRESA })).toBeVisible();
});

test("obrigação vinculada não some ao trocar o regime", async ({ page }) => {
  // O cliente do teste anterior ficou com a DIFAL vinculada. Mudar para Simples
  // não pode esconder o checkbox marcado — sumir equivaleria a desvincular.
  await page.goto("/clientes");
  await page.locator("tbody tr").filter({ hasText: EMPRESA }).getByRole("button", { name: "Editar" }).click();
  await page.locator('select[name="regime"]').selectOption("simples_nacional");

  const linha = page.locator("label").filter({ hasText: SO_PRESUMIDO });
  await expect(linha).toHaveCount(1);
  await expect(linha.getByRole("checkbox")).toBeChecked();
  await expect(linha).toContainText("⚠");
});

test("grade de Tipos mostra e edita a restrição de regime", async ({ page }) => {
  await page.goto("/tipos");

  const linhaRestrita = page.locator("tbody tr").filter({
    has: page.locator(`input[value="${SO_PRESUMIDO}"]`),
  });
  const linhaLivre = page.locator("tbody tr").filter({
    has: page.locator(`input[value="${TODOS}"]`),
  });

  // Restrita: só o Lucro Presumido marcado. Livre: nenhum, e diz "todos".
  await expect(linhaRestrita.getByRole("checkbox", { name: `${SO_PRESUMIDO}: Lucro Presumido` })).toBeChecked();
  await expect(linhaRestrita.getByRole("checkbox", { name: `${SO_PRESUMIDO}: MEI` })).not.toBeChecked();
  await expect(linhaLivre).toContainText("todos");
});

test.afterAll(async ({ playwright }) => {
  const api = await playwright.request.newContext({ baseURL: "http://localhost:5179" });
  for (const c of await (await api.get("/api/clientes")).json()) {
    if (c.razaoSocial === EMPRESA) await api.delete(`/api/clientes/${c.id}`);
  }
  for (const t of await (await api.get("/api/tipos")).json()) {
    if ([SO_PRESUMIDO, TODOS].includes(t.nome)) await api.delete(`/api/tipos/${t.id}`);
  }
  await api.dispose();
});
