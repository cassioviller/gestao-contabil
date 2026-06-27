---
name: ContaFácil stack
description: Key decisions and gotchas for the ContaFácil gestão contábil app migration
---

## Stack layout
- Frontend: `artifacts/gestao-contabil` — Vite + React, wouter router, TanStack Query, Tailwind v4, previewPath `/`
- API: `artifacts/api-server` — Express 5, port from `PORT` env, routes mounted at `/api/*`
- DB: `lib/db` — Drizzle ORM + PostgreSQL, schema at `lib/db/src/schema/schema.ts`
- Codegen: `lib/api-spec/openapi.yaml` → `pnpm --filter @workspace/api-spec run codegen`

## Critical gotcha: db must be compiled before api-server typecheck
`lib/db` has `composite: true` in tsconfig. API server uses project references.
Run `pnpm tsc --build lib/db/tsconfig.json` before `pnpm --filter @workspace/api-server run typecheck`.
The `dev` script in api-server runs `pnpm run build` which handles this automatically.

**Why:** db package exports `.ts` source directly; TS project references need compiled declarations.

## DB schema tables
clientes, tiposObrigacao, clienteObrigacoes, competencias, checklistItens, pagamentos, configuracoes, cobrancas
Enums: status_item (pendente/feito/nao_aplica), status_pagamento (pendente/pago/isento)

## API routes
All mounted under `/api`:
- `/painel` — dashboard summary
- `/clientes` — CRUD
- `/tipos` — tipos de obrigação CRUD
- `/competencias` — CRUD + auto-generates checklist+pagamentos on POST
- `/competencias/:id/checklist` — checklist items
- `/competencias/:id/pagamentos` — payments
- `/checklist/:id/status|vencimento` — PATCH
- `/pagamentos/:id` — PATCH
- `/pendencias` — overdue items + cobrança via WhatsApp
- `/configuracoes/:chave` — GET/PUT key-value store

## Frontend pages
Painel, Clientes (with search + modal form), Tipos, Competencias, CompetenciaChecklist (matrix grid), CompetenciaPagamentos, Pendencias (with WhatsApp link generation)

## Utility libs
- `src/lib/formato.ts` — MESES, nomeMes, rotuloCompetencia, formatarMoeda, formatarData
- `src/lib/whatsapp.ts` — normalizarTelefone, montarMensagem, linkWhatsapp, MODELO_WHATSAPP_PADRAO
