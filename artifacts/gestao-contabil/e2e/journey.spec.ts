import { test, expect, type Page } from "@playwright/test";

// Full ContaFácil workflow, exercised through the UI against a real API + DB.
// The DB is truncated in global-setup, so this test both seeds and verifies.
const TIPO = "DAS - Simples Nacional";
const CLIENTE = "Cliente Teste LTDA";
const ANO = "2099";
const MES = "Janeiro";
const ROTULO = `${MES} ${ANO}`;

function nav(page: Page) {
  return page.locator("aside nav");
}

test("jornada completa do contador: tipo → cliente → competência → checklist → pagamento → pendências", async ({
  page,
}) => {
  // --- Painel (dashboard inicial) ---
  await page.goto("/");
  await expect(page.getByText("ContaFácil")).toBeVisible();

  // --- 1. Criar tipo de obrigação ---
  await nav(page).getByRole("link", { name: "Tipos de obrigação" }).click();
  await expect(page.getByRole("heading", { name: "Tipos de obrigação" })).toBeVisible();
  await page.getByRole("button", { name: "Novo tipo" }).click();
  await page.locator('input[name="nome"]').fill(TIPO);
  await page.getByRole("button", { name: "Salvar" }).click();
  await expect(page.getByText(TIPO)).toBeVisible();

  // --- 2. Criar cliente vinculado à obrigação ---
  await nav(page).getByRole("link", { name: "Clientes" }).click();
  await expect(page.getByRole("heading", { name: "Clientes" })).toBeVisible();
  await page.getByRole("button", { name: "Novo cliente" }).click();
  await page.locator('input[name="razaoSocial"]').fill(CLIENTE);
  await page.locator('input[name="valorHonorario"]').fill("350,00");
  await page.locator("label").filter({ hasText: TIPO }).getByRole("checkbox").check();
  await page.getByRole("button", { name: "Salvar" }).click();
  await expect(page.getByRole("cell", { name: CLIENTE })).toBeVisible();

  // --- 3. Abrir competência (gera checklist + pagamentos) ---
  await nav(page).getByRole("link", { name: "Competências" }).click();
  await page.getByRole("button", { name: "Abrir mês" }).click();
  await page.getByLabel("Mês").selectOption({ label: MES });
  await page.getByLabel("Ano").fill(ANO);
  await page.getByRole("button", { name: "Gerar checklist" }).click();
  const cardComp = page.getByRole("link", { name: new RegExp(ROTULO) });
  await expect(cardComp).toBeVisible();

  // --- 4. Checklist: marcar a obrigação como feita ---
  await cardComp.click();
  await expect(page.getByRole("heading", { name: ROTULO })).toBeVisible();
  await expect(page.getByRole("columnheader", { name: TIPO })).toBeVisible();
  const celula = page.getByRole("row", { name: new RegExp(CLIENTE) }).getByRole("button").first();
  await expect(celula).toHaveText("•"); // pendente
  await Promise.all([
    page.waitForResponse(
      (r) => /\/api\/checklist\/\d+\/status/.test(r.url()) && r.request().method() === "PATCH",
    ),
    celula.click(),
  ]);
  await expect(celula).toHaveText("✓"); // feito (estado otimista)
  // Recarrega para confirmar a persistência no DB e atualizar o resumo do cabeçalho.
  await page.reload();
  await expect(
    page.getByRole("row", { name: new RegExp(CLIENTE) }).getByRole("button").first(),
  ).toHaveText("✓");
  await expect(page.getByText("1/1")).toBeVisible(); // "Obrigações feitas 1/1"

  // --- 5. Pagamentos: marcar como pago ---
  await page.getByRole("link", { name: "Pagamentos" }).click();
  const linhaPgto = page.getByRole("row", { name: new RegExp(CLIENTE) });
  await linhaPgto.getByRole("combobox").selectOption("pago");
  const valor = linhaPgto.getByPlaceholder("0,00");
  await valor.fill("350,00");
  await Promise.all([
    page.waitForResponse(
      (r) => /\/api\/pagamentos\/\d+/.test(r.url()) && r.request().method() === "PATCH",
    ),
    valor.blur(),
  ]);
  await page.reload();
  const linhaPgtoApos = page.getByRole("row", { name: new RegExp(CLIENTE) });
  await expect(linhaPgtoApos.getByRole("combobox")).toHaveValue("pago");
  // Valor deve persistir já normalizado (vírgula → ponto) na coluna numeric.
  await expect(linhaPgtoApos.getByPlaceholder("0,00")).toHaveValue("350.00");
  await expect(page.getByText("1 pagos")).toBeVisible(); // card "Recebido"

  // --- 6. Pendências: tudo resolvido, página carrega sem erro ---
  await nav(page).getByRole("link", { name: "Pendências" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
});
