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
  // A grade cria pelo prompt do navegador e já lista a obrigação.
  page.once("dialog", (d) => d.accept(TIPO));
  await page.getByRole("button", { name: "Nova obrigação" }).click();
  await expect(page.locator(`input[value="${TIPO}"]`)).toHaveCount(1);

  // --- 2. Criar cliente vinculado à obrigação ---
  await nav(page).getByRole("link", { name: "Clientes" }).click();
  await expect(page.getByRole("heading", { name: "Clientes" })).toBeVisible();
  await page.getByRole("button", { name: "Novo cliente" }).click();
  await page.locator('input[name="razaoSocial"]').fill(CLIENTE);
  await page.locator('input[name="valorHonorario"]').fill("350,00");
  await page.locator('select[name="regime"]').selectOption("simples_nacional");
  await page.locator('input[name="cnaePrincipal"]').fill("6920-6/01");
  await page.locator('input[name="email"]').fill("contato@clienteteste.com.br");
  await page.locator("label").filter({ hasText: TIPO }).getByRole("checkbox").check();
  await page.getByRole("button", { name: "Salvar" }).click();
  await expect(page.getByRole("cell", { name: CLIENTE })).toBeVisible();
  await expect(page.getByRole("cell", { name: "Simples Nacional" })).toBeVisible();

  // Reabrir o cadastro: CNAE e e-mail têm que voltar do banco.
  // Mira a linha desta empresa — outros testes deixam clientes na lista e o
  // `.first()` pegaria a linha errada.
  await page.locator("tbody tr").filter({ hasText: CLIENTE }).getByRole("button", { name: "Editar" }).click();
  await expect(page.locator('input[name="cnaePrincipal"]')).toHaveValue("6920-6/01");
  await expect(page.locator('input[name="email"]')).toHaveValue("contato@clienteteste.com.br");
  await page.getByRole("button", { name: "Cancelar" }).click();

  // --- 3. Abrir competência (gera checklist + pagamentos) ---
  await nav(page).getByRole("link", { name: "Competências" }).click();
  await page.getByRole("button", { name: "Abrir mês" }).click();
  await page.locator('select[name="mes"]').selectOption({ label: MES });
  await page.locator('input[name="ano"]').fill(ANO);
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
  await expect(celula).toHaveText("E"); // emitido (estado otimista)

  // Segundo clique: emitido → enviado, que é o fim do ciclo.
  await Promise.all([
    page.waitForResponse(
      (r) => /\/api\/checklist\/\d+\/status/.test(r.url()) && r.request().method() === "PATCH",
    ),
    celula.click(),
  ]);
  await expect(celula).toHaveText("✓"); // enviado

  // Recarrega para confirmar a persistência no DB e atualizar o resumo do cabeçalho.
  await page.reload();
  await expect(
    page.getByRole("row", { name: new RegExp(CLIENTE) }).getByRole("button").first(),
  ).toHaveText("✓");
  await expect(page.getByText("1/1")).toBeVisible(); // "Obrigações enviadas 1/1"

  // --- 5. Pagamentos: marcar como pago ---
  await page.getByRole("link", { name: "Pagamentos" }).click();
  const linhaPgto = page.getByRole("row", { name: new RegExp(CLIENTE) });
  await linhaPgto.getByRole("combobox").selectOption("pago");
  // O honorário do mês nasce com o valor do cadastro (350,00); digitar outro
  // valor é o que prova que a edição persiste. Digitar o mesmo não grava nada.
  const valor = linhaPgto.getByPlaceholder("0,00");
  await valor.fill("375,50");
  await Promise.all([
    page.waitForResponse(
      (r) => /\/api\/pagamentos\/\d+/.test(r.url()) && r.request().method() === "PATCH",
    ),
    valor.blur(),
  ]);
  await page.reload();
  const linhaPgtoApos = page.getByRole("row", { name: new RegExp(CLIENTE) });
  await expect(linhaPgtoApos.getByRole("combobox")).toHaveValue("pago");
  // Persistiu na coluna numeric e volta exibido em pt-BR — nunca "350.00",
  // que reeditado sem mexer virava 35000.
  await expect(linhaPgtoApos.getByPlaceholder("0,00")).toHaveValue("375,50");
  await expect(page.getByText("1 pagos")).toBeVisible(); // card "Recebido"

  // --- 6. Pendências: tudo resolvido, página carrega sem erro ---
  await nav(page).getByRole("link", { name: "Pendências" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
});
