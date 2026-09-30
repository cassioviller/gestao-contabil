import { defineConfig, devices } from "@playwright/test";

// Ports used only by the e2e run. The Vite preview server proxies `/api` to the
// API server so the browser talks to a single origin.
const WEB_PORT = 5179;
const API_PORT = 5180;
const BASE_URL = `http://localhost:${WEB_PORT}`;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  timeout: 30_000,
  globalSetup: "./e2e/global-setup.ts",

  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },

  projects: [
    {
      // Abre a sessão uma vez e grava o cookie; todo o resto herda o estado.
      name: "setup",
      testMatch: /auth\.setup\.ts/,
    },
    {
      name: "chromium",
      dependencies: ["setup"],
      use: {
        ...devices["Desktop Chrome"],
        // A API responde 401 sem sessão, então os testes começam já logados.
        // Quem precisa testar o não-logado abre um contexto próprio.
        storageState: "e2e/.auth/e2e.json",
        // On Replit the downloaded Chromium lacks system libs; use the
        // Nix-provided browser instead when available.
        launchOptions: process.env.REPLIT_PLAYWRIGHT_CHROMIUM_EXECUTABLE
          ? { executablePath: process.env.REPLIT_PLAYWRIGHT_CHROMIUM_EXECUTABLE }
          : {},
      },
    },
  ],

  webServer: [
    {
      // API server. Reads PORT; dist is already built by `pnpm --filter
      // @workspace/api-server build`, which the e2e script runs first.
      command: "node ../api-server/dist/index.mjs",
      env: { PORT: String(API_PORT) },
      url: `http://localhost:${API_PORT}/api/healthz`,
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
    {
      // Frontend. NODE_ENV=production skips the Replit-only Vite plugins;
      // API_PROXY_TARGET enables the `/api` proxy added in vite.config.ts.
      command: "pnpm exec vite preview --config vite.config.ts",
      env: {
        PORT: String(WEB_PORT),
        BASE_PATH: "/",
        NODE_ENV: "production",
        API_PROXY_TARGET: `http://localhost:${API_PORT}`,
      },
      url: BASE_URL,
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
  ],
});
