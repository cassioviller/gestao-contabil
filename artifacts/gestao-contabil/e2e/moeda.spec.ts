import { test, expect } from "@playwright/test";

// Regressão do bug mais caro do sistema: o honorário era exibido cru ("350.00")
// e, ao salvar o formulário sem mexer nele, o parse pt-BR removia o ponto e
// gravava 35000. Hoje tudo passa por `paraDecimalAPI`/`formatarNumeroBR`.
const EMPRESA = "Moeda LTDA";

test("reeditar o cliente sem tocar no honorário mantém o valor", async ({ page, request }) => {
  const criado = await request.post("/api/clientes", {
    data: { razaoSocial: EMPRESA, valorHonorario: "350.00" },
  });
  expect(criado.status(), await criado.text()).toBe(200);
  const { id } = await criado.json();

  await page.goto("/clientes");
  await page
    .locator("tbody tr")
    .filter({ hasText: EMPRESA })
    .getByRole("button", { name: "Editar" })
    .click();

  // O campo mostra o valor em pt-BR, não o decimal do banco.
  await expect(page.locator('input[name="valorHonorario"]')).toHaveValue("350,00");

  await page.locator('input[name="email"]').fill("financeiro@moeda.com.br");
  await page.getByRole("button", { name: "Salvar" }).click();
  await expect(page.getByRole("cell", { name: EMPRESA })).toBeVisible();

  const lista = await (await request.get("/api/clientes")).json();
  const cliente = lista.find((c: { id: number }) => c.id === id);
  expect(cliente.valorHonorario).toBe("350.00");
  expect(cliente.email).toBe("financeiro@moeda.com.br");
});

test("valores digitados em pt-BR, com milhar, persistem e voltam formatados", async ({
  page,
  request,
}) => {
  const criado = await request.post("/api/clientes", { data: { razaoSocial: "Milhar LTDA" } });
  const { id } = await criado.json();

  await page.goto("/cadastro");
  const linha = page
    .locator("tbody tr")
    .filter({ has: page.locator('input[value="Milhar LTDA"]') });
  await linha.locator('input[name="valorHonorario"]').fill("1.234,56");
  await linha.locator('input[name="valorHonorario"]').press("Enter");
  await expect(page.getByText("✓ salvo")).toBeVisible();

  const lista = await (await request.get("/api/clientes")).json();
  expect(lista.find((c: { id: number }) => c.id === id).valorHonorario).toBe("1234.56");

  await page.reload();
  const recarregada = page
    .locator("tbody tr")
    .filter({ has: page.locator('input[value="Milhar LTDA"]') });
  await expect(recarregada.locator('input[name="valorHonorario"]')).toHaveValue("1.234,56");

  // Sair do campo sem alterar não dispara gravação.
  const chamadas: string[] = [];
  page.on("request", (r) => {
    if (r.method() === "PATCH" && r.url().includes(`/api/clientes/${id}`)) chamadas.push(r.url());
  });
  await recarregada.locator('input[name="valorHonorario"]').focus();
  await recarregada.locator('input[name="valorHonorario"]').blur();
  await page.waitForTimeout(300);
  expect(chamadas).toEqual([]);
});

test("a API responde 409 para nome de obrigação repetido, não 500", async ({ request }) => {
  const nome = "Obrigação Repetida";
  const primeira = await request.post("/api/tipos", { data: { nome } });
  expect(primeira.status()).toBe(200);
  const segunda = await request.post("/api/tipos", { data: { nome } });
  expect(segunda.status()).toBe(409);
  expect((await segunda.json()).codigo).toBe("duplicado");
  await request.delete(`/api/tipos/${(await primeira.json()).id}`);
});

test("abrir o mesmo mês duas vezes responde 409 e não deixa o mês pela metade", async ({
  request,
}) => {
  const primeira = await request.post("/api/competencias", { data: { ano: 2094, mes: 1 } });
  expect(primeira.status()).toBe(200);
  const segunda = await request.post("/api/competencias", { data: { ano: 2094, mes: 1 } });
  expect(segunda.status()).toBe(409);
  const comps = await (await request.get("/api/competencias")).json();
  expect(comps.filter((c: { ano: number }) => c.ano === 2094)).toHaveLength(1);
  await request.delete(`/api/competencias/${(await primeira.json()).id}`);
});

test("POST /clientes com id e sem obrigações mantém os vínculos", async ({ request }) => {
  const tipo = await (
    await request.post("/api/tipos", { data: { nome: "Vínculo Mantido" } })
  ).json();
  const cliente = await (
    await request.post("/api/clientes", {
      data: { razaoSocial: "Vinculada LTDA", obrigacoes: [tipo.id] },
    })
  ).json();
  expect(cliente.obrigacoes).toEqual([tipo.id]);

  // Só o e-mail, sem `obrigacoes`: antes isto apagava todos os vínculos.
  const editado = await (
    await request.post("/api/clientes", {
      data: { id: cliente.id, razaoSocial: "Vinculada LTDA", email: "x@y.com" },
    })
  ).json();
  expect(editado.obrigacoes).toEqual([tipo.id]);

  // Lista vazia explícita desvincula de propósito.
  const limpo = await (
    await request.post("/api/clientes", {
      data: { id: cliente.id, razaoSocial: "Vinculada LTDA", obrigacoes: [] },
    })
  ).json();
  expect(limpo.obrigacoes).toEqual([]);

  await request.delete(`/api/clientes/${cliente.id}`);
  await request.delete(`/api/tipos/${tipo.id}`);
});

test("PATCH parcial no pagamento não zera os outros campos", async ({ request }) => {
  const cliente = await (
    await request.post("/api/clientes", {
      data: { razaoSocial: "Parcial LTDA", valorHonorario: "500.00" },
    })
  ).json();
  const comp = await (
    await request.post("/api/competencias", {
      data: { ano: 2093, mes: 2, somenteHonorarios: true },
    })
  ).json();
  const pagamentos = await (await request.get(`/api/competencias/${comp.id}/pagamentos`)).json();
  const meu = pagamentos.find((p: { clienteId: number }) => p.clienteId === cliente.id);
  expect(meu.valor).toBe("500.00");

  const r = await request.patch(`/api/pagamentos/${meu.id}`, { data: { status: "pago" } });
  expect(r.status()).toBe(200);
  const depois = await r.json();
  expect(depois.status).toBe("pago");
  expect(depois.valor).toBe("500.00");
  expect(depois.vencimento).toBe(meu.vencimento);

  await request.delete(`/api/competencias/${comp.id}`);
  await request.delete(`/api/clientes/${cliente.id}`);
});

test.afterAll(async ({ playwright }) => {
  const api = await playwright.request.newContext({ baseURL: "http://localhost:5179" });
  for (const c of await (await api.get("/api/clientes")).json()) {
    if ([EMPRESA, "Milhar LTDA"].includes(c.razaoSocial)) await api.delete(`/api/clientes/${c.id}`);
  }
  await api.dispose();
});
