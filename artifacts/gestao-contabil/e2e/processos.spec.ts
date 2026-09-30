import { test, expect } from "@playwright/test";

// Processos avulsos por cliente: criar, montar o checklist, marcar o que foi
// feito e concluir. Tudo contra API + banco reais.
const EMPRESA = "Processo Cliente LTDA";
const TIPO = "Troca de titularidade";

test("cria processo, monta checklist e acompanha o progresso", async ({ page, request }) => {
  await request.post("/api/clientes", { data: { razaoSocial: EMPRESA } });

  await page.goto("/processos");
  await expect(page.getByRole("heading", { name: "Processos", level: 1 })).toBeVisible();

  // --- criar ---
  await page.getByRole("button", { name: "+ Novo processo" }).click();
  await page.locator('select[name="clienteId"]').selectOption({ label: EMPRESA });
  await page.locator('input[name="tipo"]').fill(TIPO);
  await page.locator('input[name="titulo"]').fill("sócio João sai, entra Maria");
  await page.locator('input[name="orgao"]').fill("JUCESP");
  await page.getByRole("button", { name: "Criar processo" }).click();

  const linha = page.locator("tbody tr").filter({ hasText: EMPRESA });
  await expect(linha).toHaveCount(1);
  await expect(linha).toContainText(TIPO);
  await expect(linha).toContainText("sem etapas");

  // --- checklist ---
  await linha.getByRole("link", { name: "Abrir" }).click();
  await expect(page.getByRole("heading", { name: TIPO, level: 1 })).toBeVisible();

  const etapas = [
    "Pegar contrato social atualizado",
    "Protocolar alteração na JUCESP",
    "Atualizar cadastro na Receita",
  ];
  for (const e of etapas) {
    await page.locator('input[name="novaEtapa"]').fill(e);
    await page.getByRole("button", { name: "Adicionar" }).click();
    await expect(page.getByRole("checkbox", { name: e })).toBeVisible();
  }
  await expect(page.getByText("0 de 3 etapa(s) concluída(s)")).toBeVisible();

  // --- marcar duas como feitas ---
  // `.click()` + `toBeChecked()` em vez de `.check()`: o checkbox é controlado e
  // o React recompõe logo após o clique, o que faz o `.check()` ler o estado cedo demais.
  await page.getByRole("checkbox", { name: etapas[0] }).click();
  await expect(page.getByRole("checkbox", { name: etapas[0] })).toBeChecked();
  await page.getByRole("checkbox", { name: etapas[1] }).click();
  await expect(page.getByRole("checkbox", { name: etapas[1] })).toBeChecked();
  await expect(page.getByText("2 de 3 etapa(s) concluída(s)")).toBeVisible();
  await expect(page.getByText("67%")).toBeVisible();

  // --- sobrevive ao reload (veio do banco, não do estado local) ---
  await page.reload();
  await expect(page.getByRole("checkbox", { name: etapas[0] })).toBeChecked();
  await expect(page.getByRole("checkbox", { name: etapas[2] })).not.toBeChecked();
  await expect(page.getByText("2 de 3 etapa(s) concluída(s)")).toBeVisible();

  // --- concluir o processo ---
  await page.locator("select").filter({ hasText: "Em andamento" }).selectOption("concluido");
  await expect(page.getByText("Concluído").first()).toBeVisible();

  // --- o progresso aparece na listagem ---
  await page.getByRole("link", { name: "← Processos" }).click();
  const listada = page.locator("tbody tr").filter({ hasText: EMPRESA });
  await expect(listada).toContainText("2/3");
});

test("filtra processos por status", async ({ page, request }) => {
  // Cria os próprios dados para não depender da ordem dos testes.
  const criado = await request.post("/api/clientes", { data: { razaoSocial: "Filtro LTDA" } });
  const { id: clienteId } = await criado.json();
  await request.post("/api/processos", { data: { clienteId, tipo: "Processo em aberto" } });
  await request.post("/api/processos", {
    data: { clienteId, tipo: "Processo encerrado", status: "concluido" },
  });

  await page.goto("/processos");
  const aberto = page.locator("tbody tr").filter({ hasText: "Processo em aberto" });
  const encerrado = page.locator("tbody tr").filter({ hasText: "Processo encerrado" });

  await page.getByRole("button", { name: "Aberto", exact: true }).click();
  await expect(aberto).toHaveCount(1);
  await expect(encerrado).toHaveCount(0);

  await page.getByRole("button", { name: "Concluído", exact: true }).click();
  await expect(aberto).toHaveCount(0);
  await expect(encerrado).toHaveCount(1);
});

test("falha ao salvar vira aviso na tela, não página de erro", async ({ page, request }) => {
  const c = await request.post("/api/clientes", { data: { razaoSocial: "Falha LTDA" } });
  const { id: clienteId } = await c.json();

  const quebrou: string[] = [];
  page.on("pageerror", (e) => quebrou.push(String(e)));

  await page.goto("/processos");
  // Simula a API fora do ar (foi o que aconteceu com o servidor no bundle antigo).
  await page.route("**/api/processos", (rota) =>
    rota.request().method() === "POST"
      ? rota.fulfill({ status: 500, body: "{}" })
      : rota.continue(),
  );

  await page.getByRole("button", { name: "+ Novo processo" }).click();
  await page.locator('select[name="clienteId"]').selectOption(String(clienteId));
  await page.locator('input[name="tipo"]').fill("Vai falhar");
  await page.getByRole("button", { name: "Criar processo" }).click();

  await expect(page.getByRole("alert")).toContainText(/Não foi possível salvar/);
  // O formulário continua de pé — nada de tela branca ou overlay de erro.
  await expect(page.getByRole("heading", { name: "Novo processo" })).toBeVisible();
  expect(quebrou, `erros não tratados:\n${quebrou.join("\n")}`).toEqual([]);
});

test.describe("validação da API de processos", () => {
  test("processo sem cliente → 400", async ({ request }) => {
    const r = await request.post("/api/processos", { data: { tipo: "Sem cliente" } });
    expect(r.status()).toBe(400);
  });

  test("processo com cliente inexistente → 400", async ({ request }) => {
    const r = await request.post("/api/processos", { data: { clienteId: 999999, tipo: "X" } });
    expect(r.status()).toBe(400);
  });

  test("etapa em processo inexistente → 404", async ({ request }) => {
    const r = await request.post("/api/processos/999999/etapas", { data: { descricao: "X" } });
    expect(r.status()).toBe(404);
  });

  test("status inválido no filtro → 400", async ({ request }) => {
    const r = await request.get("/api/processos?status=inventado");
    expect(r.status()).toBe(400);
  });
});
