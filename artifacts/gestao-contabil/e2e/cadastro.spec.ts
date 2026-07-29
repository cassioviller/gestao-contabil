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

  // Senhas nascem mascaradas; revelar para poder conferir o valor digitado.
  await page.getByRole("button", { name: /Mostrar senhas/ }).click();

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
  await page.getByRole("button", { name: /Mostrar senhas/ }).click();
  const recarregada = page
    .locator("tbody tr")
    .filter({ has: page.locator(`input[value="${EMPRESA}"]`) });

  for (const [campo, valor] of Object.entries(valores)) {
    await expect(recarregada.locator(`input[name="${campo}"]`)).toHaveValue(valor);
  }

  await expect(recarregada.locator('select[name="regime"]')).toHaveValue("lucro_presumido");

  // Procuração vencida fica destacada em vermelho.
  await expect(recarregada.locator('input[name="procuracaoVencimento"]')).toHaveClass(/text-red-600/);
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
  expect(cores.fundo).toBe("oklch(0.205 0 0)"); // neutral-900
  expect(cores.texto).toMatch(/rgb\(255, 255, 255\)|oklch\(1 0 0\)/); // branco

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
