import { test, expect } from "@playwright/test";

// Guias que a empresa deve ao fisco. Diferente de Pendências, que são as
// obrigações do escritório.
const EMPRESA = "Devedora LTDA";

test("registra guias em atraso, soma o devido e some do total ao pagar", async ({
  page,
  request,
}) => {
  await request.post("/api/clientes", { data: { razaoSocial: EMPRESA } });

  await page.goto("/atrasos");
  await expect(page.getByRole("heading", { name: "Guias em atraso", level: 1 })).toBeVisible();
  await expect(page.getByText("Nenhuma guia em atraso registrada.")).toBeVisible();

  for (const guia of ["INSS", "FGTS", "Parcelamento"]) {
    await page.locator('select[aria-label="Empresa"]').selectOption({ label: EMPRESA });
    await page.locator('input[name="novaGuia"]').fill(guia);
    await page.getByRole("button", { name: "+ Registrar atraso" }).click();
    await expect(page.locator(`input[name="rotulo"][value="${guia}"]`)).toHaveCount(1);
  }

  const linhaDe = (guia: string) =>
    page.locator("tbody tr").filter({ has: page.locator(`input[name="rotulo"][value="${guia}"]`) });

  // Valores e vencimento vencido.
  await linhaDe("INSS").locator('input[name="valor"]').fill("1.200,50");
  await linhaDe("INSS").locator('input[name="valor"]').press("Enter");
  await linhaDe("INSS").locator('input[name="vencimento"]').fill("2020-03-20");
  await linhaDe("INSS").locator('input[name="competenciaRef"]').fill("02/2020");
  await linhaDe("INSS").locator('input[name="competenciaRef"]').press("Enter");

  await linhaDe("FGTS").locator('input[name="valor"]').fill("800,00");
  await linhaDe("FGTS").locator('input[name="valor"]').press("Enter");

  // Total devido soma as duas.
  await expect(page.getByText("R$ 2.000,50")).toBeVisible();
  await expect(page.getByText("1", { exact: true }).first()).toBeVisible(); // 1 empresa com atraso

  // Vencimento passado aparece com os dias de atraso.
  await expect(linhaDe("INSS").getByText(/dia\(s\)/)).toBeVisible();

  // Pagar tira do total, mas a linha continua no histórico.
  await linhaDe("INSS").locator('select[name="status"]').selectOption("pago");
  await expect(page.getByText("R$ 800,00")).toBeVisible();
  await expect(linhaDe("INSS")).toHaveCount(1);

  // Persistiu no banco.
  await page.reload();
  await expect(linhaDe("INSS").locator('select[name="status"]')).toHaveValue("pago");
  await expect(linhaDe("INSS").locator('input[name="valor"]')).toHaveValue("1.200,50");
  await expect(linhaDe("INSS").locator('input[name="competenciaRef"]')).toHaveValue("02/2020");
});

test("filtra por situação", async ({ page }) => {
  await page.goto("/atrasos");

  await page.getByRole("button", { name: "Pago", exact: true }).click();
  await expect(page.locator('input[name="rotulo"][value="INSS"]')).toHaveCount(1);
  await expect(page.locator('input[name="rotulo"][value="FGTS"]')).toHaveCount(0);

  await page.getByRole("button", { name: "Em aberto", exact: true }).click();
  await expect(page.locator('input[name="rotulo"][value="INSS"]')).toHaveCount(0);
  await expect(page.locator('input[name="rotulo"][value="FGTS"]')).toHaveCount(1);
});

test.describe("validação da API de débitos", () => {
  test("débito sem guia → 400", async ({ request }) => {
    const r = await request.post("/api/debitos", { data: { clienteId: 1 } });
    expect(r.status()).toBe(400);
  });

  test("débito com cliente inexistente → 400", async ({ request }) => {
    const r = await request.post("/api/debitos", { data: { clienteId: 999999, rotulo: "INSS" } });
    expect(r.status()).toBe(400);
  });

  test("situação fora da lista → 400", async ({ request }) => {
    const r = await request.patch("/api/debitos/1", { data: { status: "inventado" } });
    expect(r.status()).toBe(400);
  });

  test("PATCH em débito inexistente → 404", async ({ request }) => {
    const r = await request.patch("/api/debitos/999999", { data: { rotulo: "X" } });
    expect(r.status()).toBe(404);
  });
});

test.afterAll(async ({ playwright }) => {
  const api = await playwright.request.newContext({ baseURL: "http://localhost:5179" });
  for (const c of await (await api.get("/api/clientes")).json()) {
    if (c.razaoSocial === EMPRESA) await api.delete(`/api/clientes/${c.id}`);
  }
  await api.dispose();
});
