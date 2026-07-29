import { test, expect } from "@playwright/test";

// Senhas separadas por sistema/obrigação: várias linhas por empresa.
const EMPRESA = "Senhas LTDA";

test("cadastra senhas por obrigação e elas persistem", async ({ page, request }) => {
  await request.post("/api/clientes", { data: { razaoSocial: EMPRESA } });
  await request.post("/api/tipos", { data: { nome: "DAS" } });

  await page.goto("/senhas");
  await expect(page.getByRole("heading", { name: "Senhas", level: 1 })).toBeVisible();

  // O rótulo mora dentro de um <input>, então hasText não serve: filtra pelo valor.
  const linhaDe = (sistema: string) =>
    page.locator("tbody tr").filter({ has: page.locator(`input[name="rotulo"][value="${sistema}"]`) });

  // Duas linhas para a mesma empresa: uma por sistema.
  for (const sistema of ["DAS", "Nota Fiscal"]) {
    await page.locator('select[aria-label="Empresa"]').selectOption({ label: EMPRESA });
    await page.locator('input[name="novoRotulo"]').fill(sistema);
    await page.getByRole("button", { name: "+ Adicionar acesso" }).click();
    await expect(linhaDe(sistema)).toHaveCount(1);
  }

  await page.getByRole("button", { name: /Mostrar senhas/ }).click();

  const linhaDas = linhaDe("DAS");
  await linhaDas.locator('input[name="login"]').fill("12345678");
  await linhaDas.locator('input[name="login"]').press("Enter");
  await linhaDas.locator('input[name="senha"]').fill("senha-do-das");
  await linhaDas.locator('input[name="senha"]').press("Enter");
  await expect(page.getByText("✓ salvo")).toBeVisible();

  // Reload: veio do banco.
  await page.reload();
  await page.getByRole("button", { name: /Mostrar senhas/ }).click();
  const recarregada = linhaDe("DAS");
  await expect(recarregada.locator('input[name="login"]')).toHaveValue("12345678");
  await expect(recarregada.locator('input[name="senha"]')).toHaveValue("senha-do-das");

  // A mesma empresa aparece nas duas linhas, com sistemas diferentes.
  await expect(page.locator("tbody tr").filter({ hasText: EMPRESA })).toHaveCount(2);
});

test("senha nasce mascarada", async ({ page }) => {
  await page.goto("/senhas");
  const senha = page.locator('input[name="senha"]').first();
  await expect(senha).toHaveAttribute("type", "password");
  await page.getByRole("button", { name: /Mostrar senhas/ }).click();
  await expect(senha).toHaveAttribute("type", "text");
});

test.describe("validação da API de credenciais", () => {
  test("credencial sem rótulo → 400", async ({ request }) => {
    const r = await request.post("/api/credenciais", { data: { clienteId: 1 } });
    expect(r.status()).toBe(400);
  });

  test("credencial com cliente inexistente → 400", async ({ request }) => {
    const r = await request.post("/api/credenciais", { data: { clienteId: 999999, rotulo: "X" } });
    expect(r.status()).toBe(400);
  });

  test("PATCH em credencial inexistente → 404", async ({ request }) => {
    const r = await request.patch("/api/credenciais/999999", { data: { login: "x" } });
    expect(r.status()).toBe(404);
  });
});
