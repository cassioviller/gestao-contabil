import { test, expect } from "@playwright/test";

// Ao definir o regime de um cliente, as obrigações do catálogo marcadas como
// automáticas e compatíveis com o regime são vinculadas sozinhas. Nunca se
// desvincula nada; uma lista explícita de obrigações prevalece.
const AUTO_SIMPLES = "Auto Simples";
const AUTO_GERAL = "Auto Geral";
const MANUAL = "Manual X";
const AUTO_PRESUMIDO = "Auto Presumido";
const INATIVA = "Auto Inativa";
const EMPRESA = "Vínculo Auto LTDA";
const EXPLICITA = "Lista Explícita LTDA";

async function tipo(request: import("@playwright/test").APIRequestContext, data: Record<string, unknown>) {
  const r = await request.post("/api/tipos", { data });
  expect(r.status(), await r.text()).toBe(200);
  return (await r.json()) as { id: number; nome: string };
}

async function obrigacoesDe(request: import("@playwright/test").APIRequestContext, id: number) {
  const lista = (await (await request.get("/api/clientes")).json()) as Array<{ id: number; obrigacoes: number[] }>;
  return lista.find((c) => c.id === id)!.obrigacoes;
}

test.describe("vínculo automático por regime", () => {
  test("definir o regime vincula as automáticas do regime; trocar só acrescenta", async ({ request }) => {
    const simples = await tipo(request, { nome: AUTO_SIMPLES, regimes: ["simples_nacional"] });
    const geral = await tipo(request, { nome: AUTO_GERAL });
    const manual = await tipo(request, { nome: MANUAL, vincularAutomatico: false });
    const inativa = await tipo(request, { nome: INATIVA, ativo: false });

    // Sem regime, nada é vinculado.
    const criado = await request.post("/api/clientes", { data: { razaoSocial: EMPRESA } });
    const { id } = await criado.json();
    expect(await obrigacoesDe(request, id)).toEqual([]);

    // Regime pela planilha (PATCH): entram a do Simples e a geral; não a manual nem a inativa.
    const patch = await request.patch(`/api/clientes/${id}`, { data: { regime: "simples_nacional" } });
    expect(patch.status()).toBe(200);
    let obrig = await obrigacoesDe(request, id);
    expect(obrig).toEqual(expect.arrayContaining([simples.id, geral.id]));
    expect(obrig).not.toContain(manual.id);
    expect(obrig).not.toContain(inativa.id);

    // Trocar para presumido: a do Simples continua (nunca se desvincula).
    await request.patch(`/api/clientes/${id}`, { data: { regime: "lucro_presumido" } });
    obrig = await obrigacoesDe(request, id);
    expect(obrig).toContain(simples.id);

    // Obrigação nova no catálogo + "vincular automáticas": a base fica em dia.
    const presumido = await tipo(request, { nome: AUTO_PRESUMIDO, regimes: ["lucro_presumido"] });
    expect(await obrigacoesDe(request, id)).not.toContain(presumido.id);
    const sincronizado = await request.post("/api/tipos/vincular-automaticos");
    expect(sincronizado.status()).toBe(200);
    expect((await sincronizado.json()).vinculosCriados).toBeGreaterThanOrEqual(1);
    expect(await obrigacoesDe(request, id)).toContain(presumido.id);
    // Rodar de novo não cria nada.
    expect((await (await request.post("/api/tipos/vincular-automaticos")).json()).vinculosCriados).toBe(0);
  });

  test("lista explícita de obrigações prevalece sobre o automático", async ({ request }) => {
    const criado = await request.post("/api/clientes", {
      data: { razaoSocial: EXPLICITA, regime: "simples_nacional", obrigacoes: [] },
    });
    const { id } = await criado.json();
    expect(await obrigacoesDe(request, id)).toEqual([]);
  });

  test("a grade de Tipos edita 'Auto' e 'Ativa' e grava no banco", async ({ page, request }) => {
    await page.goto("/tipos");
    const linha = page.locator("tbody tr").filter({ has: page.locator(`input[value="${AUTO_GERAL}"]`) });
    await expect(linha.getByRole("checkbox", { name: `${AUTO_GERAL}: vincular automaticamente` })).toBeChecked();
    await expect(linha.getByRole("checkbox", { name: `${AUTO_GERAL}: ativa` })).toBeChecked();

    await linha.getByRole("checkbox", { name: `${AUTO_GERAL}: vincular automaticamente` }).uncheck();
    await linha.getByRole("checkbox", { name: `${AUTO_GERAL}: ativa` }).uncheck();
    await linha.locator('input[name="descricao"]').fill("Guia geral de teste");
    await page.getByRole("button", { name: "Salvar alterações" }).click();
    await expect(page.getByText("✓ alterações salvas")).toBeVisible();

    const tipos = (await (await request.get("/api/tipos")).json()) as Array<Record<string, unknown>>;
    const geral = tipos.find((t) => t.nome === AUTO_GERAL)!;
    expect(geral.vincularAutomatico).toBe(false);
    expect(geral.ativo).toBe(false);
    expect(geral.descricao).toBe("Guia geral de teste");
  });

  test("no cadastro, escolher o regime marca as automáticas do regime", async ({ page }) => {
    await page.goto("/clientes");
    await page.getByRole("button", { name: "Novo cliente" }).click();
    const caixa = (nome: string) => page.locator("label").filter({ hasText: nome }).getByRole("checkbox");
    await expect(caixa(AUTO_SIMPLES)).not.toBeChecked();

    await page.locator('select[name="regime"]').selectOption("simples_nacional");
    await expect(caixa(AUTO_SIMPLES)).toBeChecked();
    await expect(caixa(MANUAL)).not.toBeChecked();
    // Desmarcada à mão fica desmarcada — o automático não briga com a contadora.
    await caixa(AUTO_SIMPLES).uncheck();
    await expect(caixa(AUTO_SIMPLES)).not.toBeChecked();
    await page.getByRole("button", { name: "Cancelar" }).click();
  });
});

test.afterAll(async ({ playwright }) => {
  const api = await playwright.request.newContext({ baseURL: "http://localhost:5179" });
  for (const c of await (await api.get("/api/clientes")).json()) {
    if ([EMPRESA, EXPLICITA].includes(c.razaoSocial)) await api.delete(`/api/clientes/${c.id}`);
  }
  for (const t of await (await api.get("/api/tipos")).json()) {
    if ([AUTO_SIMPLES, AUTO_GERAL, MANUAL, AUTO_PRESUMIDO, INATIVA].includes(t.nome)) {
      await api.delete(`/api/tipos/${t.id}`);
    }
  }
  await api.dispose();
});
