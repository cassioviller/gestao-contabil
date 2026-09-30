import { test, expect, type Page } from "@playwright/test";

// As telas do próprio escritório: perfil, gastos, quadro de funcionários,
// folha e férias. O que é do escritório tem `clienteId` nulo — o filtro
// "Do escritório" é o que separa isso dos registros dos clientes.
//
// As tabelas são editáveis célula a célula, então o conteúdo mora no `value`
// dos campos e não no texto da página: procurar por `input[name][value]` é o
// que enxerga uma linha (o mesmo padrão do spec de atrasos).

/** A linha da tabela que contém o campo `name` com aquele valor. */
function linhaCom(page: Page, campo: string, valor: string) {
  return page
    .locator("tbody tr")
    .filter({ has: page.locator(`input[name="${campo}"][value="${valor}"]`) });
}

test("perfil do escritório guarda os dados e aparece no menu", async ({ page }) => {
  await page.goto("/perfil");
  await expect(page.getByRole("heading", { name: "Perfil do escritório", level: 1 })).toBeVisible();

  await page.locator('input[name="nome"]').fill("AZ CONTABILIDADE");
  await page.locator('input[name="cnpj"]').fill("64.908.199/0001-33");
  await page.locator('input[name="responsavel"]').fill("Evânia Gonçalves Silva de Azevedo");
  await page.locator('input[name="telefone"]').fill("(11) 99999-0000");
  await page.getByRole("button", { name: "Salvar perfil" }).click();
  await expect(page.getByText("✓ salvo")).toBeVisible();

  // O menu lê o nome da sessão: sem a invalidação ele só mudaria no próximo
  // login. Aparece duas vezes na barra (título e rodapé), daí o `first`.
  await expect(page.locator("aside").getByText("AZ CONTABILIDADE").first()).toBeVisible();

  // Recarregar não pode perder nada.
  await page.reload();
  await expect(page.locator('input[name="cnpj"]')).toHaveValue("64.908.199/0001-33");
  await expect(page.locator('input[name="responsavel"]')).toHaveValue(
    "Evânia Gonçalves Silva de Azevedo",
  );
});

test("despesas do escritório somam o mês e separam o que falta pagar", async ({ page }) => {
  const hoje = new Date().toISOString().slice(0, 10);

  await page.goto("/despesas");
  await expect(page.getByRole("heading", { name: "Despesas", level: 1 })).toBeVisible();

  async function lancar(categoria: string, descricao: string, valor: string, pago: boolean) {
    await page.locator('input[aria-label="Data"]').fill(hoje);
    await page.locator('input[aria-label="Categoria"]').fill(categoria);
    await page.locator('input[aria-label="Descrição"]').fill(descricao);
    await page.locator('input[aria-label="Valor"]').fill(valor);
    await page.getByLabel("Já pago").setChecked(pago);
    await page.getByRole("button", { name: "+ Lançar gasto" }).click();
    await expect(linhaCom(page, "descricao", descricao)).toHaveCount(1);
  }

  await lancar("Aluguel", "Sala comercial", "1.800,00", true);
  await lancar("Sistemas e software", "Certificado digital", "200,00", false);

  // Total do mês soma as duas; "ainda a pagar" só a que não foi quitada.
  // `exact` porque o resumo por categoria repete os mesmos valores num texto maior.
  await expect(page.getByText("R$ 2.000,00", { exact: true })).toBeVisible();
  await expect(page.getByText("R$ 200,00", { exact: true })).toBeVisible();

  // Quitar o certificado zera o que falta pagar.
  await page.getByRole("button", { name: "Em aberto — Certificado digital" }).click();
  await expect(page.getByText("R$ 0,00", { exact: true })).toBeVisible();

  // O filtro "Só as não pagas" some com tudo que já foi quitado.
  await page.getByLabel("Só as não pagas").check();
  await expect(page.getByText("Nenhum gasto lançado neste mês.")).toBeVisible();
});

test("funcionário do escritório: cadastro, folha do mês e férias vencendo", async ({ page }) => {
  await page.goto("/funcionarios");
  await expect(page.getByRole("heading", { name: "Funcionários", level: 1 })).toBeVisible();

  await page.locator('input[aria-label="Nome"]').fill("Maria Auxiliadora");
  await page.locator('input[aria-label="Cargo"]').fill("Auxiliar contábil");
  await page.locator('input[aria-label="Admissão"]').fill("2024-03-01");
  await page.locator('input[aria-label="Salário"]').fill("2.400,00");
  await page.getByRole("button", { name: "+ Cadastrar" }).click();

  const linha = linhaCom(page, "cargo", "Auxiliar contábil");
  await expect(linha).toHaveCount(1);
  await expect(linha.getByText("Escritório")).toBeVisible();

  // Ficha completa: dados que não cabem na lista.
  await page.getByRole("link", { name: "Maria Auxiliadora" }).click();
  await expect(page.getByRole("heading", { name: "Maria Auxiliadora", level: 1 })).toBeVisible();
  await page.getByLabel("PIS").fill("123.45678.90-1");
  await page.getByLabel("PIS").blur();
  await expect(page.getByText("✓ salvo")).toBeVisible();

  // Um mês de folha. Sem base digitada, entra o salário do cadastro.
  await page.getByRole("button", { name: "+ Lançar mês" }).click();
  const pagoDoMes = page.getByRole("button", { name: /^Em aberto — / });
  await expect(pagoDoMes).toBeVisible();
  await pagoDoMes.click();
  await expect(page.getByRole("button", { name: /^Pago — / })).toBeVisible();

  // Período aquisitivo antigo e não gozado: tem que avisar que está vencendo.
  await page.getByLabel("Aquisitivo — início").fill("2024-03-01");
  await page.getByLabel("Aquisitivo — fim").fill("2025-02-28");
  await page.getByRole("button", { name: "+ Período" }).click();
  await expect(page.getByText("⚠ Vencendo")).toBeVisible();
  // O limite legal é um ano depois do fim do aquisitivo.
  await expect(page.getByText("28/02/2026")).toBeVisible();

  // Registrar o gozo tira o aviso.
  await page.getByLabel("Aquisitivo — início").fill("2025-03-01");
  await page.getByLabel("Aquisitivo — fim").fill("2026-02-28");
  await page.getByLabel("Gozo — início").fill("2026-07-01");
  await page.getByLabel("Gozo — fim").fill("2026-07-30");
  await page.getByRole("button", { name: "+ Período" }).click();
  await expect(page.getByText("Gozadas")).toBeVisible();
});

test("folha do mês cria o lançamento na primeira digitação", async ({ page, request }) => {
  const criado = await request.post("/api/funcionarios", {
    data: { nome: "João da Folha", salario: "3000.00" },
  });
  expect(criado.status(), await criado.text()).toBe(200);

  await page.goto("/folha");
  await expect(page.getByRole("heading", { name: "Folha do mês", level: 1 })).toBeVisible();

  const pago = page.getByRole("button", { name: /— folha de João da Folha$/ });
  // Ainda sem lançamento: o botão de pago fica inerte até existir a linha do mês.
  await expect(pago).toBeDisabled();

  // Digitar num campo já grava o mês inteiro (upsert por funcionário/ano/mês).
  await page.getByLabel("proventos de João da Folha").fill("500,00");
  await page.getByLabel("proventos de João da Folha").blur();
  await expect(page.getByText("✓ salvo")).toBeVisible();
  await expect(pago).toBeEnabled();

  await pago.click();
  await expect(page.getByRole("button", { name: "Pago — folha de João da Folha" })).toBeVisible();
});

test("gasto e funcionário de cliente não aparecem no filtro do escritório", async ({
  page,
  request,
}) => {
  const cliente = await request.post("/api/clientes", {
    data: { razaoSocial: "Padaria do Bairro LTDA" },
  });
  const { id: clienteId } = (await cliente.json()) as { id: number };

  await request.post("/api/despesas", {
    data: {
      clienteId,
      data: new Date().toISOString().slice(0, 10),
      categoria: "Energia",
      descricao: "Conta de luz da padaria",
      valor: "450.00",
    },
  });
  await request.post("/api/funcionarios", {
    data: { clienteId, nome: "Padeiro Contratado", cargo: "Padeiro", salario: "2000.00" },
  });

  await page.goto("/despesas");
  await expect(linhaCom(page, "descricao", "Conta de luz da padaria")).toHaveCount(0);
  await page.getByRole("button", { name: "Dos clientes" }).click();
  await expect(linhaCom(page, "descricao", "Conta de luz da padaria")).toHaveCount(1);
  // Dentro da linha: fora dela o nome também aparece no seletor de cliente do
  // formulário, num `option` invisível.
  await expect(
    linhaCom(page, "descricao", "Conta de luz da padaria").getByText("Padaria do Bairro LTDA"),
  ).toBeVisible();

  await page.goto("/funcionarios");
  await expect(page.getByRole("link", { name: "Padeiro Contratado" })).toHaveCount(0);
  await page.getByRole("button", { name: "Dos clientes" }).click();
  await expect(page.getByRole("link", { name: "Padeiro Contratado" })).toBeVisible();
});
