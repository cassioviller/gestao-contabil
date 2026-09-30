import { test as setup, expect } from "@playwright/test";
import { CONTA_E2E } from "./global-setup";

export const ESTADO_AUTENTICADO = "e2e/.auth/e2e.json";

/**
 * Roda antes de todo o resto (projeto `setup` no playwright.config) e guarda o
 * cookie de sessão em disco. Sem isso cada spec precisaria passar pela tela de
 * login antes do que realmente quer testar.
 *
 * O login vai pela API, e não pela tela: é o caminho mais curto e não deixa a
 * suíte inteira refém de um botão da tela de login.
 */
setup("autentica a conta de teste", async ({ request }) => {
  const resposta = await request.post("/api/auth/entrar", {
    data: { login: CONTA_E2E.login, senha: CONTA_E2E.senha },
  });
  expect(resposta.status(), await resposta.text()).toBe(200);

  await request.storageState({ path: ESTADO_AUTENTICADO });
});
