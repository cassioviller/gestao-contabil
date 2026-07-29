# ContaFácil

_Gestão de obrigações contábeis: o contador acompanha, mês a mês (competência), o checklist de obrigações por cliente e a cobrança de honorários._

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/gestao-contabil run e2e` — run the Playwright e2e suite (builds API + frontend, boots both, runs tests)
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- DB schema (source of truth): `lib/db/src/schema/schema.ts`
- API contract (source of truth, hand-written): `lib/api-spec/openapi.yaml` → Orval generates `lib/api-zod` (Zod schemas) + `lib/api-client-react` (React Query hooks)
- API server: `artifacts/api-server/src` — `app.ts` (middlewares), `routes/*` (one file per resource), `middlewares/error-handler.ts`, `lib/http.ts` (`HttpError`)
- Frontend: `artifacts/gestao-contabil/src` — `pages/*` (one per screen), `components/MenuLateral.tsx` (nav)
- e2e tests: `artifacts/gestao-contabil/e2e/` (`journey` = full flow, `smoke` = per-page, `api` = validation), config in `playwright.config.ts`

## Architecture decisions

- API request validation reuses the generated `@workspace/api-zod` schemas (`*Body`/`*Params`) — single source of truth with the OpenAPI contract. `*Params` use `zod.coerce.number()`, which rejects non-numeric ids (no silent `NaN`).
- Errors flow through one central handler (`middlewares/error-handler.ts`): `ZodError`→400, `HttpError`→its status, malformed JSON→400, else→500. Express 5 auto-forwards async rejections, so route handlers don't need try/catch.
- Frontend talks to the API at the relative path `/api`; `vite.config.ts` proxies `/api` → API server only when `API_PROXY_TARGET` is set (dev/e2e). Production expects a reverse proxy fronting both.

## Product

Telas: **Painel** (dashboard), **Clientes** (cadastro + obrigações vinculadas), **Tipos de obrigação** (catálogo), **Competências** (abre o mês → gera checklist + pagamentos de todos os clientes ativos), **Checklist** (status por cliente × obrigação), **Pagamentos** (honorários do mês), **Pendências** (atrasados + cobrança via WhatsApp).

## User preferences

- Não reescrever/“desfazer” arquivos de configuração sensíveis (ex.: `pnpm-workspace.yaml`, qualquer `*.nix`). Atenção: `pnpm add` reformata o `pnpm-workspace.yaml` e apaga o bloco de segurança `minimumReleaseAge` — preferir editar `package.json` + `pnpm install`, ou restaurar o yaml depois (`git checkout pnpm-workspace.yaml`).

## Gotchas

- `vite.config.ts` exige as envs `PORT` e `BASE_PATH` (lança erro se faltarem) — já setadas pelo `playwright.config.ts` na suíte e2e.
- e2e usa o Chromium do Nix do Replit via `REPLIT_PLAYWRIGHT_CHROMIUM_EXECUTABLE` (o Chromium baixado pelo `playwright install` falta libs de sistema).
- `e2e/global-setup.ts` **trunca o DB** (`DATABASE_URL`) antes da run — não apontar para um banco com dados reais.
- A tela de Pagamentos serve o **build** (vite preview); rode `e2e` (que rebuilda) após editar o frontend, não só `playwright test`.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
