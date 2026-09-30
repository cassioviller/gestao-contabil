import { test, expect } from "@playwright/test";
import { apagarCliente } from "./apoio";

// Ciclo de vida da guia no checklist: pendente → emitido → enviado → não se
// aplica → pendente. Só "enviado" conta como concluída nos resumos.
const EMPRESA = "Guia LTDA";
const OBRIGACAO = "DAS Teste";

test("célula do checklist percorre pendente → emitido → enviado", async ({ page, request }) => {
  const t = await request.post("/api/tipos", { data: { nome: OBRIGACAO } });
  const { id: tipoId } = await t.json();
  await request.post("/api/clientes", {
    data: { razaoSocial: EMPRESA, valorHonorario: "100.00", obrigacoes: [tipoId] },
  });
  const c = await request.post("/api/competencias", { data: { ano: 2097, mes: 5 } });
  const { id: compId } = await c.json();

  await page.goto(`/competencias/${compId}`);
  const celula = page
    .getByRole("row", { name: new RegExp(EMPRESA) })
    .getByRole("button")
    .first();

  // A legenda mostra os quatro estados pelo nome.
  for (const rotulo of ["Pendente", "Emitido", "Enviado", "Não se aplica"]) {
    await expect(page.getByText(rotulo, { exact: true }).first()).toBeVisible();
  }

  await expect(celula).toHaveText("•");
  await celula.click();
  await expect(celula).toHaveText("E");
  await expect(celula).toHaveAttribute("title", /Emitido/);

  await celula.click();
  await expect(celula).toHaveText("✓");
  await expect(celula).toHaveAttribute("title", /Enviado/);

  await page.reload();

  // Persistiu como "enviado" no banco. Confere o item desta empresa em vez das
  // contagens globais: outros specs deixam clientes com obrigações vinculadas,
  // que entram na mesma competência.
  const itens = await (await request.get(`/api/competencias/${compId}/checklist`)).json();
  const meu = itens.find((i: { cliente: string }) => i.cliente === EMPRESA);
  expect(meu.status).toBe("enviado");

  // Só "enviado" entra na contagem de concluídas — "emitido" fica de fora.
  const comps = await (await request.get("/api/competencias")).json();
  const comp = comps.find((k: { id: number }) => k.id === compId);
  expect(comp.resumo.obrigacoes.feitos).toBe(1);
  expect(comp.resumo.obrigacoes.emitidos).toBe(0);

  // Fecha o ciclo: enviado → não se aplica → pendente.
  const recarregada = page
    .getByRole("row", { name: new RegExp(EMPRESA) })
    .getByRole("button")
    .first();
  await recarregada.click();
  await expect(recarregada).toHaveText("–");
  await recarregada.click();
  await expect(recarregada).toHaveText("•");
});

test("API recusa status fora do ciclo", async ({ request }) => {
  const r = await request.patch("/api/checklist/1/status", { data: { status: "feito" } });
  expect(r.status()).toBe(400); // "feito" não existe mais
});

test.afterAll(async ({ playwright }) => {
  const api = await playwright.request.newContext({ baseURL: "http://localhost:5179" });
  for (const c of await (await api.get("/api/clientes")).json()) {
    if (c.razaoSocial === EMPRESA) await apagarCliente(api, c.id);
  }
  for (const k of await (await api.get("/api/competencias")).json()) {
    if (k.ano === 2097) await api.delete(`/api/competencias/${k.id}`);
  }
  await api.dispose();
});
