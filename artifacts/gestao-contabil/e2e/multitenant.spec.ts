import { test, expect, request as apiRequest, type APIRequestContext } from "@playwright/test";
import { apagarCliente } from "./apoio";
import { CONTA_E2E, CONTA_VIZINHA } from "./global-setup";

/**
 * Contexto de rede sem nenhuma sessão. O `storageState` vazio é obrigatório:
 * `newContext` herda o `storageState` do playwright.config, e sem ele o
 * contexto "anônimo" sairia daqui já logado — o teste passaria por engano.
 */
async function contextoLimpo(baseURL: string | undefined): Promise<APIRequestContext> {
  return apiRequest.newContext({ baseURL, storageState: { cookies: [], origins: [] } });
}

async function logar(
  baseURL: string | undefined,
  conta: { login: string; senha: string },
): Promise<APIRequestContext> {
  const contexto = await contextoLimpo(baseURL);
  const r = await contexto.post("/api/auth/entrar", {
    data: { login: conta.login, senha: conta.senha },
  });
  expect(r.status(), await r.text()).toBe(200);
  return contexto;
}

// A promessa central do multitenant: dois escritórios no mesmo sistema, e
// nenhum enxerga (nem alcança) o dado do outro. Se algum filtro `conta_id`
// cair de uma rota, é aqui que aparece.
test.describe("isolamento entre contas", () => {
  test("sem sessão a API responde 401", async ({ baseURL }) => {
    const anonimo = await contextoLimpo(baseURL);
    try {
      expect((await anonimo.get("/api/clientes")).status()).toBe(401);
      expect((await anonimo.get("/api/painel")).status()).toBe(401);
      expect((await anonimo.get("/api/pendencias")).status()).toBe(401);
      expect((await anonimo.post("/api/tipos", { data: { nome: "X" } })).status()).toBe(401);
      // O health check fica de fora da porta — o deploy o consulta sem cookie.
      expect((await anonimo.get("/api/healthz")).status()).toBe(200);
    } finally {
      await anonimo.dispose();
    }
  });

  test("senha errada não abre sessão", async ({ baseURL }) => {
    const anonimo = await contextoLimpo(baseURL);
    try {
      const r = await anonimo.post("/api/auth/entrar", {
        data: { login: CONTA_E2E.login, senha: "senha-errada" },
      });
      expect(r.status()).toBe(401);
      expect((await anonimo.get("/api/clientes")).status()).toBe(401);
    } finally {
      await anonimo.dispose();
    }
  });

  test("o vizinho não vê nem altera o cliente da outra conta", async ({ request, baseURL }) => {
    // `request` já vem logado como CONTA_E2E (storageState do projeto).
    const criado = await request.post("/api/clientes", {
      data: { razaoSocial: "EMPRESA SÓ MINHA", obrigacoes: [] },
    });
    expect(criado.status()).toBe(200);
    const cliente = await criado.json();

    const vizinho = await logar(baseURL, CONTA_VIZINHA);
    try {
      // Não lista.
      const lista = await (await vizinho.get("/api/clientes")).json();
      expect(lista.map((c: { id: number }) => c.id)).not.toContain(cliente.id);

      // Não edita.
      const patch = await vizinho.patch(`/api/clientes/${cliente.id}`, {
        data: { razaoSocial: "INVADIDO" },
      });
      expect(patch.status()).toBe(404);

      // Não apaga: o DELETE é idempotente e responde 204, mas não pode ter
      // tirado nada — quem confirma isso é a leitura seguinte, pela conta dona.
      await vizinho.delete(`/api/clientes/${cliente.id}`);
    } finally {
      await vizinho.dispose();
    }

    const aindaMinha = await (await request.get("/api/clientes")).json();
    const encontrado = aindaMinha.find((c: { id: number }) => c.id === cliente.id);
    expect(encontrado, "o cliente sumiu depois do DELETE do vizinho").toBeTruthy();
    expect(encontrado.razaoSocial).toBe("EMPRESA SÓ MINHA");

    await apagarCliente(request, cliente.id);
  });

  test("cada conta tem o seu catálogo de obrigações", async ({ request, baseURL }) => {
    const criado = await request.post("/api/tipos", { data: { nome: "OBRIGAÇÃO EXCLUSIVA" } });
    expect(criado.status()).toBe(200);
    const tipo = await criado.json();

    const vizinho = await logar(baseURL, CONTA_VIZINHA);
    try {
      const tipos = await (await vizinho.get("/api/tipos")).json();
      expect(tipos.map((t: { nome: string }) => t.nome)).not.toContain("OBRIGAÇÃO EXCLUSIVA");

      // Mesmo nome na conta vizinha é permitido — o índice único é por conta.
      const mesmoNome = await vizinho.post("/api/tipos", { data: { nome: "OBRIGAÇÃO EXCLUSIVA" } });
      expect(mesmoNome.status()).toBe(200);
      await vizinho.delete(`/api/tipos/${(await mesmoNome.json()).id}`);
    } finally {
      await vizinho.dispose();
    }

    await request.delete(`/api/tipos/${tipo.id}`);
  });

  test("folha e despesas do vizinho ficam fora de alcance", async ({ request, baseURL }) => {
    const funcionario = await (
      await request.post("/api/funcionarios", { data: { nome: "FUNCIONÁRIO SÓ MEU" } })
    ).json();
    const despesa = await (
      await request.post("/api/despesas", {
        data: {
          data: "2026-01-10",
          categoria: "Aluguel",
          descricao: "GASTO SÓ MEU",
          valor: "100.00",
        },
      })
    ).json();

    const vizinho = await logar(baseURL, CONTA_VIZINHA);
    try {
      expect(await (await vizinho.get("/api/funcionarios")).json()).toEqual([]);
      expect(await (await vizinho.get("/api/despesas")).json()).toEqual([]);

      // A ficha e o PATCH pelo id direto também não passam.
      expect((await vizinho.get(`/api/funcionarios/${funcionario.id}`)).status()).toBe(404);
      expect(
        (await vizinho.patch(`/api/despesas/${despesa.id}`, { data: { valor: "1.00" } })).status(),
      ).toBe(404);

      // Nem dá para pendurar folha no funcionário da outra conta: o vínculo é
      // conferido antes de gravar, então isto é 400 e não um lançamento órfão.
      expect(
        (
          await vizinho.post("/api/folha", {
            data: { funcionarioId: funcionario.id, ano: 2026, mes: 1 },
          })
        ).status(),
      ).toBe(400);
      expect(
        (
          await vizinho.post("/api/ferias", {
            data: {
              funcionarioId: funcionario.id,
              aquisitivoInicio: "2025-01-01",
              aquisitivoFim: "2025-12-31",
            },
          })
        ).status(),
      ).toBe(400);
    } finally {
      await vizinho.dispose();
    }

    await request.delete(`/api/funcionarios/${funcionario.id}`);
    await request.delete(`/api/despesas/${despesa.id}`);
  });

  test("sair encerra a sessão de verdade", async ({ baseURL }) => {
    const contexto = await logar(baseURL, CONTA_E2E);
    try {
      expect((await contexto.get("/api/clientes")).status()).toBe(200);
      expect((await contexto.post("/api/auth/sair")).status()).toBe(204);
      expect((await contexto.get("/api/clientes")).status()).toBe(401);
    } finally {
      await contexto.dispose();
    }
  });
});
