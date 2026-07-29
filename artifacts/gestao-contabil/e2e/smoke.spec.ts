import { test, expect, type Page } from "@playwright/test";

// Lightweight smoke tests: each top-level page must render its heading, show the
// sidebar, and raise no uncaught client error. Data-agnostic — they pass with an
// empty or populated DB.
const PAGINAS = [
  { rota: "/", heading: "Painel" },
  { rota: "/clientes", heading: "Clientes" },
  { rota: "/cadastro", heading: "Dados cadastrais" },
  { rota: "/senhas", heading: "Senhas" },
  { rota: "/pedidos", heading: "Pedidos" },
  { rota: "/processos", heading: "Processos" },
  { rota: "/competencias", heading: "Competências" },
  { rota: "/pendencias", heading: "Pendências" },
  { rota: "/tipos", heading: "Tipos de obrigação" },
];

// Network/resource noise (favicon 404 etc.) isn't an app error — ignore it.
const RUIDO = [/favicon/i, /Failed to load resource/i];

function semErros(page: Page): string[] {
  const erros: string[] = [];
  page.on("pageerror", (e) => erros.push(String(e)));
  page.on("console", (msg) => {
    if (msg.type() !== "error") return;
    const txt = msg.text();
    if (!RUIDO.some((r) => r.test(txt))) erros.push(txt);
  });
  return erros;
}

for (const { rota, heading } of PAGINAS) {
  test(`smoke: ${heading} (${rota}) carrega sem erro`, async ({ page }) => {
    const erros = semErros(page);
    await page.goto(rota);
    await expect(page.getByRole("heading", { name: heading, level: 1 })).toBeVisible();
    await expect(page.locator("aside nav")).toBeVisible();
    expect(erros, `erros de cliente em ${rota}:\n${erros.join("\n")}`).toEqual([]);
  });
}
