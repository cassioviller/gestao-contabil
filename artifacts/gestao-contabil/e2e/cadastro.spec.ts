import { test, expect } from "@playwright/test";

// Planilha de dados cadastrais: edição célula a célula precisa persistir no
// banco (PATCH /api/clientes/:id) e sobreviver a um reload.
const EMPRESA = "Empresa Cadastro LTDA";

test("edita células da planilha e os valores persistem após reload", async ({ page, request }) => {
  await request.post("/api/clientes", { data: { razaoSocial: EMPRESA } });

  await page.goto("/cadastro");
  await expect(page.getByRole("heading", { name: "Dados cadastrais", level: 1 })).toBeVisible();

  const linha = page.locator("tbody tr").filter({ has: page.locator(`input[value="${EMPRESA}"]`) });
  await expect(linha).toHaveCount(1);

  const valores: Record<string, string> = {
    cnpj: "12.345.678/0001-99",
    cnaePrincipal: "6920-6/01",
    inscricaoMunicipal: "987654",
    socioNome: "Maria da Silva",
    socioCpf: "123.456.789-00",
    senhaGov: "gov-secreta",
    contatoNome: "Maria (financeiro)",
    email: "contato@empresa.com.br",
    senhaNfse: "nfse-secreta",
  };

  for (const [campo, valor] of Object.entries(valores)) {
    await linha.locator(`input[name="${campo}"]`).fill(valor);
    await linha.locator(`input[name="${campo}"]`).press("Enter"); // Enter → blur → salva
  }
  await linha.locator('input[name="procuracaoVencimento"]').fill("2020-01-31");
  await linha.locator('input[name="procuracaoVencimento"]').press("Enter");
  await linha.locator('select[name="regime"]').selectOption("lucro_presumido");

  await expect(page.getByText("✓ salvo")).toBeVisible();

  // Reload: os valores vêm do banco, não do estado local.
  await page.reload();
  const recarregada = page
    .locator("tbody tr")
    .filter({ has: page.locator(`input[value="${EMPRESA}"]`) });

  // As senhas não vêm na listagem (só "tem senha"); ficam mascaradas até o
  // clique em revelar, que é um pedido à API registrado na auditoria.
  const senhas = ["senhaGov", "senhaNfse"];
  for (const [campo, valor] of Object.entries(valores)) {
    if (senhas.includes(campo)) continue;
    await expect(recarregada.locator(`input[name="${campo}"]`)).toHaveValue(valor);
  }
  await expect(recarregada.locator('input[name="senhaGov"]')).toHaveAttribute("type", "password");
  await expect(recarregada.locator('input[name="senhaGov"]')).toHaveValue("");
  await recarregada.locator('button[title="Revelar senha gov.br"]').click();
  await expect(recarregada.locator('input[name="senhaGov"]')).toHaveAttribute("type", "text");
  await expect(recarregada.locator('input[name="senhaGov"]')).toHaveValue(valores.senhaGov);
  await expect(recarregada.locator('input[name="senhaNfse"]')).toHaveValue(valores.senhaNfse);

  // Editar a senha revelada grava a nova e ela volta cifrada.
  await recarregada.locator('input[name="senhaGov"]').fill("gov-nova");
  await recarregada.locator('input[name="senhaGov"]').press("Enter");
  await expect(page.getByText("✓ salvo")).toBeVisible();

  // A API nunca devolve a senha em claro na listagem, e no banco ela está cifrada.
  const lista = (await (await request.get("/api/clientes")).json()) as Array<Record<string, unknown>>;
  const cliente = lista.find((c) => c.razaoSocial === EMPRESA)!;
  expect(cliente.temSenhaGov).toBe(true);
  expect(cliente.temSenhaNfse).toBe(true);
  expect("senhaGov" in cliente).toBe(false);
  expect(JSON.stringify(lista)).not.toContain("gov-nova");
  const segredos = await (await request.get(`/api/clientes/${cliente.id}/segredos`)).json();
  expect(segredos).toEqual({ senhaGov: "gov-nova", senhaNfse: valores.senhaNfse });

  await expect(recarregada.locator('select[name="regime"]')).toHaveValue("lucro_presumido");

  // Procuração vencida fica destacada em vermelho.
  await expect(recarregada.locator('input[name="procuracaoVencimento"]')).toHaveClass(/text-red-600/);
});

test("a planilha é sempre clara: fundo branco e letra preta, mesmo no tema escuro", async ({
  browser,
}) => {
  // Tema escuro forçado: é nele que um resquício de estilo escuro apareceria.
  const ctx = await browser.newContext({ colorScheme: "dark" });
  const page = await ctx.newPage();
  await page.goto("/cadastro");

  const BRANCO = "rgb(255, 255, 255)";
  const PRETO = "rgb(0, 0, 0)";

  const raiz = page.locator('[data-tela="cadastro"]');
  const cores = await raiz.evaluate((el) => {
    const s = getComputedStyle(el);
    return { fundo: s.backgroundColor, texto: s.color };
  });
  expect(cores.fundo).toBe(BRANCO);
  expect(cores.texto).toBe(PRETO);

  // Cabeçalho da tabela e células herdam o mesmo par.
  const th = page.getByRole("columnheader", { name: "CNPJ", exact: true });
  expect(await th.evaluate((el) => getComputedStyle(el).color)).toBe(PRETO);

  const celula = page.locator('input[name="cnpj"]').first();
  if (await celula.count()) {
    expect(await celula.evaluate((el) => getComputedStyle(el).color)).toBe(PRETO);
  }

  // O select de regime não pode voltar a ser texto claro sobre fundo claro.
  const select = page.locator('select[name="regime"]').first();
  if (await select.count()) {
    const c = await select.evaluate((el) => {
      const s = getComputedStyle(el);
      return { fundo: s.backgroundColor, texto: s.color };
    });
    expect(c.fundo).toBe(BRANCO);
    expect(c.texto).toBe(PRETO);
  }

  await ctx.close();
});

test("regime tributário oferece as quatro opções e só aceita valor da lista", async ({
  page,
  request,
}) => {
  await page.goto("/cadastro");
  const opcoes = page.locator('select[name="regime"]').first().locator("option");
  await expect(opcoes).toHaveText(["—", "Simples Nacional", "MEI", "Lucro Presumido", "Lucro Real"]);

  // O select precisa ter fundo próprio: com `bg-transparent` a lista suspensa
  // sai branca e o texto claro fica ilegível.
  const cores = await page
    .locator('select[name="regime"]')
    .first()
    .evaluate((el) => {
      const s = getComputedStyle(el);
      return { fundo: s.backgroundColor, texto: s.color };
    });
  expect(cores.fundo).not.toBe("rgba(0, 0, 0, 0)"); // não pode ser transparente
  expect(cores.fundo).toBe("rgb(255, 255, 255)"); // branco
  expect(cores.texto).toBe("rgb(0, 0, 0)"); // preto

  const criado = await request.post("/api/clientes", { data: { razaoSocial: "Regime LTDA" } });
  const { id } = await criado.json();
  const r = await request.patch(`/api/clientes/${id}`, { data: { regime: "lucro_inventado" } });
  expect(r.status()).toBe(400);
});

test("a planilha expõe todas as colunas cadastrais pedidas", async ({ page }) => {
  await page.goto("/cadastro");
  for (const rotulo of [
    "CNPJ",
    "CNAE principal",
    "Regime tributário",
    "Inscr. municipal",
    "Sócio principal",
    "CPF do sócio",
    "Senha gov.br",
    "Vencimento da procuração",
    "Honorário (R$)",
    "Contato (WhatsApp)",
    "E-mail de contato",
    "Senha portal NFS-e",
  ]) {
    await expect(page.getByRole("columnheader", { name: rotulo, exact: true })).toBeVisible();
  }
});
