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
    page
      .locator("tbody tr")
      .filter({ has: page.locator(`input[name="rotulo"][value="${sistema}"]`) });

  // Duas linhas para a mesma empresa: uma por sistema.
  for (const sistema of ["DAS", "Nota Fiscal"]) {
    await page.locator('select[aria-label="Empresa"]').selectOption({ label: EMPRESA });
    await page.locator('input[name="novoRotulo"]').fill(sistema);
    await page.getByRole("button", { name: "+ Adicionar acesso" }).click();
    await expect(linhaDe(sistema)).toHaveCount(1);
  }

  const linhaDas = linhaDe("DAS");
  await linhaDas.locator('input[name="login"]').fill("12345678");
  await linhaDas.locator('input[name="login"]').press("Enter");
  await linhaDas.locator('input[name="senha"]').fill("senha-do-das");
  await linhaDas.locator('input[name="senha"]').press("Enter");
  await expect(page.getByText("✓ salvo")).toBeVisible();

  // Reload: veio do banco. A senha não vem na listagem: fica mascarada e vazia
  // até o clique em revelar (um pedido à API que vai para a auditoria).
  await page.reload();
  const recarregada = linhaDe("DAS");
  await expect(recarregada.locator('input[name="login"]')).toHaveValue("12345678");
  await expect(recarregada.locator('input[name="senha"]')).toHaveValue("");
  await recarregada.locator('button[title="Revelar senha"]').click();
  await expect(recarregada.locator('input[name="senha"]')).toHaveValue("senha-do-das");

  const lista = (await (await request.get("/api/credenciais")).json()) as Array<
    Record<string, unknown>
  >;
  const das = lista.find((c) => c.rotulo === "DAS")!;
  expect(das.temSenha).toBe(true);
  expect("senha" in das).toBe(false);
  expect(JSON.stringify(lista)).not.toContain("senha-do-das");

  // A mesma empresa aparece nas duas linhas, com sistemas diferentes.
  await expect(page.locator("tbody tr").filter({ hasText: EMPRESA })).toHaveCount(2);
});

test("senha nasce mascarada e só é revelada por linha", async ({ page, request }) => {
  const criado = await request.post("/api/clientes", { data: { razaoSocial: "Mascarada LTDA" } });
  const { id: clienteId } = await criado.json();
  await request.post("/api/credenciais", {
    data: { clienteId, rotulo: "Portal X", senha: "segredo-x" },
  });

  await page.goto("/senhas");
  const linha = page
    .locator("tbody tr")
    .filter({ has: page.locator('input[name="rotulo"][value="Portal X"]') });
  const senha = linha.locator('input[name="senha"]');
  await expect(senha).toHaveAttribute("type", "password");
  await expect(senha).toHaveAttribute("placeholder", "••••••••");
  await linha.locator('button[title="Revelar senha"]').click();
  await expect(senha).toHaveAttribute("type", "text");
  await expect(senha).toHaveValue("segredo-x");
  await linha.locator('button[title="Ocultar senha"]').click();
  await expect(linha.locator('input[name="senha"]')).toHaveAttribute("type", "password");
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
