import { test, expect } from "@playwright/test";
import { apagarCliente } from "./apoio";

// Pedidos usam a mesma máquina dos processos, mas as duas abas não podem
// misturar registros.
const EMPRESA = "Pedido LTDA";

test("cria pedido com checklist e ele não aparece em Processos", async ({ page, request }) => {
  await request.post("/api/clientes", { data: { razaoSocial: EMPRESA } });

  await page.goto("/pedidos");
  await expect(page.getByRole("heading", { name: "Pedidos", level: 1 })).toBeVisible();

  await page.getByRole("button", { name: "+ Novo pedido" }).click();
  await page.locator('select[name="clienteId"]').selectOption({ label: EMPRESA });
  await page.locator('input[name="tipo"]').fill("Atualização de guia");
  await page.getByRole("button", { name: "Criar pedido" }).click();

  const linha = page.locator("tbody tr").filter({ hasText: EMPRESA });
  await expect(linha).toHaveCount(1);
  await expect(linha).toContainText("Atualização de guia");

  // Checklist funciona igual ao do processo.
  await linha.getByRole("link", { name: "Abrir" }).click();
  await expect(page.getByRole("link", { name: "← Pedidos" })).toBeVisible();
  await page.locator('input[name="novaEtapa"]').fill("Conferir valor com o cliente");
  await page.getByRole("button", { name: "Adicionar" }).click();
  await expect(page.getByRole("checkbox", { name: "Conferir valor com o cliente" })).toBeVisible();

  // Órgão/protocolo são de processo, não de pedido.
  await expect(page.getByText("Órgão", { exact: true })).toHaveCount(0);

  // A aba de Processos não mostra pedidos.
  await page.goto("/processos");
  await expect(page.locator("tbody tr").filter({ hasText: EMPRESA })).toHaveCount(0);
});

test("formulário de pedido sugere os pedidos comuns", async ({ page }) => {
  await page.goto("/pedidos");
  await page.getByRole("button", { name: "+ Novo pedido" }).click();
  const opcoes = page.locator("#tipos-sugeridos option");
  await expect(opcoes.first()).toHaveAttribute("value", "Atualização de guia");
  await expect(page.locator('#tipos-sugeridos option[value="Atualização de salário"]')).toHaveCount(
    1,
  );
});

test.afterAll(async ({ playwright }) => {
  const api = await playwright.request.newContext({ baseURL: "http://localhost:5179" });
  for (const c of await (await api.get("/api/clientes")).json()) {
    if (c.razaoSocial === EMPRESA) await apagarCliente(api, c.id);
  }
  await api.dispose();
});
