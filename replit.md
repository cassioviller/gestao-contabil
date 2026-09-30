# ContaFácil

_Gestão de obrigações contábeis: o contador acompanha, mês a mês (competência), o checklist de obrigações por cliente e a cobrança de honorários._

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/gestao-contabil run e2e` — run the Playwright e2e suite (builds API + frontend, boots both, runs tests)
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/db run seed-tipos` — repopula o catálogo padrão de tipos de obrigação (idempotente; rode depois de um `e2e`, que trunca o banco)
- `pnpm --filter @workspace/db run criar-conta -- --nome="AZ CONTABILIDADE" --login=az [--senha=x] [--cnpj=… --responsavel=… --crc=… --telefone=… --email=…]` — cria um escritório novo (conta + usuário + catálogo padrão). `--trocar-senha` redefine a senha de um login que já existe
- `pnpm --filter @workspace/db run import-clientes -- ./Pasta1.xlsx [--dry]` — importa o cadastro de empresas de uma planilha (colunas: Cód. | Razão Social | CNPJ | Inscr. Estadual | Envio). Pula CNPJ/código já existentes; `--dry` só mostra o que faria
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
- A tela de Tipos é uma **grade com gravação em lote**: as edições ficam num rascunho local (`rascunhos` por id) e só vão ao banco no "Salvar alterações", um POST por obrigação alterada. Voltar um campo ao valor original remove o rascunho — o contador de pendências reflete diferenças reais, não toques.
- `tipos_obrigacao.regimes` (array do enum `regime_tributario`, nulo = todos) restringe a obrigação a certos regimes. Isso filtra a lista de obrigações no cadastro do cliente, **não** a geração da competência: o vínculo explícito em `cliente_obrigacoes` prevalece. Obrigação já vinculada mas incompatível continua aparecendo marcada (com ⚠) — escondê-la faria o submit desvinculá-la sem querer.
- `tipos_obrigacao.periodicidade` (mensal/bimestral/trimestral/semestral/anual) + `mesReferencia` decidem em que meses a obrigação entra no checklist: a competência só gera item quando `(mes - mesReferencia)` é múltiplo do intervalo. Sem isso uma obrigação anual apareceria nos 12 meses.
- **Processos e Pedidos são a mesma tabela** (`processos.categoria`): mesma API, mesmo checklist, mesma tela (`Processos.tsx` recebe `categoria`; `Pedidos.tsx` é um wrapper). O vocabulário de cada aba vive em `TEXTOS` em `lib/processo.ts`.
- Ciclo da guia no checklist (`status_item`): **pendente → emitido → enviado → não se aplica** (clique na célula avança). Só `enviado` conta como concluída nos resumos; `emitido` aparece num contador próprio.
- Abrir competência aceita `somenteHonorarios: true` — gera só os pagamentos, sem checklist. É como se registram honorários de meses anteriores ao início do uso do sistema.
- **Depois de mexer em rotas da API, o servidor precisa ser reiniciado.** Reconstruir o bundle não basta: o processo Node já carregou o antigo na memória e devolve 404 nas rotas novas.
- Processos: tabelas `processos` + `processo_etapas`; rotas `routes/processos.ts` (`/api/processos`) e `routes/etapas.ts` (`/api/etapas/:id`). O detalhe faz atualização otimista no cache do React Query antes do PATCH — sem isso o checkbox (controlado) volta ao valor antigo até o refetch e o clique parece não funcionar.
- **Despesas, funcionários, folha e férias existem para o escritório e para os clientes na mesma tabela**: `cliente_id` nulo = do próprio escritório. O filtro `escopo` (`escritorio`/`clientes`/`todos`) das rotas é o que separa os dois; duplicar a estrutura dobraria o código sem ganho nenhum.
- Folha: `folha_lancamentos` tem índice único `(funcionário, ano, mês, tipo)`, e o POST é um upsert nele — a tela de Folha do mês grava na primeira digitação, sem precisar "abrir" o mês antes. `tipo` separa salário de 13º e de férias, que caem no mesmo mês.
- Férias: o banco guarda o período **aquisitivo** e o de **gozo**; `limiteGozo` (um ano depois do fim do aquisitivo) e `vencendo` são calculados na API, não no banco nem na tela — assim o aviso é o mesmo em qualquer lugar que liste férias.
- O perfil do escritório mora nas colunas de `contas` (`cnpj`, `responsavel`, `crc`, `telefone`, `email`, `endereco`). O PUT `/api/perfil` filtra pelo id da sessão, nunca por um id do corpo. Ao salvar, a tela invalida também a sessão — é dela que o menu tira o nome do escritório.
- Frontend: `artifacts/gestao-contabil/src` — `pages/*` (one per screen), `components/MenuLateral.tsx` (nav)
- e2e tests: `artifacts/gestao-contabil/e2e/` (`journey` = full flow, `smoke` = per-page, `api` = validation, `cadastro` = planilha editável, `processos` = processos + checklist, `pessoal` = perfil + despesas + funcionários + folha + férias, `multitenant` = isolamento entre contas), config in `playwright.config.ts`

## Architecture decisions

- API request validation reuses the generated `@workspace/api-zod` schemas (`*Body`/`*Params`) — single source of truth with the OpenAPI contract. `*Params` use `zod.coerce.number()`, which rejects non-numeric ids (no silent `NaN`).
- Errors flow through one central handler (`middlewares/error-handler.ts`): `ZodError`→400, `HttpError`→its status, malformed JSON→400, else→500. Express 5 auto-forwards async rejections, so route handlers don't need try/catch.
- Frontend talks to the API at the relative path `/api`; `vite.config.ts` proxies `/api` → API server only when `API_PROXY_TARGET` is set (dev/e2e). Production expects a reverse proxy fronting both.

## Product

Telas: **Painel** (dashboard), **Clientes** (cadastro + obrigações vinculadas), **Dados cadastrais** (`/cadastro` — planilha editável célula a célula com CNPJ, inscrições, sócio/CPF, senha gov.br, período da procuração, contato/WhatsApp/e-mail, senha do portal NFS-e; exporta CSV), **Tipos de obrigação** (catálogo), **Guias em atraso** (`/atrasos` — tabela `debitos`: o que a *empresa* deve ao fisco, com competência, vencimento, valor e situação em aberto/parcelado/pago. Não confundir com **Pendências**, que são as obrigações e honorários atrasados do *escritório*), **Senhas** (`/senhas` — uma linha por empresa × sistema/obrigação, com login e senha; tabela `credenciais`), **Processos** (`/processos` — processos avulsos por cliente: troca de titularidade, alteração de endereço…; cada um com prazo, protocolo e um checklist de etapas montado à mão em `/processos/:id`), **Funcionários** (`/funcionarios` — quadro do escritório e dos clientes; a ficha em `/funcionarios/:id` traz cadastro completo, folha mês a mês e férias), **Folha do mês** (`/folha` — uma linha por funcionário, editável célula a célula), **Despesas** (`/despesas` — gastos do escritório e dos clientes, com total do mês e o que falta pagar), **Perfil do escritório** (`/perfil` — razão social, CNPJ, contadora responsável, CRC, contato), **Competências** (abre o mês → gera checklist + pagamentos de todos os clientes ativos), **Checklist** (status por cliente × obrigação), **Pagamentos** (honorários do mês), **Pendências** (atrasados + cobrança via WhatsApp).

## User preferences

- Não reescrever/“desfazer” arquivos de configuração sensíveis (ex.: `pnpm-workspace.yaml`, qualquer `*.nix`). Atenção: `pnpm add` reformata o `pnpm-workspace.yaml` e apaga o bloco de segurança `minimumReleaseAge` — preferir editar `package.json` + `pnpm install`, ou restaurar o yaml depois (`git checkout pnpm-workspace.yaml`).

## Gotchas

- `vite.config.ts` exige as envs `PORT` e `BASE_PATH` (lança erro se faltarem) — já setadas pelo `playwright.config.ts` na suíte e2e.
- e2e usa o Chromium do Nix do Replit via `REPLIT_PLAYWRIGHT_CHROMIUM_EXECUTABLE` (o Chromium baixado pelo `playwright install` falta libs de sistema).
- `e2e/global-setup.ts` **trunca o DB** (`DATABASE_URL`) antes da run — não apontar para um banco com dados reais. Depois de rodar a suíte, `run seed-tipos` para repor o catálogo de obrigações.
- A tela de Pagamentos serve o **build** (vite preview); rode `e2e` (que rebuilda) após editar o frontend, não só `playwright test`.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
