import { test, expect, request as apiRequest, type APIRequestContext } from "@playwright/test";
import { CONTA_E2E } from "./global-setup";

/** Contexto de rede sem sessão nenhuma (o `storageState` do projeto vem logado). */
async function contextoLimpo(baseURL: string | undefined): Promise<APIRequestContext> {
  return apiRequest.newContext({ baseURL, storageState: { cookies: [], origins: [] } });
}

async function logar(baseURL: string | undefined, login: string, senha: string) {
  const contexto = await contextoLimpo(baseURL);
  const r = await contexto.post("/api/auth/entrar", { data: { login, senha } });
  return { contexto, status: r.status() };
}

const AUX = { login: "aux-e2e", senha: "senha-aux-123" };

// Papéis: o admin gerencia gente; o auxiliar opera mas não revela senhas nem
// entra na gestão de usuários. Sessões: a troca de senha derruba as outras.
test.describe("usuários, papéis e sessão", () => {
  test("a sessão diz quem é e qual o papel", async ({ request }) => {
    const eu = await (await request.get("/api/auth/eu")).json();
    expect(eu.login).toBe(CONTA_E2E.login);
    expect(eu.papel).toBe("admin");
    expect(typeof eu.usuarioId).toBe("number");
  });

  test("admin cria um auxiliar; login repetido dá 409", async ({ request }) => {
    const r = await request.post("/api/usuarios", {
      data: { login: AUX.login, nome: "Auxiliar", papel: "auxiliar", senha: AUX.senha },
    });
    expect(r.status(), await r.text()).toBe(200);
    const criado = await r.json();
    expect(criado.papel).toBe("auxiliar");
    expect(criado.ativo).toBe(true);
    expect("senhaHash" in criado).toBe(false);

    const repetido = await request.post("/api/usuarios", {
      data: { login: AUX.login.toUpperCase(), papel: "contador", senha: "outra-senha-1" },
    });
    expect(repetido.status()).toBe(409);

    const curta = await request.post("/api/usuarios", {
      data: { login: "curta", papel: "contador", senha: "1234567" },
    });
    expect(curta.status()).toBe(400);

    const lista = (await (await request.get("/api/usuarios")).json()) as Array<{ login: string }>;
    expect(lista.map((u) => u.login)).toEqual(expect.arrayContaining([CONTA_E2E.login, AUX.login]));
  });

  test("auxiliar opera, mas não gerencia usuários nem revela senhas", async ({
    request,
    baseURL,
  }) => {
    const criado = await request.post("/api/clientes", {
      data: { razaoSocial: "Cliente com segredo", senhaGov: "gov-123" },
    });
    const { id: clienteId } = await criado.json();

    const { contexto: aux, status } = await logar(baseURL, AUX.login, AUX.senha);
    try {
      expect(status).toBe(200);
      expect((await aux.get("/api/clientes")).status()).toBe(200);
      expect((await aux.get("/api/usuarios")).status()).toBe(403);
      expect((await aux.get(`/api/clientes/${clienteId}/segredos`)).status()).toBe(403);
      // O admin revela.
      const segredos = await (await request.get(`/api/clientes/${clienteId}/segredos`)).json();
      expect(segredos.senhaGov).toBe("gov-123");
    } finally {
      await aux.dispose();
    }
  });

  test("admin não tira o próprio acesso; o escritório não fica sem admin", async ({ request }) => {
    const eu = await (await request.get("/api/auth/eu")).json();
    const proprio = await request.patch(`/api/usuarios/${eu.usuarioId}`, {
      data: { ativo: false },
    });
    expect(proprio.status()).toBe(400);
    const rebaixar = await request.patch(`/api/usuarios/${eu.usuarioId}`, {
      data: { papel: "auxiliar" },
    });
    expect(rebaixar.status()).toBe(400);
    // Continua admin e logado.
    expect((await request.get("/api/usuarios")).status()).toBe(200);
  });

  test("trocar a própria senha derruba as outras sessões", async ({ baseURL }) => {
    const a = await logar(baseURL, AUX.login, AUX.senha);
    const b = await logar(baseURL, AUX.login, AUX.senha);
    try {
      expect(a.status).toBe(200);
      expect(b.status).toBe(200);

      const errada = await a.contexto.post("/api/auth/trocar-senha", {
        data: { senhaAtual: "nao-e-essa", novaSenha: "senha-aux-nova-1" },
      });
      expect(errada.status()).toBe(400);

      const certa = await a.contexto.post("/api/auth/trocar-senha", {
        data: { senhaAtual: AUX.senha, novaSenha: "senha-aux-nova-1" },
      });
      expect(certa.status(), await certa.text()).toBe(204);

      // A sessão que trocou continua; a outra caiu.
      expect((await a.contexto.get("/api/auth/eu")).status()).toBe(200);
      expect((await b.contexto.get("/api/auth/eu")).status()).toBe(401);

      // A senha antiga não entra mais; a nova entra.
      expect((await logar(baseURL, AUX.login, AUX.senha)).status).toBe(401);
      const c = await logar(baseURL, AUX.login, "senha-aux-nova-1");
      expect(c.status).toBe(200);

      // Sair de todos: nem a sessão atual sobrevive.
      expect((await c.contexto.post("/api/auth/sair-de-todos")).status()).toBe(204);
      expect((await c.contexto.get("/api/auth/eu")).status()).toBe(401);
      expect((await a.contexto.get("/api/auth/eu")).status()).toBe(401);
      await c.contexto.dispose();
    } finally {
      await a.contexto.dispose();
      await b.contexto.dispose();
    }
  });

  test("admin redefine a senha e desativa um usuário", async ({ request, baseURL }) => {
    const lista = (await (await request.get("/api/usuarios")).json()) as Array<{
      id: number;
      login: string;
    }>;
    const aux = lista.find((u) => u.login === AUX.login)!;

    const r = await request.post(`/api/usuarios/${aux.id}/redefinir-senha`, {
      data: { novaSenha: "redefinida-123" },
    });
    expect(r.status()).toBe(204);
    const sessao = await logar(baseURL, AUX.login, "redefinida-123");
    expect(sessao.status).toBe(200);

    const desativado = await request.patch(`/api/usuarios/${aux.id}`, { data: { ativo: false } });
    expect(desativado.status()).toBe(200);
    // Desativado: a sessão aberta cai e o login não entra mais.
    expect((await sessao.contexto.get("/api/auth/eu")).status()).toBe(401);
    expect((await logar(baseURL, AUX.login, "redefinida-123")).status).toBe(401);
    await sessao.contexto.dispose();
  });

  test("a tela de Usuários lista as pessoas do escritório", async ({ page }) => {
    await page.goto("/usuarios");
    await expect(page.getByRole("heading", { name: "Usuários", level: 1 })).toBeVisible();
    await expect(page.locator("tbody tr").filter({ hasText: AUX.login })).toHaveCount(1);
    // "e2e" também casa com "aux-e2e": mira pela marca de quem está logado.
    await expect(page.locator("tbody tr").filter({ hasText: "(você)" })).toContainText(
      CONTA_E2E.login,
    );
  });

  test("a tela Minha conta troca a senha pelo formulário", async ({
    request,
    browser,
    baseURL,
  }) => {
    // Usuário só deste teste: trocar a senha derruba as outras sessões do
    // usuário, e a sessão da suíte (storageState) não pode cair no meio.
    const UI = { login: "ui-e2e", senha: "senha-ui-12345" };
    const criado = await request.post("/api/usuarios", {
      data: { login: UI.login, nome: "Pessoa da UI", papel: "contador", senha: UI.senha },
    });
    expect(criado.status(), await criado.text()).toBe(200);

    const ctx = await browser.newContext({ baseURL, storageState: { cookies: [], origins: [] } });
    const page = await ctx.newPage();
    await page.goto("/");
    await page.getByLabel("Login").fill(UI.login);
    await page.getByLabel("Senha").fill(UI.senha);
    await page.getByRole("button", { name: "Entrar" }).click();
    await expect(page.getByRole("heading", { name: "Painel", level: 1 })).toBeVisible();
    // Contador não vê o menu de usuários.
    await expect(page.getByRole("link", { name: /Usuários/ })).toHaveCount(0);

    await page.goto("/minha-conta");
    await expect(page.getByRole("heading", { name: "Minha conta", level: 1 })).toBeVisible();
    await page.locator('input[name="senhaAtual"]').fill("errada");
    await page.locator('input[name="novaSenha"]').fill("ui-nova-senha-1");
    await page.locator('input[name="confirmacao"]').fill("ui-nova-senha-1");
    await page.getByRole("button", { name: "Trocar senha" }).click();
    await expect(page.getByRole("alert")).toContainText("senha atual não confere");

    await page.locator('input[name="senhaAtual"]').fill(UI.senha);
    await page.getByRole("button", { name: "Trocar senha" }).click();
    await expect(page.getByText("✓ Senha trocada")).toBeVisible();

    const antiga = await logar(baseURL, UI.login, UI.senha);
    expect(antiga.status).toBe(401);
    const nova = await logar(baseURL, UI.login, "ui-nova-senha-1");
    expect(nova.status).toBe(200);
    await antiga.contexto.dispose();
    await nova.contexto.dispose();
    await ctx.close();
  });
});
