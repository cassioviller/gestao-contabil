# ContaFácil

_Gestão de obrigações contábeis: o contador acompanha, mês a mês (competência), o checklist de obrigações por cliente e a cobrança de honorários._

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — builda e sobe a API (`PORT` obrigatória; `.env.example` usa 8080). No boot a API **aplica as migrations que faltam** (`garantirBanco`), com advisory lock para o autoscale.
- `pnpm run typecheck` — typecheck de todos os pacotes (`tsc --build` nas libs + `tsc --noEmit` nos artifacts)
- `pnpm run test` — testes unitários (Vitest) das libs: `lib/dominio` (regras de negócio) e `lib/db` (cifra)
- `pnpm run build` — typecheck + build de todos os pacotes
- `pnpm --filter @workspace/gestao-contabil run e2e` — suíte Playwright (builda API + front, sobe os dois, roda os testes). Exige `E2E_DATABASE_URL` apontando para um banco cujo nome contenha `test` ou `e2e`: **a suíte apaga todas as tabelas** desse banco.
- `pnpm --filter @workspace/api-spec run codegen` — regenera hooks e schemas Zod a partir do OpenAPI
- `pnpm --filter @workspace/db run generate -- --name=<nome>` — gera a migration SQL em `lib/db/drizzle` depois de editar `schema.ts` (**sempre** revise o SQL: nada de `DROP`/`RENAME` sem migração de dados). `run check` valida os snapshots; `run push` é só para experimentar num banco descartável.
- `pnpm --filter @workspace/db run criar-conta -- --nome="AZ CONTABILIDADE" --login=az [--senha=x] [--cnpj=… --responsavel=… --crc=… --telefone=… --email=…]` — cria um escritório novo (conta + usuário admin + catálogo padrão). `--trocar-senha` redefine a senha de um login que já existe. Num banco vazio, as variáveis `BOOTSTRAP_CONTA_NOME/LOGIN/SENHA` fazem o mesmo no primeiro boot da API.
- `pnpm --filter @workspace/db run seed-tipos [-- --conta=2]` — repõe o catálogo padrão de tipos de obrigação nas contas existentes (idempotente: só insere o que falta, não reordena nem sobrescreve)
- `pnpm --filter @workspace/db run import-clientes -- ./Pasta1.xlsx [--dry]` — importa o cadastro de empresas de uma planilha (colunas: Cód. | Razão Social | CNPJ | Inscr. Estadual | Envio). Pula CNPJ/código já existentes; `--dry` só mostra o que faria
- `pnpm --filter @workspace/db run migrar-multitenant` — converte um banco de antes do login (tem `clientes`, não tem `contas`); a API se recusa a subir num banco assim
- Env obrigatórias: `DATABASE_URL`, `PORT` e, em produção, `CHAVE_CIFRA` (32 bytes base64url — sem ela a API não sobe em `NODE_ENV=production`; fora de produção usa uma chave fixa e avisa no log). Todas as variáveis estão comentadas em `.env.example`.

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5 (helmet, express-rate-limit, pino)
- DB: PostgreSQL + Drizzle ORM, **migrations versionadas** em `lib/db/drizzle` (drizzle-kit)
- Validação: Zod, via os schemas gerados em `@workspace/api-zod`
- API codegen: Orval (a partir do OpenAPI)
- Build da API: esbuild, bundle **ESM** (`dist/index.mjs`) com a pasta `dist/drizzle` copiada junto
- Testes: Vitest (unitários) + Playwright (e2e)

## Where things live

- Regras de negócio puras (sem banco, sem React): `lib/dominio` (`@workspace/dominio`) — dinheiro pt-BR (`paraNumeroBR`, `paraDecimalAPI`, `formatarMoeda`), datas no fuso de Brasília (`hojeBR`, `mesAtualBR`, `somarMeses`), periodicidade e vencimento (`aplicaNoMes`, `calcularVencimento`, `vencido`), WhatsApp, férias, folha, CNPJ/CPF, CSV. API e front importam daqui; **não duplique essas regras** em `lib/formato.ts` nem em rotas.
- DB schema (fonte da verdade): `lib/db/src/schema/schema.ts`. Toda mudança nele vira uma migration (`run generate`); `0000_baseline.sql` é a estrutura de antes das migrations existirem.
- Boot do banco: `lib/db/src/instalacao.ts` (`garantirBanco`): marca a baseline em bancos criados pelo dump antigo, aplica as migrations, cria a primeira conta pelas `BOOTSTRAP_*`. `inserirCatalogoPadrao` é o único lugar que copia `TIPOS_PADRAO` (`lib/db/src/tipos-padrao.ts`, 28 obrigações com periodicidade, vencimento e regimes) para uma conta.
- Cifra em repouso: `lib/db/src/cifra.ts` (AES-256-GCM, formato `v1$iv$tag$dados`; `decifrar` devolve texto sem prefixo como está, para os valores gravados antes da cifra). `senha_gov`, `senha_nfse` e `credenciais.senha` são cifradas ao gravar; `run cifrar-segredos` converte o legado. A listagem de clientes/credenciais devolve só `temSenha*`; o valor sai por `GET /clientes/:id/segredos` e `GET /credenciais/:id/senha` (admin/contador), com linha em `auditoria` (`revelar_segredo`).
- Sessão: o cookie leva o token; `sessoes.token` guarda o SHA-256 (`hashToken`). Validade 30 dias e inatividade `SESSAO_INATIVIDADE_HORAS` (12). Trocar a senha derruba as outras sessões; `sair-de-todos` derruba todas. `tentativas_login` registra cada tentativa e trava o login após 10 falhas em 15 min (vale entre instâncias).
- Papéis (`usuarios.papel`): `admin` gerencia usuários (`/api/usuarios`, tela Usuários); `contador` opera e revela senhas; `auxiliar` opera sem revelar. `exigirPapel(...)` em `middlewares/autenticacao.ts`; a sessão (`/auth/eu`) traz `papel` e `usuarioId`, e o menu esconde o que o papel não alcança. Auditoria: `lib/auditoria.ts` (`auditar(req, {...})`), nunca com o valor de um segredo.
- Contrato da API (fonte da verdade, escrito à mão): `lib/api-spec/openapi.yaml` → Orval gera `lib/api-zod` (Zod) + `lib/api-client-react` (hooks React Query)
- API server: `artifacts/api-server/src` — `app.ts` (middlewares), `routes/*` (um arquivo por recurso), `middlewares/error-handler.ts`, `lib/http.ts` (`HttpError(status, mensagem, detalhes?, codigo?)`), `routes/health.ts` (`/api/healthz` e `/api/readyz`)
- Frontend: `artifacts/gestao-contabil/src` — `pages/*` (uma por tela), `components/MenuLateral.tsx` (nav), `lib/erros.ts` (`mensagemDeErro` lê `error`/`mensagem`/`issues` da API)
- e2e: `artifacts/gestao-contabil/e2e/` (`journey` = fluxo completo, `smoke` = por tela, `api` = validação, `moeda` = regressões de dinheiro/409, `cadastro` = planilha editável, `processos`/`pedidos` = processos + checklist, `pessoal` = perfil + despesas + funcionários + folha + férias, `multitenant` = isolamento entre contas), config em `playwright.config.ts`
- Não existe seed com dados reais no git. O catálogo padrão vem de `tipos-padrao.ts`; contas vêm de `criar-conta`/`BOOTSTRAP_*`.

## Regras do domínio (o que a tela e a API assumem)

- A tela de Tipos é uma **grade com gravação em lote**: as edições ficam num rascunho local (`rascunhos` por id) e só vão ao banco no "Salvar alterações", um POST por obrigação alterada. Voltar um campo ao valor original remove o rascunho.
- `tipos_obrigacao.regimes` (array do enum `regime_tributario`, nulo = todos) restringe a obrigação a certos regimes. Isso filtra a lista de obrigações no cadastro do cliente, **não** a geração da competência: o vínculo explícito em `cliente_obrigacoes` prevalece. Obrigação já vinculada mas incompatível continua aparecendo marcada (com ⚠).
- **Vínculo automático** (`tipos_obrigacao.vincular_automatico`, coluna "Auto" na grade): definir/trocar o regime de um cliente vincula as automáticas do regime dele (`lib/vinculos.ts`, chamado no PATCH de regime e no POST sem `obrigacoes`; o formulário de Clientes marca as caixas ao escolher o regime). **Só acrescenta**, nunca desvincula; uma lista `obrigacoes` explícita prevalece. `POST /tipos/vincular-automaticos` (botão na grade) põe a base inteira em dia. `tipos_obrigacao.ativo` (coluna "Ativa"): inativa não entra em mês novo nem é vinculada.
- `tipos_obrigacao.periodicidade` (mensal/bimestral/trimestral/semestral/anual) + `mesReferencia` decidem em que meses a obrigação entra no checklist (`aplicaNoMes` em `lib/dominio`). O vencimento é `calcularVencimento` (dia + offset de meses).
- Abrir competência é **uma transação**; o mesmo mês duas vezes devolve 409 `duplicado`. `POST /competencias/:id/sincronizar` gera os itens/pagamentos que faltam (cliente novo depois do mês aberto). `somenteHonorarios: true` gera só os pagamentos, sem checklist.
- **Processos e Pedidos são a mesma tabela** (`processos.categoria`): mesma API, mesmo checklist, mesma tela (`Processos.tsx` recebe `categoria`; `Pedidos.tsx` é um wrapper). O vocabulário de cada aba vive em `TEXTOS` em `lib/processo.ts`.
- Ciclo da guia no checklist (`status_item`): **pendente → emitido → enviado → não se aplica**. Só `enviado` conta como concluída; `emitido` aparece num contador próprio e em Pendências como "Emitida, não enviada".
- Dinheiro: a API troca `numeric` como string com ponto (`"1200.50"`); a tela mostra/aceita pt-BR (`1.200,50`). Converta **sempre** com `paraDecimalAPI`/`formatarNumeroBR` — a regra "um ponto e exatamente três dígitos = milhar" está em `lib/dominio/moeda.ts` com testes.
- Datas: "hoje" é `hojeBR()` (Brasília), na API e no front; cada conexão do pool roda `set time zone 'America/Sao_Paulo'`, então `current_date` no SQL também é Brasília.
- Processos: tabelas `processos` + `processo_etapas`; rotas `routes/processos.ts` e `routes/etapas.ts`. O detalhe faz atualização otimista no cache do React Query antes do PATCH.
- **Despesas, funcionários, folha e férias existem para o escritório e para os clientes na mesma tabela**: `cliente_id` nulo = do próprio escritório. O filtro `escopo` (`escritorio`/`clientes`/`todos`) separa os dois.
- Folha: `folha_lancamentos` tem índice único `(funcionário, ano, mês, tipo)`, e o POST é um upsert nele. `tipo` separa salário de 13º e de férias.
- Férias: o banco guarda o período **aquisitivo** e o de **gozo**; `limiteGozo`, `vencendo`, `vencida` e `situacao` são calculados por `comVencimento` (`lib/dominio/ferias.ts`).
- O perfil do escritório mora nas colunas de `contas`. O PUT `/api/perfil` filtra pelo id da sessão, nunca por um id do corpo.
- `PATCH /pagamentos/:id` é parcial: só os campos enviados mudam; `""` limpa (vira `null`). `POST /clientes` com `obrigacoes` omitido mantém os vínculos; `[]` limpa.

## Architecture decisions

- Validação de request reutiliza os schemas gerados em `@workspace/api-zod` (`*Body`/`*Params`) — fonte única com o contrato OpenAPI. `*Params` usa `zod.coerce.number()`.
- Erros passam por um handler central (`middlewares/error-handler.ts`): `ZodError`→400, `HttpError`→seu status, JSON malformado→400, corpo grande→413, erro do Postgres mapeado por código (`23505`→409 `duplicado`, `23503`→409, `22P02`/`22007`/`22003`→400), resto→500 sem vazar detalhe. Resposta sempre `{ error, codigo, ... }`; o front usa `mensagemDeErro`.
- Borda: `helmet` (CSP `default-src 'none'`, HSTS em produção), `trust proxy`, `x-request-id` propagado, JSON limitado a 256 kB, sem CORS (front e API no mesmo host). Login com rate limit por IP e por login (`LOGIN_TENTATIVAS_*`) e scrypt fictício quando o usuário não existe (tempo constante).
- Processo: `SIGTERM`/`SIGINT` fecham o servidor e o pool (10 s de limite); pool com `idleTimeout`, `connectionTimeout`, `statement_timeout` e listener de `error` (sem ele um cliente ocioso derrubado mata o processo).
- Migrations: só via `drizzle-kit generate` + revisão do SQL; a API aplica no boot sob `pg_advisory_lock(7140331)`; `scripts/post-merge.sh` roda `drizzle-kit check`.
- Frontend fala com a API no caminho relativo `/api`; `vite.config.ts` faz proxy `/api` → API só quando `API_PROXY_TARGET` está setada (dev/e2e). Produção espera um reverse proxy na frente dos dois.

## Product

Telas: **Painel** (dashboard), **Clientes** (cadastro + obrigações vinculadas), **Dados cadastrais** (`/cadastro` — planilha editável célula a célula com CNPJ, inscrições, sócio/CPF, senha gov.br, período da procuração, contato/WhatsApp/e-mail, senha do portal NFS-e; exporta CSV sem as senhas), **Tipos de obrigação** (catálogo), **Guias em atraso** (`/atrasos` — tabela `debitos`: o que a *empresa* deve ao fisco. Não confundir com **Pendências**, que são as obrigações e honorários atrasados do *escritório*), **Senhas** (`/senhas` — uma linha por empresa × sistema; tabela `credenciais`), **Processos** (`/processos` — processos avulsos por cliente com prazo, protocolo e checklist de etapas em `/processos/:id`), **Funcionários** (`/funcionarios`; ficha em `/funcionarios/:id` com folha mês a mês e férias), **Folha do mês** (`/folha`), **Despesas** (`/despesas`), **Perfil do escritório** (`/perfil`), **Usuários** (`/usuarios`, só admin — papéis, ativar/desativar, redefinir senha), **Minha conta** (`/minha-conta` — trocar senha, sair de todos os dispositivos), **Competências** (abre o mês → gera checklist + pagamentos de todos os clientes ativos), **Checklist** (status por cliente × obrigação), **Pagamentos** (honorários do mês), **Pendências** (atrasados + cobrança via WhatsApp).

Plano de evolução (fases, tabelas, rotas, telas): `docs/PROMPT_PLANO_IDEAL_CONTAFACIL.md`.

## User preferences

- Não reescrever/“desfazer” arquivos de configuração sensíveis (ex.: `pnpm-workspace.yaml`, qualquer `*.nix`). Atenção: `pnpm add` reformata o `pnpm-workspace.yaml` e apaga o bloco de segurança `minimumReleaseAge` — preferir editar `package.json` + `pnpm install`, ou restaurar o yaml depois (`git checkout pnpm-workspace.yaml`). O `minimumReleaseAge` recusa versões com menos de um dia: use faixas (`^5.0.0`), não a última patch.
- Nunca commitar dados reais, hashes de senha ou segredos (o seed antigo foi removido por isso). `.env` está no `.gitignore`; só `.env.example` entra.

## Gotchas

- `vite.config.ts` exige as envs `PORT` e `BASE_PATH` (lança erro se faltarem) — já setadas pelo `playwright.config.ts` na suíte e2e.
- e2e usa o Chromium indicado por `REPLIT_PLAYWRIGHT_CHROMIUM_EXECUTABLE` quando setada (Replit/Nix; neste ambiente `/opt/pw-browsers/chromium`); vazia, usa o do Playwright.
- `e2e/global-setup.ts` **trunca todas as tabelas** de `E2E_DATABASE_URL` (e recusa um nome sem `test`/`e2e`). O `webServer` do Playwright sobe **antes** do global setup, então é o boot da API que cria a estrutura; o setup só limpa e semeia.
- **Depois de mexer em rotas da API, o servidor precisa ser reiniciado.** Reconstruir o bundle não basta: o processo Node já carregou o antigo na memória.
- A tela de Pagamentos serve o **build** (vite preview); rode `e2e` (que rebuilda) após editar o frontend, não só `playwright test`.
- `lib/db/scripts/*.ts` rodam com `node` puro (type stripping): imports relativos precisam da extensão `.ts` (por isso `instalacao.ts` importa `./senha.ts`, e o `tsconfig` de `lib/db` tem `allowImportingTsExtensions`).
- `drizzle.config.ts` usa `out: "./drizzle"` relativo de propósito: com caminho absoluto o drizzle-kit monta `.//home/...` e não acha o snapshot.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
