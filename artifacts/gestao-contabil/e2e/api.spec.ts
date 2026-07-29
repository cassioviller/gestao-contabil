import { test, expect } from "@playwright/test";

// API-level checks for the validation + error-handling layer. These hit the API
// through the same `/api` proxy the browser uses.
test.describe("robustez da API", () => {
  test("healthz responde 200", async ({ request }) => {
    const r = await request.get("/api/healthz");
    expect(r.status()).toBe(200);
    expect(await r.json()).toEqual({ status: "ok" });
  });

  test("id não-numérico → 400", async ({ request }) => {
    const r = await request.delete("/api/clientes/abc");
    expect(r.status()).toBe(400);
    expect((await r.json()).error).toBeTruthy();
  });

  test("body sem campo obrigatório → 400", async ({ request }) => {
    const r = await request.post("/api/tipos", { data: {} }); // falta "nome"
    expect(r.status()).toBe(400);
    expect((await r.json()).issues).toBeTruthy();
  });

  test("enum inválido no body → 400", async ({ request }) => {
    const r = await request.patch("/api/checklist/999/status", {
      data: { status: "valor_invalido" },
    });
    expect(r.status()).toBe(400);
  });

  test("mês fora do intervalo → 400", async ({ request }) => {
    const r = await request.post("/api/competencias", { data: { ano: 2099, mes: 13 } });
    expect(r.status()).toBe(400);
  });

  test("PATCH em cliente inexistente → 404", async ({ request }) => {
    const r = await request.patch("/api/clientes/999999", { data: { cnpj: "123" } });
    expect(r.status()).toBe(404);
  });

  test("PATCH sem nenhum campo → 400", async ({ request }) => {
    const r = await request.patch("/api/clientes/1", { data: {} });
    expect(r.status()).toBe(400);
  });

  test("rota inexistente → 404", async ({ request }) => {
    const r = await request.get("/api/nao-existe");
    expect(r.status()).toBe(404);
  });
});
