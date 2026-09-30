# Prompt: Plano ideal do ContaFácil sob a ótica de cinco avaliadores

> Este arquivo é um prompt. Ele foi escrito para ser entregue a um agente de engenharia (Claude Code ou equivalente) ou a uma equipe humana, com a instrução de **executar** o plano descrito aqui, fase por fase, dentro do repositório `gestao-contabil`. Tudo o que está nele foi verificado no código em 30/09/2026 ou pesquisado na web nessa data; os preços de serviços externos são aproximados.

---

## 0. Como usar este prompt

1. Cole este arquivo inteiro como primeira mensagem para o agente, ou aponte o agente para `docs/PROMPT_PLANO_IDEAL_CONTAFACIL.md` e peça que o leia por completo antes de qualquer ação.
2. O agente deve responder primeiro com um **plano de execução da fase pedida** (lista de PRs, ordem, riscos) e só depois começar a codar.
3. Cada fase é independente o bastante para virar um ciclo de trabalho. Não pule fases: a Fase 0 corrige bugs que corrompem dados e a Fase 1 cria as fundações de que as demais dependem.
4. Ao terminar cada item, o agente marca a caixa correspondente na seção 7 e registra em `replit.md` o que mudou de comportamento, seguindo o estilo que já existe lá.

---

## 1. Papel e missão

Você é uma equipe de cinco especialistas trabalhando em conjunto sobre o mesmo repositório:

| Persona | Responsabilidade neste plano |
| --- | --- |
| **Produto e Negócio** | Garantir que o sistema resolva a rotina real de um escritório contábil brasileiro e alcance paridade com os concorrentes onde importa. |
| **Arquitetura de Software** | Manter o contrato único OpenAPI, eliminar duplicação de regras, introduzir transações, migrations e camada de domínio sem reescrever a stack. |
| **Segurança** | Proteger senhas de terceiros, endurecer login e borda HTTP, isolar tenants e obedecer à LGPD. |
| **Qualidade e Testes** | Corrigir bugs conhecidos, recriar a base da pirâmide de testes, instalar lint e CI, tornar o front robusto a falhas. |
| **Operação e DevOps** | Tornar o deploy previsível: migrations versionadas, ambientes separados, observabilidade, backup, runbook. |

A missão é transformar o ContaFácil de "ferramenta de um escritório" em **produto pronto para vários escritórios**, sem perder o que já funciona: a grade cliente × obrigação, o contrato OpenAPI como fonte única, o isolamento por conta e a suíte e2e.

Toda decisão deve ser tomada pela persona dona do assunto e revisada pelas outras quatro. Quando duas personas discordarem, vence a mais restritiva em segurança e a mais simples em arquitetura.

---

## 2. Contexto: o que o ContaFácil é hoje

### 2.1 Propósito

Sistema web multi-tenant para escritórios de contabilidade brasileiros. Cada escritório é uma conta com login próprio. A contadora acompanha, mês a mês (competência), o checklist de obrigações fiscais de cada cliente e a cobrança de honorários. O mesmo sistema cobre senhas de portais, guias em atraso com o fisco, processos avulsos, funcionários, folha, férias e despesas.

### 2.2 Stack e estrutura

- Monorepo pnpm criado no Replit, Node 24, TypeScript 5.9.
- `artifacts/api-server/src`: API Express 5, uma rota por recurso em `routes/*.ts`, middlewares em `middlewares/`, `lib/sessao.ts`, `lib/escopo.ts`, `lib/pessoal.ts`, `lib/http.ts` (`HttpError`), `lib/logger.ts` (pino). Build com esbuild em ESM.
- `artifacts/gestao-contabil/src`: SPA React 19 + Vite, wouter, React Query, shadcn/ui. Uma página por tela em `pages/*.tsx`, navegação em `components/MenuLateral.tsx`, utilitários em `lib/` (`formato.ts`, `whatsapp.ts`, `processo.ts`, `pessoal.ts`).
- `lib/db`: schema Drizzle em `src/schema/schema.ts` (19 tabelas), `src/senha.ts` (scrypt), `src/instalacao.ts` (`garantirBanco`), `src/seed/gerado.ts` (dump congelado), `src/tipos-padrao.ts`, scripts `criar-conta`, `import-clientes-xlsx`, `migrar-multitenant`, `exportar-seed`, `seed-tipos`.
- `lib/api-spec/openapi.yaml`: contrato escrito à mão (43 paths). O Orval gera `lib/api-zod` (schemas Zod usados na validação do servidor) e `lib/api-client-react` (hooks React Query usados no front).
- `artifacts/gestao-contabil/e2e`: 15 specs Playwright, `global-setup.ts` (trunca o banco), `auth.setup.ts`.
- `artifacts/mockup-sandbox`: sandbox de componentes, sem lógica de negócio. Ignore.
- `.migration-backup/`: versão anterior em Next.js. Contém migrations versionadas e testes unitários (`prazos.test.ts`, `whatsapp.test.ts`) que se perderam na migração e devem ser reaproveitados.
- Deploy: Replit Autoscale com dois serviços roteados por caminho (`/api` → API na porta 8080; `/` → estático). Health check em `/api/healthz`. Documentação viva em `replit.md`.

### 2.3 Modelo de domínio

| Entidade | Papel | Observação |
| --- | --- | --- |
| `contas`, `usuarios`, `sessoes` | Tenant, login e sessão em banco (30 dias) | Perfil do escritório mora em `contas`; login único no sistema inteiro |
| `clientes` | Empresa atendida | Regime (`simples`, `presumido`, `real`, `mei`), honorário, dia de vencimento, procuração, `senhaGov`, `senhaNfse`, `socioCpf` |
| `tipos_obrigacao` + `cliente_obrigacoes` | Catálogo por conta e vínculo N:N | `periodicidade`, `mesReferencia`, `regimes[]`, `diaVencimento`, `offsetMes`, `ativo` (não usado) |
| `competencias`, `checklist_itens`, `pagamentos`, `cobrancas` | Ciclo mensal | Única por (conta, ano, mês); status do item: `pendente → emitido → enviado → nao_se_aplica` |
| `debitos`, `credenciais` | Guias em atraso com o fisco; senhas por sistema | `competenciaRef` e parcelas em texto livre |
| `processos` + `processo_etapas` | Processos e pedidos avulsos | Mesma tabela, `categoria` discrimina |
| `funcionarios`, `folha_lancamentos`, `ferias`, `despesas` | Pessoal e gastos | `cliente_id` nulo = do próprio escritório; folha digitada, não calculada |
| `configuracoes` | Chave/valor por conta | Hoje só o modelo de mensagem do WhatsApp |

### 2.4 Regras de negócio que já existem e devem ser preservadas

- Abrir competência gera itens de checklist só para clientes ativos e só para obrigações cuja periodicidade cai naquele mês (`aplicaNoMes` em `routes/competencias.ts`), com vencimento calculado por `diaVencimento` + `offsetMes` ajustado ao último dia do mês (`calcularVencimento`). Gera um pagamento de honorário por cliente vencendo no dia 10 do mês seguinte por padrão. Opção `somenteHonorarios` para meses anteriores ao uso.
- Filtro por regime no cadastro do cliente; obrigação já vinculada mas incompatível continua visível para não ser desmarcada sem querer.
- Só `enviado` conta como concluído nos resumos; `emitido` tem contador próprio.
- Cobrança por WhatsApp com modelo editável e variáveis `{cliente}`, `{competencia}`, `{vencimento}`, `{valor}`, `{dias_atraso}`; telefone normalizado com DDI 55; link `wa.me`; registro em `cobrancas`.
- Férias: `limiteGozo` (um ano após o fim do aquisitivo) e `vencendo` (90 dias antes) calculados na API em `lib/pessoal.ts`.
- Folha: upsert por índice único (funcionário, ano, mês, tipo).
- Toda rota após `exigirSessao` filtra por `contaId`; ids vindos no corpo são validados contra a conta (`validarCliente`, `validarFuncionario`, `exigirEtapaDaConta`).

### 2.5 Números

| Pacote | Linhas |
| --- | --- |
| API (`artifacts/api-server/src`) | 2.357 |
| Telas React (`src/pages`) | 4.848 |
| Contrato OpenAPI | 2.056 |
| Testes e2e | 1.514 |
| Banco (`lib/db/src`) | 1.073 |

---

## 3. Diagnóstico consolidado (achados verificados no código)

### 3.1 Produto e Negócio

- O catálogo padrão (`lib/db/src/tipos-padrao.ts`) tem 14 nomes, todos gravados como mensais, sem dia de vencimento e sem regime. Consequências: ECF e declaração anual do MEI entram nos 12 meses; todo item nasce com `vencimento` nulo; como `GET /pendencias` filtra `vencimento is not null` e `status = 'pendente'`, **nenhuma obrigação atrasada aparece com o catálogo padrão**.
- Faltam no catálogo: DAS/PGDAS-D, DEFIS, DAS-MEI mensal, DCTFWeb, eSocial, FGTS Digital, PIS/COFINS, IRPJ/CSLL, ECD ("ECB" parece erro de digitação), ISS e declarações municipais, DIRPF dos sócios, certidões e alvarás.
- Sem e-mail, sem relatórios, sem anexos, sem portal do cliente, sem envio de guias, sem multiusuário na interface, sem perfis de permissão, sem auditoria, sem troca de senha pela interface.
- Excluir cliente ou tipo apaga em cascata checklist e pagamentos históricos. `tipos_obrigacao.ativo` não está no contrato nem na tela.
- Competência congelada na abertura: cliente ou obrigação incluídos depois não entram; não há ação de ressincronizar.
- Guia `emitido` e vencida não gera alerta. Marcar pago em Pendências não grava a data. `PATCH /pagamentos/:id` substitui o registro inteiro (`status ?? "pendente"`, demais campos `|| null`).
- Perfil do escritório não alimenta nenhuma mensagem. Rota global `/api/ferias` não é chamada por nenhuma tela. Painel mostra a última competência aberta, não o mês corrente, e só 4 cartões.

### 3.2 Arquitetura

- Não há pasta de migrations; `drizzle.config.ts` não define `out`; só `push` e `push-force`. `garantirBanco` só cria estrutura em banco vazio. **Coluna nova não chega a uma produção em uso por nenhum mecanismo do repositório.** Duas fontes de verdade da estrutura: `schema.ts` e o `SCHEMA_SQL` do dump em `seed/gerado.ts`. Três listas de tabelas mantidas à mão (`tabelas.ts`, `global-setup.ts`, schema).
- Nenhum `db.transaction` na API. Abrir competência faz check-then-insert e três escritas separadas. Salvar cliente apaga e reinsere vínculos sem transação.
- Erros do Postgres (23505 único, 23503 FK, 22P02 formato) viram 500.
- Regras duplicadas: periodicidade em `competencias.ts` e em `src/lib/formato.ts`; dias de atraso no SQL (Pendências) e no navegador (Atrasos, processos); enums reescritos no front; resumo da competência copiado em `painel.ts`; validação de cliente da conta em três lugares.
- Parse de moeda pt-BR repetido em 9 pontos de 8 arquivos, todos com `replace(/\./g, "")`.
- Três fontes de "hoje": `current_date` (UTC no Postgres), `toISOString().slice(0,10)` (UTC no navegador), `getMonth()` (hora local). Depois das 21h em Brasília o "hoje" já é amanhã. Constantes `HOJE` em escopo de módulo congelam com a aba aberta.
- N+1 em `GET /competencias` (2 queries por competência). Painel carrega todos os clientes, com senhas, para contar ativos. Sem paginação em nenhuma listagem. Faltam índices em `clientes(conta_id)`, `checklist_itens(conta_id, status, vencimento)`, `pagamentos(conta_id, status, vencimento)`, `debitos`, `credenciais`, `processos`, `cobrancas(pagamento_id)`, `processo_etapas(processo_id)`.
- Front: páginas de até 518 linhas; 55 componentes shadcn em `components/ui` que nenhuma página importa; 26 `as never`, 2 `@ts-ignore`, 9 tipos locais que duplicam os gerados; `CompetenciaChecklist` copia o estado do servidor para `useState` e mascara o refetch; leitura de erro no formato do axios em `Competencias.tsx`; `useListarClientes` em 7 telas trazendo senhas.
- `zod.coerce.number()` nos params aceita `1.5` e `1e3`, converte `""` em `0`, não limita mês e ano.

### 3.3 Segurança

- **Nenhum IDOR e nenhum bypass de autenticação.** Todas as 30 rotas de escrita por id filtram por conta; etapas, cobranças e vínculos conferem a posse pelo pai.
- `senha_gov`, `senha_nfse` (clientes) e `senha` (credenciais) em texto puro. `GET /clientes` usa `select()` sem projeção e devolve senhas e CPF do sócio para 7 telas. `GET /credenciais` devolve a senha em todas as linhas.
- Login sem rate limit, lockout ou atraso; cada tentativa custa um scrypt (N=16384). Login inexistente retorna antes do scrypt: enumeração por tempo.
- `cors()` sem opções (origem `*`) e `express.urlencoded` sem uso (permite login CSRF por formulário). Sem helmet, CSP, HSTS, `frame-ancestors`; `x-powered-by` ligado.
- CSV de Dados cadastrais não neutraliza células iniciadas por `=`, `+`, `-`, `@`, tab ou CR, e exporta senhas em claro.
- `lib/db/src/seed/gerado.ts` versionado com a conta real do escritório (CNPJ, nome da responsável) e o hash scrypt do usuário. `exportar-seed` copia todas as tabelas. Cookie de sessão do e2e commitado por regra quebrada em `.gitignore` (`e2e/.auth/` só casa na raiz). Senha padrão `acesso123` em `migrar-multitenant`.
- Token de sessão em claro no banco; 30 dias sem timeout por inatividade; limpeza só no boot.
- `pnpm audit --prod`: 2 moderados em `qs` via express. `orval < 8.22` com achados críticos só em codegen.

### 3.4 Qualidade e Testes

- **Bug crítico:** `valor_honorario` é `numeric`, a API devolve `"350.00"`, `Clientes.tsx` exibe cru como `defaultValue` e o submit remove os pontos: reeditar um cliente sem tocar no honorário grava **R$ 35.000,00**. Mesmo padrão em Dados cadastrais, Guias em atraso e Pagamentos. `journey.spec` consagra o formato `350.00`.
- 15 specs, 57 `test()`, só Chromium, `retries: 0` com `trace: "on-first-retry"` (trace nunca gravado), reporter só `list`. 13 dos 61 endpoints sem nenhum teste. Pendências inteira sem teste. Multitenant não cobre credenciais, débitos, processos, etapas, checklist, pagamentos.
- Zero testes unitários; os do backup não foram portados. Sem lint, sem `.prettierrc`, sem CI, `strict` desligado.
- `global-setup.ts` faz `TRUNCATE` em 19 tabelas na `DATABASE_URL` do ambiente sem trava.
- Front sem Error Boundary, sem Toaster montado, nenhuma página trata `isError`; mutações otimistas sem rollback; exclusão sem confirmação em Senhas, Atrasos, etapa, folha e férias.
- Outros bugs: `POST /clientes` com `id` e sem `obrigacoes` desvincula tudo; textarea do modelo de WhatsApp com `defaultValue` pode sobrescrever o modelo salvo; `comVencimento` transborda 29/02 para 01/03 e não tem estado "vencida"; `normalizarTelefone` aceita zero antes do DDD e gera número errado; `PATCH /folha/:id` e `PATCH /ferias/:id` sem uso.

### 3.5 Operação e DevOps

- Deploy roda só esbuild e vite build; nenhum executa `tsc`. Sem CI. `post-merge.sh` faz `install --frozen-lockfile` e `drizzle-kit push` no banco do workspace com timeout de 20 s.
- Health check estático; sem readiness. Pool do pg com padrões e sem `pool.on('error')`. Sem SIGTERM. Sem backup, staging, métricas, alertas. Request id sequencial por processo; logs sem `contaId`.
- Rodar fora do Replit só em Linux x64 glibc (overrides no `pnpm-workspace.yaml`). Sem `.env.example`, `packageManager`, `engines`. `replit.md` diz porta 5000 e bundle CJS; ambos errados.
- Onboarding só por CLI contra a `DATABASE_URL` do shell (banco de dev); a conta criada não chega à produção. `import-clientes` não é transacional e não normaliza CNPJ.

### 3.6 O que está bom e não pode regredir

- Contrato OpenAPI como fonte única, com Zod no servidor e hooks no cliente.
- `exigirSessao` antes de todas as rotas e filtro por conta em toda consulta.
- Error handler central e rotas pequenas e comentadas.
- Sessão em banco pensada para autoscale; scrypt com sal; cookie httpOnly/lax/secure.
- Suíte e2e por funcionalidade, incluindo `multitenant.spec`.
- `minimumReleaseAge: 1440` no `pnpm-workspace.yaml`.

---

## 4. Princípios e restrições não negociáveis

1. **A stack não muda.** Express 5, Drizzle, Postgres, React, Vite, Orval continuam. Nada de trocar ORM, framework ou banco.
2. **Contrato primeiro.** Toda rota nova nasce em `lib/api-spec/openapi.yaml`, seguida de `pnpm --filter @workspace/api-spec run codegen`. A API valida a entrada com os schemas gerados. Nenhum tipo de resposta é redefinido à mão no front.
3. **Multi-tenant por construção.** Toda tabela nova leva `conta_id`; toda consulta filtra por ele; sub-recursos conferem a posse pelo pai. Todo recurso novo ganha um caso em `multitenant.spec.ts`.
4. **Migrations antes de tabelas.** Nenhuma coluna nova entra antes da Fase 1 concluir as migrations versionadas.
5. **Segredo nunca no git.** Nem hash, nem cookie, nem CNPJ real, nem planilha. `exportar-seed` só exporta catálogos.
6. **Português do Brasil** na interface, nas mensagens de erro, nos nomes de tabela e coluna e nos comentários, como já é o padrão do repositório.
7. **Fuso oficial `America/Sao_Paulo`.** "Hoje" é calculado uma vez, num módulo compartilhado, e passado como parâmetro para o SQL.
8. **Nada de reescrever `pnpm-workspace.yaml`** nem arquivos `*.nix`. Para adicionar dependência, editar `package.json` e rodar `pnpm install`; se o yaml mudar, `git checkout pnpm-workspace.yaml`.
9. **Reiniciar o servidor** depois de mexer em rotas; rebuild não basta.
10. **O e2e trunca o banco.** Só rodar com `E2E_DATABASE_URL` apontando para um banco descartável (a Fase 0 cria essa trava).
11. **Cada serviço externo entra atrás de uma interface** (`Armazenamento`, `Mensageiro`, `Cobrador`, `EmissorNota`, `ConsultaFiscal`) com uma implementação real e uma falsa para testes.
12. **Uma PR por item de plano**, pequena, com testes, sem widening.

---

## 5. Visão do produto ideal

### 5.1 Personas de uso

| Persona | O que precisa |
| --- | --- |
| **Contadora dona do escritório** (admin) | Ver o mês inteiro numa tela, saber o que vence esta semana, cobrar honorários sem esforço, ter as senhas dos clientes seguras, delegar sem perder controle. |
| **Auxiliar contábil** | Trabalhar a grade do checklist, anexar guias, enviar ao cliente com protocolo, sem ver senhas nem valores de honorário. |
| **Cliente do escritório** (portal) | Receber as guias no prazo, dar ciente, enviar documentos pedidos, ver e pagar o honorário, abrir um pedido. |

### 5.2 Jornada mensal alvo

1. No dia 1, o worker abre a competência automaticamente (ou a contadora clica em Abrir): checklist cliente × obrigação gerado a partir do catálogo por regime, honorários criados e cobranças registradas no provedor de pagamento com link e QR Pix.
2. O Painel mostra: vencimentos dos próximos 7 dias, guias emitidas e não enviadas, honorários vencidos, férias e procurações vencendo, processos atrasados, certidões a renovar.
3. A auxiliar emite as guias e as anexa ao item (arrastando vários PDFs; o sistema identifica cliente e obrigação pelo conteúdo). Ao clicar Enviar, o cliente recebe e-mail ou WhatsApp com link assinado; abrir o link gera o protocolo e avança o status para `enviado`.
4. O cliente paga o honorário pelo link; o webhook marca pago e emite a NFS-e. Honorário vencido dispara a mensagem de cobrança automaticamente após N dias, com o link.
5. No fim do mês, a contadora vê produtividade por colaborador, inadimplência por cliente e o histórico de quem alterou o quê.

### 5.3 Módulos alvo

- **Fiscal:** catálogo por regime, competências, checklist com anexos e protocolo, ressincronização, guias em atraso com parcelas estruturadas.
- **Financeiro:** honorários com reajuste em lote, 13º de honorário, cobrança de serviços avulsos, cobrança automática (Pix/boleto), NFS-e, inadimplência, relatórios.
- **Relacionamento:** portal e notificações (e-mail, WhatsApp oficial, portal), modelos de mensagem com dados do Perfil.
- **Cadastro e segurança:** clientes, senhas cifradas com revelação auditada, procurações e certificados com validade, usuários com papéis.
- **Pessoal:** funcionários, folha, férias com estado "vencida", despesas, tudo para escritório e clientes.
- **Gestão:** painel de alertas, produtividade, auditoria, exportações.

---

## 6. Plano por persona

### 6.1 Produto e Negócio

**Objetivo:** o sistema deixa de depender de configuração manual para alertar sobre atraso e passa a cobrir o ciclo completo emitir → enviar → cobrar → receber.

**Entregas:**

1. **Catálogo padrão completo e configurado.** Reescrever `lib/db/src/tipos-padrao.ts` como lista de objetos com `nome`, `periodicidade`, `mesReferencia`, `diaVencimento`, `offsetMes`, `regimes`, `descricao`. Ver a tabela de referência na seção 8.6. `criar-conta` e `seed-tipos` passam a gravar todos os campos. Migração de dados para contas existentes: só preencher campos nulos, nunca sobrescrever o que a contadora editou.
2. **Vínculo automático por regime.** Coluna `vincular_automatico boolean default true` em `tipos_obrigacao`. Ao criar ou alterar o regime de um cliente, a API cria os vínculos das obrigações compatíveis que ainda não existem. A tela de Clientes mostra os vínculos automáticos com um marcador e permite desmarcar.
3. **Inativar em vez de excluir.** Expor `tipos_obrigacao.ativo` no contrato e na tela; a geração ignora inativos. Em `clientes`, excluir passa a ser inativar (`ativo=false`); exclusão física só por admin e só para cliente sem histórico (nenhuma competência gerada).
4. **Ressincronizar competência.** `POST /competencias/:id/sincronizar`: cria itens e pagamentos que faltam para clientes ativos e vínculos novos, sem tocar nos existentes. Botão na tela da competência.
5. **Pendências e pagamentos corrigidos.** Pendências consideram `pendente` e `emitido` vencidos, com marcador distinto. Marcar pago grava `dataPagamento = hoje`. `PATCH /pagamentos/:id` passa a ser parcial (só altera o que veio). Honorário sem valor aparece com aviso "valor não cadastrado".
6. **Painel de alertas.** `GET /painel` retorna: competência do mês corrente (ou aviso para abrir), vencimentos dos próximos 7 dias, itens emitidos e não enviados vencidos, honorários vencidos com total, férias vencendo (rota já existe), procurações vencendo em 30 dias, processos com prazo estourado, certidões a renovar (quando existir). Tela com cartões clicáveis que levam à lista filtrada.
7. **Perfil nas mensagens.** Variáveis `{escritorio}`, `{responsavel}`, `{crc}`, `{telefone_escritorio}`, `{chave_pix}` no modelo de WhatsApp e nos e-mails. `contas` ganha `chave_pix`.
8. **Financeiro dos honorários.** Reajuste anual em lote (percentual ou valor, com prévia), 13º de honorário (gera pagamento extra em dezembro), cobrança de serviço avulso ligada a um processo ou pedido, relatório de faturamento e inadimplência por cliente e por período, exportação CSV do checklist e dos pagamentos.
9. **Guias em atraso estruturadas.** `debitos` ganha `competencia_ano`, `competencia_mes`, `parcelas_total`, `parcelas_pagas`, mantendo `competenciaRef` para compatibilidade.
10. **Paridade com concorrentes** (detalhada em 8.4): notificações automáticas, envio de guias com protocolo, portal do cliente, cobrança automática, WhatsApp oficial, baixa automática por leitura de PDF, produtividade, robô de CND.

**Critérios de aceite:**

- Uma conta nova, sem nenhuma configuração manual, abre a competência e vê ao menos uma obrigação em Pendências no dia seguinte ao vencimento.
- Nenhuma ação da interface apaga histórico de checklist ou pagamento.
- O Painel responde em menos de 500 ms com 200 clientes e 24 competências.

**Métricas:** obrigações entregues no prazo por mês; honorários recebidos em até 10 dias do vencimento; tempo entre emitir e enviar; clientes ativos por conta.

### 6.2 Arquitetura de Software

**Objetivo:** cada regra de negócio existe em um só lugar, toda operação de várias escritas é atômica, o schema evolui por migrations e a API tem contrato de saída verificado.

**Entregas:**

1. **Migrations versionadas.** `out: "./drizzle"` em `drizzle.config.ts`; `drizzle-kit generate` gera a baseline a partir do schema atual; `migrate()` do drizzle-orm roda no boot dentro de `garantirBanco`, substituindo `SCHEMA_SQL`. Marcar a baseline como aplicada em produção (reaproveitar `marcar-migration-aplicada.ts` do backup). `migrar-multitenant` vira migration numerada. Remover `push-force`. `exportar-seed` passa a exportar apenas `tipos_obrigacao` e `configuracoes` de catálogo.
2. **Transações.** `db.transaction` em abrir competência, sincronizar competência, salvar cliente (update + vínculos), importar clientes, criar conta. `insert ... onConflictDoNothing().returning()` no lugar de check-then-insert.
3. **Erros do banco mapeados.** No `errorHandler`: 23505 → 409 com mensagem em português, 23503 → 409, 22P02/22007/22003 → 400. Schema `Erro` no OpenAPI com `codigo` e `mensagem`.
4. **Módulo de domínio compartilhado** `lib/dominio` (novo pacote workspace, sem dependência de Express ou React): `periodicidade.ts` (`INTERVALO_MESES`, `aplicaNoMes`, `mesesDaPeriodicidade`), `prazos.ts` (`calcularVencimento`, `diasAtraso`), `data.ts` (`hojeBR()`, `formatarData`, `paraISO`), `moeda.ts` (`paraNumeroBR`, `formatarMoeda`, `paraDecimalAPI`), `whatsapp.ts` (`normalizarTelefone`, `montarMensagem`, `linkWhatsapp`), `ferias.ts` (`comVencimento` com estado `vencida`), `folha.ts` (`liquidoSugerido`), `enums.ts` (reexporta os enums gerados). API e front importam daqui; as cópias em `formato.ts`, `competencias.ts`, `pessoal.ts` e `processo.ts` são removidas.
5. **Contrato endurecido.** `type: integer` com `minimum`/`maximum` (mês 1–12, ano 2000–2100, id ≥ 1, dia 1–31), `format: date` nas datas, `pattern: ^\d+(\.\d{1,2})?$` nos valores, `minLength: 1` em nomes, `.int()` nos params gerados (configurar no `orval.config.ts`). Em dev e teste, um middleware valida as respostas com os schemas `*Response` gerados e loga divergência.
6. **Camada de serviço.** `artifacts/api-server/src/servicos/` com `competencias.ts`, `clientes.ts`, `pagamentos.ts`, `notificacoes.ts`, `arquivos.ts`, recebendo `db` ou `tx` por parâmetro. Rotas viram finas: parse → serviço → resposta. Permite testes de integração sem HTTP.
7. **Queries e índices.** Índices listados em 3.2 via migration. `GET /competencias` numa query agrupada. `painel.ts` usa `resumoCompetencia` exportada. Despesas filtradas por intervalo de datas. `GET /clientes/opcoes` (id, código, razão social) para dropdowns; `GET /clientes` com projeção explícita sem senhas.
8. **Paginação e busca no servidor** (`limit`, `offset`, `busca`) em clientes, débitos, despesas, processos, competências, com `total` na resposta.
9. **Front.** Remover `as never`, `@ts-ignore` e tipos locais; usar tipos e enums gerados. Extrair `useSalvarCampo` (mutação + invalidate + feedback), `<CelulaEditavel>`, `<FiltroEscopo>`, `<SeletorMes>`, `<ConfirmarExclusao>` (sobre o `AlertDialog` do shadcn). Quebrar páginas acima de 300 linhas. Trocar a cópia de estado em `CompetenciaChecklist` e `Pendencias` por `onMutate`/`setQueryData` com rollback em `onError`. Decidir sobre `components/ui`: adotar os componentes usados e remover o resto.
10. **Consistência de tenant no banco.** Avaliar `conta_id` em `cliente_obrigacoes`, `processo_etapas` e `cobrancas` com FK composta, e Row-Level Security por `conta_id` com `SET LOCAL app.conta_id` por transação como defesa em profundidade.

**Critérios de aceite:**

- `grep -r "replace(/\\./g" artifacts/gestao-contabil/src` retorna zero.
- `grep -r "db.transaction" artifacts/api-server/src` retorna ao menos 5 usos.
- Uma tabela nova chega à produção só por migration; `push` não é mais usado fora do dev.
- Nenhum `as never` ou `@ts-ignore` no front.

### 6.3 Segurança

**Objetivo:** vazamento do banco ou de um backup não expõe senhas de terceiros; login resiste a força bruta; nenhuma credencial vive no git; cada acesso a segredo é auditado.

**Entregas:**

1. **Cifra em repouso.** `lib/db/src/cifra.ts` com AES-256-GCM (`crypto.createCipheriv`), chave de 32 bytes em `CHAVE_CIFRA` (secret), formato `v1$iv$tag$dados` em base64url, versão no prefixo para permitir rotação. Aplicar a `clientes.senha_gov`, `clientes.senha_nfse`, `credenciais.senha`, tokens de provedores externos, certificado A1 e sua senha. Migration em duas etapas: coluna nova cifrada, backfill, remoção da antiga.
2. **Projeção e revelação auditada.** `GET /clientes` e `GET /credenciais` nunca devolvem segredos. `GET /credenciais/:id/revelar` e `GET /clientes/:id/senhas` devolvem em claro, exigem papel `admin` ou `contador`, e gravam em `auditoria` (quem, quando, qual registro, IP). A tela mostra o segredo por 30 segundos e some.
3. **Login endurecido.** `express-rate-limit` em `/api/auth/entrar`: 10 tentativas por IP a cada 15 min e 5 por login a cada 15 min, com `app.set("trust proxy", 1)`. Scrypt fictício quando o login não existe (tempo constante). Bloqueio progressivo após 10 falhas por login (tabela `tentativas_login`). Senha com mínimo de 10 caracteres na criação e na troca. Endpoint `POST /auth/trocar-senha` que exige a senha atual e invalida as demais sessões. Fluxo de "esqueci a senha" por e-mail com token de uso único e validade de 30 min.
4. **Sessão.** Guardar `sha256(token)` no banco. Timeout por inatividade de 12 h deslizante, teto de 30 dias. Job diário de limpeza. `POST /auth/sair-de-todos`.
5. **Borda HTTP.** Remover `cors()` e `express.urlencoded`. `helmet()` com CSP (`default-src 'self'`, `frame-ancestors 'none'`, `img-src 'self' data: blob:`, `connect-src 'self'` mais os hosts de upload), HSTS, `app.disable("x-powered-by")`. Exigir `Content-Type: application/json` em métodos de escrita. `express.json({ limit: "256kb" })`. Cabeçalhos também no serviço estático (arquivo de headers do Replit ou meta tags CSP como fallback).
6. **CSV seguro.** Prefixar com `'` toda célula que comece com `=`, `+`, `-`, `@`, tab ou CR. Senhas nunca vão para o export; exportação de dados sensíveis exige confirmação e é auditada.
7. **Higiene do repositório.** `.gitignore` com `**/e2e/.auth/`; `git rm --cached artifacts/gestao-contabil/e2e/.auth/e2e.json`. Remover a conta real e o hash de `gerado.ts`; **trocar a senha dessa conta**, porque o hash está no histórico. `migrar-multitenant` sorteia senha quando `--senha` é omitido. Bootstrap do primeiro usuário por variável de ambiente de uso único ou por `criar-conta` contra produção, nunca por seed.
8. **Portal do cliente como segunda fronteira.** Sessão própria (`sessoes_cliente`), middleware `exigirSessaoCliente`, todas as consultas de `/api/portal/*` filtram por `cliente_id` da sessão. Links assinados de guias com validade de 7 dias e escopo de um arquivo. Uploads validados por tipo (PDF, imagens, XML, planilhas), tamanho (20 MB) e servidos com `Content-Disposition: attachment`.
9. **Webhooks.** `/api/webhooks/*` antes de `exigirSessao`, com validação de assinatura (Asaas: token de webhook; WhatsApp: `X-Hub-Signature-256` HMAC), idempotência por id do evento (tabela `eventos_webhook`) e rate limit.
10. **Dependências.** Override de `qs` para ≥ 6.16; `orval` ≥ 8.22; `pnpm audit --prod` no CI falhando em alto ou crítico.
11. **LGPD.** Registro de tratamento (quais dados pessoais, base legal, retenção). Exclusão de cliente inativo há mais de X anos com anonimização. Página de política de privacidade no portal. Log de acesso a dados pessoais (CPF, salário) por usuário.

**Critérios de aceite:**

- `SELECT senha_gov FROM clientes` retorna apenas texto cifrado com prefixo `v1$`.
- 11 tentativas de login em 1 minuto do mesmo IP retornam 429.
- `git ls-files | grep -iE 'auth|\.pfx|\.xlsx'` retorna só código.
- Teste e2e prova que a sessão de um cliente do portal não acessa arquivo de outro cliente.

### 6.4 Qualidade e Testes

**Objetivo:** bugs de corrupção de dados corrigidos com teste de regressão; pirâmide com unitários, integração de API e e2e; lint e CI bloqueando regressão; front que nunca fica branco nem engana com estado vazio.

**Entregas:**

1. **Correções imediatas (Fase 0).** Moeda: `paraNumeroBR` única em `lib/dominio/moeda.ts`, exibição sempre com vírgula (`formatarMoeda` ou `toFixed(2).replace(".", ",")`), regex de valor na API, e2e que edita um cliente sem tocar no honorário e confere que o valor não mudou. `POST /clientes` com `id` e sem `obrigacoes` mantém os vínculos (campo opcional = não alterar). Modelo de WhatsApp com estado controlado que sincroniza quando a configuração chega. `comVencimento` calcula o limite com `setUTCFullYear` e trata 29/02; estado `vencida` quando `hoje > limite` sem gozo. `normalizarTelefone` remove zero inicial antes do DDD. Datas de hoje via `hojeBR()`.
2. **Unitários com Vitest** em `lib/dominio` (e nos serviços da API com `db` falso): portar `prazos.test.ts` e `whatsapp.test.ts` do backup; casos para virada de ano, dia 31 em fevereiro, offset negativo, dia nulo, periodicidades com mês âncora, 29/02 em férias, zero antes do DDD, moeda com ponto e vírgula, `liquidoSugerido`.
3. **Integração de API** com supertest contra Postgres efêmero (Testcontainers ou service container): abrir competência (transação, duplicidade → 409, corrida), sincronizar, salvar cliente com vínculos, PATCH parcial de pagamento, isolamento multitenant de todas as rotas (gerado a partir da lista de paths do OpenAPI, para não esquecer rota nova), webhooks com assinatura inválida → 401.
4. **E2E ampliado e desacoplado.** Cobrir Pendências (marcar enviado/pago, cobrança, modelo), ajuste de prazos, login e logout pela interface, exclusões com confirmação, portal do cliente, notificações (com `Mensageiro` falso que grava em tabela). Cada teste cria os próprios dados com nomes únicos via fixtures; limpezas usam `baseURL` da config; `page.clock` nos testes com data; `@axe-core/playwright` no smoke. `retries: 1` no CI (trace funciona), reporters `html` e `junit`.
5. **Trava do banco no e2e.** `global-setup.ts` exige `E2E_DATABASE_URL`, aborta se for igual a `DATABASE_URL`, se o nome do banco não contiver `test` ou `e2e`, ou se `NODE_ENV=production`.
6. **Lint e formato.** ESLint flat config com `typescript-eslint`, `react-hooks`, `jsx-a11y`, `import`; `.prettierrc`; scripts `lint`, `format:check`; pre-commit com `lint-staged`. `strict: true` no `tsconfig.base.json` com eliminação progressiva dos erros.
7. **Front robusto.** Error Boundary global com tela de erro e botão recarregar; `<Toaster/>` montado; hook `useConsulta` que padroniza loading, vazio e erro (com tentar de novo) e é usado em todas as páginas; `mutateAsync` sempre com tratamento e mensagem; `ApiError.data.mensagem` como fonte da mensagem; confirmação em toda exclusão; foco preso e Esc nos modais; `role="dialog"` e `aria-label` nas células editáveis.
8. **Validação de formulário.** Zod no front com os mesmos schemas gerados (`*Body`) via `zodResolver`, mensagens em português, validação de CNPJ e CPF com dígito verificador (`lib/dominio/documentos.ts`), e-mail e telefone.

**Critérios de aceite:**

- CI verde exige: `pnpm install --frozen-lockfile`, `typecheck`, `lint`, `format:check`, `vitest`, integração de API, e2e, `pnpm audit --prod` sem alto ou crítico.
- Cobertura de linhas em `lib/dominio` ≥ 90%.
- Nenhum endpoint do OpenAPI sem ao menos um teste (verificado por script que cruza paths e specs).

### 6.5 Operação e DevOps

**Objetivo:** publicar uma mudança de schema com segurança, ter staging, saber quando algo quebra e recuperar dados.

**Entregas:**

1. **Pipeline.** GitHub Actions em `.github/workflows/ci.yml`: Node 24, pnpm fixado (`packageManager` no `package.json` raiz), cache do pnpm store, Postgres 16 como service container, todos os checks da seção 6.4. Workflow de deploy só após CI verde. `typecheck` incluído no build do artifact da API.
2. **Migrations em produção.** `migrate()` no boot com lock (`pg_advisory_lock`) para instâncias concorrentes do autoscale. Passo de release documentado: gerar migration → revisar SQL → CI aplica no banco de teste → deploy aplica em produção. Backup automático antes de migration destrutiva.
3. **Ambientes.** `.env.example` com todas as variáveis (`DATABASE_URL`, `E2E_DATABASE_URL`, `PORT`, `BASE_PATH`, `LOG_LEVEL`, `CHAVE_CIFRA`, `R2_*`, `RESEND_API_KEY`, `WHATSAPP_*`, `ASAAS_*`, `SERPRO_*`, `URL_PUBLICA`). Staging com banco próprio (cópia anonimizada de produção). `docker-compose.yml` com Postgres para dev local; revisar os overrides de plataforma do `pnpm-workspace.yaml` (sem apagar o bloco de segurança) para permitir macOS e Alpine.
4. **Robustez do processo.** `pool.on("error")` com log; `max`, `idleTimeoutMillis`, `connectionTimeoutMillis`, `statement_timeout`; `SET TIME ZONE 'America/Sao_Paulo'` por conexão; SIGTERM/SIGINT com `server.close()` → `boss.stop()` → `pool.end()` e timeout de 10 s; `/api/readyz` com `select 1`.
5. **Worker de jobs.** `pg-boss` no mesmo Postgres. Filas: `avisos`, `cobrancas`, `leitura-pdf`, `consultas-fiscais`, `abrir-competencia`, `limpeza`. Como o autoscale desliga sem tráfego, o processamento é disparado por `POST /api/jobs/executar` protegido por token, chamado por Scheduled Deployment do Replit a cada 5 minutos (ou cron externo). O worker roda dentro da API por até 4 minutos por disparo.
6. **Observabilidade.** `genReqId` com UUID respeitando `X-Request-Id` e devolvendo no header. `req.log.child({ contaId, usuarioId })` após a sessão. Auditoria de login (sucesso e falha) e de acesso a segredos. Sentry (ou equivalente) para 500 e erros do front. Monitor externo em `/api/healthz` e `/api/readyz`. Métricas mínimas expostas: requisições por status, latência p95, jobs pendentes e falhos, tamanho da fila.
7. **Backup e retenção.** `pg_dump` diário cifrado para o R2 (ou backup gerenciado do provedor), retenção de 30 dias, restore testado mensalmente com script `restaurar-backup`. Arquivos do R2 com versionamento.
8. **Onboarding operacional.** `criar-conta` recebe `--banco=producao|dev` explícito e recusa rodar sem. Tela de administração (papel `admin` da conta) para usuários; tela de superadmin (variável `SUPERADMIN_LOGINS`) para criar e desativar contas. `import-clientes` transacional, com CNPJ normalizado e relatório do que foi ignorado. Runbook em `docs/RUNBOOK.md`: dev local, deploy, migration, criar conta, restaurar backup, rotacionar `CHAVE_CIFRA`, incidente de vazamento.
9. **Correções de documentação.** `replit.md`: porta 8080, bundle ESM, remover menções a `zod/v4` e `drizzle-zod` (dependência morta a remover), seção de migrations e de jobs.

**Critérios de aceite:**

- Um deploy com coluna nova aplica a migration sozinho e o log mostra `migrations aplicadas: N`.
- Derrubar o banco por 30 s durante carga não derruba o processo Node.
- Restore do backup de ontem em staging leva menos de 15 minutos e o e2e passa nele.

---

## 7. Roadmap em fases (com checklists)

### Fase 0 — Estabilizar (1 sprint)

Objetivo: nenhum risco crítico ou alto aberto, exceto cifra e migrations, que dependem da Fase 1.

- [ ] Moeda: função única, exibição com vírgula, regex na API, e2e de regressão (6.4.1)
- [ ] `POST /clientes` não desvincula obrigações quando o campo é omitido
- [ ] Modelo de WhatsApp com estado controlado
- [ ] Trava do banco no e2e (`E2E_DATABASE_URL`)
- [ ] `.gitignore` corrigido, cookie removido do índice, hash e conta real fora do seed, senha da conta trocada, `exportar-seed` só de catálogos
- [ ] Rate limit no login, scrypt fictício, `helmet`, remover `cors()` e `urlencoded`, `trust proxy`
- [ ] `db.transaction` em abrir competência e salvar cliente; `onConflict`; 23505 → 409
- [ ] Projeção sem senhas em `GET /clientes`; `GET /clientes/opcoes`; índices
- [ ] CSV escapado e sem senhas
- [ ] `hojeBR()` em `lib/dominio` usado no front e passado ao SQL
- [ ] `pool.on("error")`, timeouts, SIGTERM, `/readyz`
- [ ] `replit.md` corrigido; `.env.example`

### Fase 1 — Fundações (2 sprints)

- [ ] Migrations versionadas com baseline e `migrate()` no boot com lock
- [ ] `lib/dominio` com testes Vitest; cópias removidas de front e API
- [ ] Cifra AES-256-GCM e migração das colunas de senha; revelação auditada
- [ ] Usuários com papéis (`admin`, `contador`, `auxiliar`), rota e tela de usuários, `atualizado_por` nas escritas, tabela `auditoria`
- [ ] Tabela `arquivos` + `Armazenamento` (R2 real, memória para testes) + upload por URL assinada
- [ ] Tabela `avisos` + `Mensageiro` (Resend real, tabela para testes) + pg-boss + `POST /jobs/executar`
- [ ] CI completo em GitHub Actions; ESLint; Prettier; `strict`
- [ ] Catálogo padrão completo (8.6) e vínculo automático por regime
- [ ] Sessão com hash do token, inatividade, troca de senha, esqueci a senha
- [ ] Contrato endurecido (integer, faixas, date, pattern, schema `Erro`)

### Fase 2 — Profissionalizar (2 sprints)

- [ ] Inativar em vez de excluir; `ativo` de tipos exposto
- [ ] Sincronizar competência
- [ ] Pendências com `emitido` vencido; marcar pago grava data; PATCH parcial
- [ ] Painel de alertas completo
- [ ] Notificações automáticas ao cliente (emitido, D-3, honorário vencido) com preferência por cliente
- [ ] Envio de guias com protocolo e avanço automático para `enviado`
- [ ] Produtividade por colaborador e histórico de alterações
- [ ] Camada de serviço na API; testes de integração com supertest
- [ ] Paginação e busca no servidor
- [ ] Staging, backup diário cifrado, restore testado, runbook
- [ ] Observabilidade: request id, contaId no log, Sentry, monitor externo

### Fase 3 — Paridade com concorrentes (3 sprints)

- [ ] Portal do cliente: acesso por link mágico, guias, ciente, envio de documentos, honorários, pedidos
- [ ] Cobrança automática com Asaas (ou Efí): link e QR nos pagamentos, webhook, mensagem com link
- [ ] WhatsApp Cloud API oficial com modelos aprovados; `wa.me` como reserva
- [ ] Baixa automática por leitura de PDF com fila de revisão
- [ ] NFS-e do honorário via Focus NFe (opcional, por conta)
- [ ] Refatoração do front: componentes compartilhados, páginas < 300 linhas, `components/ui` decidido
- [ ] Multitenant e2e cobrindo portal, webhooks, credenciais, débitos, processos, pagamentos

### Fase 4 — Diferenciação (backlog)

- [ ] Serpro Integra Contador: situação fiscal, DAS e DARF atualizados, procurações, caixa postal
- [ ] Certidões (CND federal, estadual, municipal, CRF do FGTS, trabalhista) com validade e alerta, via Infosimples ou Serpro
- [ ] Reajuste em lote, 13º de honorário, cobrança de serviço avulso, relatórios de faturamento e inadimplência
- [ ] Integração com Omie (importar clientes); importação por planilha robusta para Contmatic e Alterdata
- [ ] Busca de NF-e na SEFAZ com certificado A1 cifrado
- [ ] Row-Level Security por `conta_id`
- [ ] Superadmin para criar e desativar contas; cobrança do próprio ContaFácil por conta (se virar produto)

---

## 8. Especificações técnicas

### 8.1 Tabelas novas e alteradas

Todas com `id serial`, `conta_id integer not null references contas(id)`, `criado_em timestamptz default now()`, e índice em `(conta_id, ...)` conforme a consulta principal.

| Tabela | Colunas principais | Índices |
| --- | --- | --- |
| `usuarios` (alterada) | `papel usuario_papel not null default 'contador'` (`admin`, `contador`, `auxiliar`), `email`, `ultimo_acesso_em`, `senha_alterada_em` | `(conta_id, ativo)` |
| `tentativas_login` | `login`, `ip`, `sucesso boolean`, `quando` | `(login, quando)`, `(ip, quando)` |
| `sessoes` (alterada) | `token_hash` no lugar de `token`, `ultimo_uso_em` | `(usuario_id)` |
| `auditoria` | `usuario_id`, `acao` (`revelar_senha`, `exportar_csv`, `login`, `alterar`), `entidade`, `entidade_id`, `campo`, `de`, `para`, `ip`, `quando` | `(conta_id, quando)`, `(entidade, entidade_id)` |
| `arquivos` | `cliente_id null`, `entidade` (`checklist_item`, `processo`, `pagamento`, `cliente`, `certidao`, `solicitacao`), `entidade_id`, `nome`, `mime`, `tamanho`, `chave` (caminho no R2: `conta/{contaId}/{uuid}`), `sha256`, `enviado_por` (usuário ou `portal`), `origem` (`escritorio`, `portal`, `robo`) | `(conta_id, entidade, entidade_id)`, `(cliente_id)` |
| `avisos` | `cliente_id`, `canal` (`email`, `whatsapp`, `portal`), `destino`, `modelo`, `assunto`, `corpo`, `status` (`pendente`, `enviado`, `entregue`, `lido`, `falhou`), `tentativas`, `provedor_id`, `erro`, `enviado_em`, `referencia_entidade`, `referencia_id` | `(conta_id, status)`, `(provedor_id)` |
| `protocolos` | `arquivo_id`, `cliente_id`, `checklist_item_id null`, `canal`, `token_hash`, `expira_em`, `enviado_em`, `visualizado_em`, `ip_visualizacao` | `(cliente_id)`, `(token_hash)` |
| `acessos_cliente` | `cliente_id`, `email`, `token_hash`, `expira_em`, `usado_em` | `(email)`, `(token_hash)` |
| `sessoes_cliente` | `cliente_id`, `token_hash`, `expira_em`, `ultimo_uso_em` | `(token_hash)` |
| `solicitacoes` | `cliente_id`, `tipo` (`documento`, `informacao`), `descricao`, `prazo`, `status`, `respondida_em`, `criada_por` | `(conta_id, status)` |
| `pagamentos` (alterada) | `cobranca_externa_id`, `link_pagamento`, `qr_pix`, `nfse_numero`, `nfse_arquivo_id`, `origem` (`competencia`, `avulso`, `decimo_terceiro`) | `(conta_id, status, vencimento)` |
| `eventos_webhook` | `provedor`, `evento_id`, `tipo`, `payload jsonb`, `processado_em` | único `(provedor, evento_id)` |
| `regras_identificacao` | `tipo_obrigacao_id`, `padrao` (regex), `prioridade` | `(conta_id)` |
| `certidoes` | `cliente_id`, `tipo` (`cnd_federal`, `cnd_estadual`, `cnd_municipal`, `crf_fgts`, `cndt`), `situacao`, `emitida_em`, `validade`, `arquivo_id`, `consultada_em`, `erro` | `(conta_id, validade)` |
| `tipos_obrigacao` (alterada) | `vincular_automatico boolean default true`, `descricao` | |
| `clientes` (alterada) | `senha_gov_cifrada`, `senha_nfse_cifrada` (remover as antigas após backfill), `forma_envio` vira enum (`email`, `whatsapp`, `portal`, `nenhum`), `procuracao_validade date`, `certificado_arquivo_id`, `certificado_validade`, `certificado_senha_cifrada` | `(conta_id, ativo)` |
| `contas` (alterada) | `chave_pix`, `logo_arquivo_id`, `configuracoes_cobranca jsonb` (provedor, dias para cobrar, mensagem) | |
| `debitos` (alterada) | `competencia_ano`, `competencia_mes`, `parcelas_total`, `parcelas_pagas` | `(conta_id, status)` |

### 8.2 Rotas novas no OpenAPI

| Método e caminho | Papel mínimo | Descrição |
| --- | --- | --- |
| `POST /auth/trocar-senha`, `POST /auth/esqueci`, `POST /auth/redefinir`, `POST /auth/sair-de-todos` | qualquer / público | Ciclo de senha e sessões |
| `GET/POST/PATCH /usuarios`, `DELETE /usuarios/:id` | admin | Gestão de usuários da conta |
| `GET /clientes/opcoes` | qualquer | Lista leve para dropdowns |
| `GET /clientes/:id/senhas`, `GET /credenciais/:id/revelar` | contador | Revelação auditada |
| `POST /competencias/:id/sincronizar` | contador | Cria itens e pagamentos faltantes |
| `POST /arquivos/upload-url`, `POST /arquivos`, `GET /arquivos/:id/download-url`, `DELETE /arquivos/:id` | auxiliar | Upload direto ao R2 e registro |
| `POST /checklist/:id/enviar` | auxiliar | Gera protocolo, dispara aviso, avança status |
| `GET /avisos`, `POST /avisos/reenviar/:id` | contador | Fila de avisos e reenvio |
| `GET /auditoria` | admin | Histórico filtrável |
| `GET /produtividade` | contador | Itens por usuário, atrasos por cliente, tempo médio |
| `POST /pagamentos/:id/cobrar` | contador | Cria cobrança no provedor e devolve link |
| `POST /pagamentos/reajuste`, `POST /pagamentos/decimo-terceiro`, `POST /pagamentos/avulso` | admin | Financeiro |
| `POST /arquivos/identificar` | auxiliar | Enfileira leitura de PDFs em lote |
| `GET /revisoes`, `PATCH /revisoes/:id` | auxiliar | Fila de PDFs não identificados |
| `GET/POST /certidoes`, `POST /certidoes/consultar` | contador | Certidões e consulta via provedor |
| `POST /jobs/executar` | token de serviço | Gatilho do worker |
| `POST /webhooks/asaas`, `POST /webhooks/whatsapp`, `GET /webhooks/whatsapp` (verificação) | assinatura | Eventos externos |
| `POST /portal/entrar`, `GET /portal/eu`, `GET /portal/guias`, `POST /portal/guias/:id/ciente`, `GET /portal/honorarios`, `GET /portal/solicitacoes`, `POST /portal/solicitacoes/:id/arquivos`, `GET/POST /portal/pedidos` | sessão de cliente | Portal |
| `GET /protocolo/:token` | público com token | Abre o arquivo e registra visualização |

Cada rota entra no `openapi.yaml` com `tags`, `summary` em português, schemas de entrada e saída e respostas de erro tipadas.

### 8.3 Interfaces de serviços externos

```ts
// artifacts/api-server/src/servicos/externos/tipos.ts
export interface Armazenamento {
  urlUpload(chave: string, mime: string, tamanho: number): Promise<{ url: string; expiraEm: Date }>;
  urlDownload(chave: string, nomeArquivo: string): Promise<{ url: string; expiraEm: Date }>;
  remover(chave: string): Promise<void>;
}

export interface Mensageiro {
  enviarEmail(m: { para: string; assunto: string; html: string; texto: string; anexos?: Anexo[] }): Promise<{ id: string }>;
  enviarWhatsapp(m: { para: string; modelo: string; variaveis: string[]; arquivoUrl?: string }): Promise<{ id: string }>;
}

export interface Cobrador {
  criarCobranca(c: { clienteExternoId: string; valor: string; vencimento: string; descricao: string; formas: ("pix" | "boleto" | "cartao")[] }): Promise<{ id: string; link: string; qrPix?: string }>;
  cancelar(id: string): Promise<void>;
  garantirCliente(c: { nome: string; cnpj: string; email?: string; telefone?: string }): Promise<{ id: string }>;
}

export interface EmissorNota {
  emitir(n: { tomador: Tomador; valor: string; descricao: string; competencia: string }): Promise<{ numero: string; pdfUrl: string }>;
}

export interface ConsultaFiscal {
  situacaoFiscal(cnpj: string): Promise<SituacaoFiscal>;
  certidao(cnpj: string, tipo: TipoCertidao): Promise<{ situacao: string; validade: string; pdf: Buffer }>;
  dasAtualizado(cnpj: string, competencia: string): Promise<{ pdf: Buffer; vencimento: string; valor: string }>;
}
```

Implementações: `r2.ts` (`@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner`), `resend.ts`, `whatsapp-cloud.ts`, `asaas.ts`, `focus-nfe.ts`, `serpro.ts`, `infosimples.ts`, e `memoria.ts` para cada interface, usada nos testes e no dev sem credenciais. Seleção por variável de ambiente; sem credencial, cai na implementação de memória com aviso no log.

### 8.4 Detalhamento das funcionalidades de paridade

**Notificações automáticas.** Gatilhos registrados nos serviços: `checklist.status → emitido` (aviso "guia disponível" se `forma_envio` do cliente for e-mail ou WhatsApp e houver arquivo anexado), job diário `vencimentos-d3` (itens com vencimento em 3 dias e status ≠ enviado), job diário `honorarios-vencidos` (pagamentos vencidos há N dias configuráveis, sem cobrança nos últimos 7 dias). Modelos em `lib/dominio/modelos.ts` com `montarMensagem`. Cada aviso vira linha em `avisos` e um job `avisos.enviar`. Preferência por cliente e opção de silenciar.

**Envio de guias com protocolo.** `POST /checklist/:id/enviar` exige arquivo anexado; cria `protocolos` com token aleatório de 32 bytes (guardado como hash), envia aviso com `URL_PUBLICA/protocolo/{token}`; `GET /protocolo/:token` valida hash e validade, registra `visualizado_em` e IP na primeira abertura, redireciona para a URL assinada do R2. O item avança para `enviado` no envio (não na visualização), e a tela mostra "visualizado em" quando houver.

**Portal do cliente.** Segunda área do mesmo app Vite em `/portal` com layout próprio e sem o menu do escritório. `POST /portal/entrar` recebe e-mail, cria `acessos_cliente` com token de 30 min e envia o link; abrir o link cria `sessoes_cliente` (cookie `contafacil_portal`, httpOnly, 7 dias). Middleware `exigirSessaoCliente` põe `req.cliente` e todas as consultas filtram por `cliente_id`. Telas: Guias (itens `emitido`/`enviado` com arquivo, botão Ciente que gera protocolo), Honorários (com link de pagamento), Solicitações (enviar documentos pedidos pelo escritório), Pedidos (cria `processos` de categoria `pedido`). Sem portal para MEI sem e-mail: a contadora pode gerar o link manualmente.

**Cobrança automática.** Ao abrir competência (ou ao clicar Cobrar), o serviço garante o cliente no provedor e cria a cobrança com vencimento e valor; grava `cobranca_externa_id`, `link_pagamento`, `qr_pix`. Webhook `PAYMENT_RECEIVED`/`PAYMENT_CONFIRMED` (Asaas) marca `pago`, `dataPagamento`, `forma`; idempotência por `evento_id`. Cancelar cobrança ao marcar isento. A mensagem de cobrança passa a incluir `{link_pagamento}`. Alternativas documentadas: Efí (Pix ~1,19%, boleto ~R$ 3,45) e Banco Inter (API Pix sem mensalidade, exige conta PJ). Preços aproximados.

**NFS-e.** Após `pago`, job `nfse.emitir` chama `EmissorNota` com os dados do Perfil (CNPJ, IM) e do cliente; guarda `nfse_numero` e o PDF em `arquivos`. Provedor sugerido: Focus NFe (plano Solo ~R$ 89,90/mês, aproximado). Ativação por conta.

**WhatsApp oficial.** Cloud API da Meta: empresa verificada, número dedicado, modelos aprovados na categoria utilidade para "guia disponível", "vencimento em 3 dias" e "honorário em aberto". Custo por mensagem de utilidade ~US$ 0,0068 (aproximado). `GET /webhooks/whatsapp` responde ao desafio de verificação; `POST` valida `X-Hub-Signature-256`, atualiza `avisos.status` (enviado, entregue, lido) e registra respostas do cliente como `solicitacoes` de tipo `mensagem`. `wa.me` continua disponível quando a conta não tem a API configurada.

**Baixa automática por leitura de PDF.** Upload em lote pela tela do checklist; cada arquivo vira job `leitura-pdf`. O worker extrai texto com `pdf-parse`; se vazio, `tesseract.js` em português. Identificação: CNPJ por regex `\d{2}\.?\d{3}\.?\d{3}/?\d{4}-?\d{2}` cruzado com `clientes`; competência por `\b(0[1-9]|1[0-2])/(20\d{2})\b`; tipo por `regras_identificacao` (padrões iniciais: `DCTFWeb|Recibo de Entrega.*DCTF`, `PGDAS-D|Programa Gerador do DAS`, `EFD-Reinf`, `EFD ICMS`, `EFD-Contribuições`, `eSocial`, `FGTS Digital`, `DEFIS`, `ECF`, `ECD`). Encontrando cliente + competência + tipo, anexa ao item e avança para `emitido` (ou `enviado` se for recibo de entrega). Caso contrário, cria `revisoes` para escolha manual. Nunca sobrescreve um item já `enviado`.

**Produtividade e auditoria.** As rotas de escrita gravam `atualizado_por` e uma linha em `auditoria` com `de`/`para`. `GET /produtividade` agrega por usuário e mês: itens levados a `enviado`, itens em atraso no momento do envio, tempo médio entre `emitido` e `enviado`; por cliente: obrigações atrasadas nos últimos 6 meses. Tela com recharts.

**Robô de CND e Serpro.** Interface `ConsultaFiscal` com duas implementações: `infosimples.ts` (CND federal, estadual, municipal; preço sob consulta) e `serpro.ts` (Integra Contador: contratação na Loja Serpro com e-CNPJ do escritório; procuração eletrônica de cada cliente; serviços de situação fiscal, DAS, DCTFWeb, MIT, DARF, procurações e caixa postal; cobrado por requisição, entre R$ 1,34 e R$ 4,96 conforme o serviço, aproximado). Job mensal `certidoes.consultar` para clientes ativos; alertas no Painel 30 dias antes da validade. O certificado e-CNPJ do escritório fica em `arquivos` cifrado e a senha em `contas.certificado_senha_cifrada`.

**Integração contábil.** `POST /clientes/importar` aceita XLSX/CSV (parser robusto com `xlsx` ou `exceljs`, não regex), com prévia, normalização de CNPJ, transação e relatório. Conector Omie (`GET /clientes` da API Omie) como primeira integração real. Onvio/Domínio só sob demanda: a API pública é voltada a ERPs homologados que enviam documentos fiscais.

### 8.5 Jobs e agendamento

| Job | Frequência | O que faz |
| --- | --- | --- |
| `avisos.enviar` | contínuo (fila) | Envia e-mail ou WhatsApp, atualiza status, até 5 tentativas com backoff |
| `vencimentos-d3` | diário 07:00 | Cria avisos de vencimento em 3 dias |
| `honorarios-vencidos` | diário 09:00 | Cria avisos de cobrança conforme `configuracoes_cobranca` |
| `abrir-competencia` | dia 1 às 06:00 | Abre o mês para contas com `abertura_automatica = true` |
| `leitura-pdf` | fila | Identifica e anexa PDFs |
| `nfse.emitir` | fila | Emite NFS-e após pagamento |
| `certidoes.consultar` | mensal | Consulta certidões dos clientes ativos |
| `limpeza` | diário 03:00 | Sessões vencidas, tokens usados, eventos de webhook antigos, avisos com mais de 1 ano |
| `backup` | diário 02:00 | `pg_dump` cifrado para o R2 |

Gatilho: `POST /jobs/executar` com `Authorization: Bearer ${TOKEN_JOBS}`, chamado a cada 5 minutos por Scheduled Deployment do Replit; o handler inicia o pg-boss, processa por até 4 minutos e encerra. Em ambiente com processo permanente (Docker), o worker roda como processo separado (`node dist/worker.mjs`).

### 8.6 Catálogo padrão de referência

Valores de partida para `lib/db/src/tipos-padrao.ts`. **Validar com a contadora responsável antes de gravar**: prazos mudam por legislação, por UF e por município, e vários caem no dia útil anterior quando o dia é fim de semana. `offsetMes` conta a partir do mês de competência; `diaVencimento` 31 significa último dia do mês (o `calcularVencimento` já ajusta).

| Obrigação | Periodicidade | Mês ref. | Dia | Offset | Regimes | Observação |
| --- | --- | --- | --- | --- | --- | --- |
| DAS (Simples Nacional) | mensal | — | 20 | 1 | simples | Guia mensal |
| PGDAS-D | mensal | — | 20 | 1 | simples | Declaração que gera o DAS |
| DAS-MEI | mensal | — | 20 | 1 | mei | |
| DEFIS | anual | 3 | 31 | 0 | simples | Ano-calendário anterior |
| DASN-SIMEI | anual | 5 | 31 | 0 | mei | Declaração anual do MEI |
| DCTFWeb (com MIT) | mensal | — | 25 | 1 | simples, presumido, real | Prazo passou ao dia 25 a partir de 2025; confirmar |
| eSocial (fechamento periódico) | mensal | — | 15 | 1 | todos com empregados | |
| FGTS Digital | mensal | — | 20 | 1 | todos com empregados | |
| INSS (DARF da DCTFWeb) | mensal | — | 20 | 1 | todos com empregados | |
| IRRF | mensal | — | 20 | 1 | presumido, real | |
| EFD-Reinf | mensal | — | 15 | 1 | presumido, real, simples com retenções | |
| EFD ICMS/IPI | mensal | — | 20 | 1 | presumido, real | Dia varia por UF |
| EFD-Contribuições | mensal | — | 10 | 2 | presumido, real | 10º dia útil do 2º mês; usar 14 como aproximação e ajustar |
| PIS/COFINS (DARF) | mensal | — | 25 | 1 | presumido, real | |
| IRPJ/CSLL (trimestral) | trimestral | 3 | 31 | 1 | presumido, real | Último dia útil do mês seguinte ao trimestre |
| ECF | anual | 7 | 31 | 0 | presumido, real | Último dia útil de julho |
| ECD | anual | 5 | 31 | 0 | presumido, real | Último dia útil de maio; frequentemente prorrogada |
| DIRPF dos sócios | anual | 5 | 31 | 0 | todos | Por sócio, não por empresa; avaliar cadastro de sócios |
| ISS (guia municipal) | mensal | — | 10 | 1 | todos prestadores | Dia varia por município |
| Declaração municipal de serviços (DES/DMS) | mensal | — | 10 | 1 | todos prestadores | Nome e dia variam por município |
| DeSTDA | mensal | — | 28 | 1 | simples com ICMS | Substituição tributária e DIFAL |
| DIFAL | mensal | — | 15 | 1 | simples, presumido, real | Conforme UF |
| GIA (SP) | mensal | — | 20 | 1 | presumido, real | Só SP; outros estados têm equivalentes |
| Balancete | mensal | — | 31 | 1 | presumido, real | Controle interno |
| Folha de pagamento | mensal | — | 5 | 1 | todos com empregados | Pagamento de salários |
| Pró-labore | mensal | — | 5 | 1 | todos | |
| Parcelamento | mensal | — | 31 | 0 | todos | Só para clientes com parcelamento ativo; `vincular_automatico = false` |
| DIMOB / DMED | anual | 2 | 28 | 0 | setores específicos | `vincular_automatico = false` |
| Alvará e licenças | anual | — | — | — | todos | Data por cliente; melhor como campo em `clientes` |
| Certidões (CND, CRF, CNDT) | controle | — | — | — | todos | Tratar em `certidoes`, não no checklist |

Remover "ECB" (sem correspondência). "MIT" passa a ser parte da DCTFWeb. "SEDIF" (DeSTDA) mantida com o nome correto. "REINF" vira "EFD-Reinf".

### 8.7 Módulo de domínio: assinaturas

```ts
// lib/dominio/src/data.ts
export function hojeBR(agora = new Date()): string; // 'YYYY-MM-DD' em America/Sao_Paulo
export function mesAtualBR(agora = new Date()): { ano: number; mes: number };

// lib/dominio/src/moeda.ts
export function paraNumeroBR(texto: string): number | null;   // aceita "1.234,56", "1234,56", "1234.56", "R$ 350,00"
export function paraDecimalAPI(texto: string): string | null; // "350.00"
export function formatarMoeda(valor: string | number | null): string; // "R$ 350,00"

// lib/dominio/src/prazos.ts
export function calcularVencimento(ano: number, mes: number, dia: number | null, offsetMes: number): string | null;
export function diasAtraso(vencimento: string, hoje: string): number;
export function aplicaNoMes(periodicidade: Periodicidade, mesReferencia: number | null, mes: number): boolean;

// lib/dominio/src/ferias.ts
export function comVencimento(linha: LinhaFerias, hoje: string): LinhaFerias & { limiteGozo: string; vencendo: boolean; vencida: boolean };

// lib/dominio/src/documentos.ts
export function cnpjValido(v: string): boolean;
export function cpfValido(v: string): boolean;
export function normalizarCnpj(v: string): string; // só dígitos
export function formatarCnpj(v: string): string;
```

---

## 9. Requisitos de segurança e LGPD (resumo executável)

- Dados pessoais tratados: CPF de sócios e funcionários, salários, e-mails, telefones, senhas de portais de terceiros. Base legal: execução de contrato (escritório × cliente) e obrigação legal. Retenção: enquanto o cliente estiver ativo e por 5 anos após, salvo prazo legal maior.
- Segredos cifrados em repouso com chave fora do banco; rotação documentada no runbook; revelação auditada.
- Acesso mínimo por papel; auxiliar não vê senhas nem honorários; superadmin não vê dados de cliente sem registro em auditoria.
- Transporte só por HTTPS com HSTS; cookies `secure`, `httpOnly`, `sameSite=lax`; portal com cookie separado.
- Backups cifrados; restore testado; exclusão com anonimização.
- Incidente: runbook com passos de contenção (rotacionar chave, invalidar sessões, notificar titulares em até 72 h quando aplicável).

---

## 10. Estratégia de testes (resumo executável)

| Camada | Ferramenta | Onde | O que cobre |
| --- | --- | --- | --- |
| Unitário | Vitest | `lib/dominio`, `servicos/*` com `db` falso | Regras puras, modelos de mensagem, identificação de PDF |
| Integração de API | Vitest + supertest + Postgres efêmero | `artifacts/api-server/test` | Transações, 409, multitenant gerado a partir do OpenAPI, webhooks, portal |
| E2E | Playwright | `artifacts/gestao-contabil/e2e` | Jornadas, telas, portal, acessibilidade (axe) |
| Contrato | Middleware em dev/teste | API | Resposta bate com `*Response` gerado |
| Segurança | `pnpm audit --prod`, teste de rate limit, teste de CSV | CI | Dependências e borda |

Regra: bug corrigido = teste de regressão no nível mais baixo que o reproduz.

---

## 11. Operação (resumo executável)

- **Ambientes:** dev local (Docker Postgres), workspace Replit (banco de dev), staging (cópia anonimizada), produção. `E2E_DATABASE_URL` sempre separada.
- **Release:** PR → CI verde → merge → deploy → `migrate()` no boot com lock → smoke automático em `/readyz` e `/painel` com conta de monitoramento.
- **Observabilidade:** request id, `contaId` no log, Sentry, monitor externo, métricas de fila.
- **Backup:** diário cifrado, 30 dias, restore mensal testado.
- **Runbook:** `docs/RUNBOOK.md` com dev local, deploy, migration, criar conta, restaurar backup, rotacionar chave, incidente.

---

## 12. Métricas de sucesso do plano

| Métrica | Hoje | Meta ao fim da Fase 2 | Meta ao fim da Fase 3 |
| --- | --- | --- | --- |
| Riscos críticos ou altos abertos | 8 | 0 | 0 |
| Endpoints sem teste | 13 de 61 | 0 | 0 |
| Testes unitários | 0 | ≥ 80 | ≥ 150 |
| Tempo para publicar coluna nova em produção | manual, sem trilha | 1 deploy | 1 deploy |
| Obrigações com vencimento nulo em conta nova | 100% | 0% | 0% |
| Guias enviadas com protocolo | 0% | ≥ 80% | ≥ 95% |
| Honorários recebidos em até 10 dias | não medido | medido | ≥ 70% |
| Senhas de terceiros em texto puro | 100% | 0% | 0% |

---

## 13. Decisões em aberto (responder antes da Fase 1)

1. O ContaFácil vira produto para vários escritórios ou continua interno? Define superadmin, cobrança por conta e prioridade do portal.
2. Provedor de cobrança: Asaas, Efí ou Banco Inter? Depende de onde o escritório tem conta e das tarifas vigentes.
3. WhatsApp oficial desde a Fase 3 ou manter `wa.me` até haver volume?
4. Serpro Integra Contador: o escritório tem e-CNPJ e está disposto a coletar procurações eletrônicas dos clientes?
5. Fuso único `America/Sao_Paulo` para todas as contas ou fuso por conta?
6. Excluir cliente vira inativar em todos os casos, ou admin pode apagar cliente sem histórico?
7. `components/ui`: adotar shadcn de verdade ou remover?
8. Sair do Replit em algum horizonte? Muda worker (processo permanente), roteamento e overrides de plataforma.
9. Quem valida o catálogo padrão da seção 8.6 e com que frequência ele é revisado?

---

## 14. Formato de resposta esperado do agente

Para cada fase pedida, responder nesta ordem:

1. **Plano de PRs** numerado, cada PR com: título, arquivos que toca, migration (se houver), testes que adiciona, risco e como reverter.
2. **Perguntas bloqueantes**, só as que impedem a primeira PR; as demais viram assunções explícitas.
3. **Execução**, PR a PR: código, testes, atualização de `openapi.yaml` e codegen, atualização de `replit.md`, checklist da seção 7 marcado.
4. **Relatório final da fase**: o que foi entregue, o que ficou de fora e por quê, métricas da seção 12 medidas, próximos passos.

Definição de pronto de uma PR: CI verde; contrato atualizado; migration revisada; teste de regressão para todo bug; nenhuma nova cópia de regra de negócio; nenhum segredo, hash ou dado real no diff; `replit.md` atualizado quando o comportamento muda.

---

## Anexo A — Arquivos-chave por assunto

| Assunto | Arquivos |
| --- | --- |
| Abertura de competência, periodicidade, vencimento | `artifacts/api-server/src/routes/competencias.ts` |
| Pendências e cobrança | `artifacts/api-server/src/routes/pendencias.ts`, `artifacts/gestao-contabil/src/pages/Pendencias.tsx`, `src/lib/whatsapp.ts` |
| Sessão e login | `artifacts/api-server/src/lib/sessao.ts`, `routes/auth.ts`, `middlewares/autenticacao.ts`, `lib/db/src/senha.ts` |
| Isolamento de tenant | `artifacts/api-server/src/lib/escopo.ts`, `routes/etapas.ts`, `routes/index.ts` |
| Erros | `artifacts/api-server/src/middlewares/error-handler.ts`, `lib/http.ts` |
| Schema e instalação | `lib/db/src/schema/schema.ts`, `lib/db/src/instalacao.ts`, `lib/db/src/seed/gerado.ts`, `lib/db/drizzle.config.ts` |
| Catálogo | `lib/db/src/tipos-padrao.ts`, `lib/db/scripts/seed-tipos.ts`, `lib/db/scripts/criar-conta.ts` |
| Contrato e codegen | `lib/api-spec/openapi.yaml`, `lib/api-spec/orval.config.ts`, `lib/api-zod/src/generated/api.ts`, `lib/api-client-react/src/custom-fetch.ts` |
| Moeda (bug) | `pages/Clientes.tsx`, `DadosCadastrais.tsx`, `Atrasos.tsx`, `CompetenciaPagamentos.tsx`, `Despesas.tsx`, `Folha.tsx`, `FuncionarioDetalhe.tsx`, `Funcionarios.tsx` |
| Datas e fuso | `src/lib/processo.ts`, `pages/Atrasos.tsx`, `DadosCadastrais.tsx`, `Despesas.tsx`, `Folha.tsx`, `Competencias.tsx`, `routes/processos.ts`, `routes/pendencias.ts` |
| Férias e folha | `artifacts/api-server/src/lib/pessoal.ts`, `routes/ferias.ts`, `routes/folha.ts`, `src/lib/pessoal.ts` |
| E2E | `artifacts/gestao-contabil/e2e/*.spec.ts`, `global-setup.ts`, `auth.setup.ts`, `playwright.config.ts` |
| Deploy | `.replit`, `artifacts/*/.replit-artifact/artifact.toml`, `artifacts/api-server/build.mjs`, `scripts/post-merge.sh`, `pnpm-workspace.yaml` |
| Backup a reaproveitar | `.migration-backup/gestao-contabil/src/lib/prazos.test.ts`, `whatsapp.test.ts`, `drizzle/`, `scripts/marcar-migration-aplicada.ts` |

## Anexo B — Bugs conhecidos com localização

| # | Bug | Onde | Gravidade |
| --- | --- | --- | --- |
| 1 | Honorário ×100 ao reeditar cliente | `Clientes.tsx` (defaultValue cru + parse que remove pontos); mesmo padrão em `DadosCadastrais.tsx`, `Atrasos.tsx`, `CompetenciaPagamentos.tsx` | Crítica |
| 2 | Abrir competência sem transação; corrida vira 500 | `routes/competencias.ts` | Alta |
| 3 | `POST /clientes` com `id` e sem `obrigacoes` desvincula tudo | `routes/clientes.ts` | Alta |
| 4 | `PATCH /pagamentos/:id` substitui o registro | `routes/pagamentos.ts` | Média |
| 5 | Pendências ignoram `emitido` vencido; item reaparece ao marcar o último | `routes/pendencias.ts`, `pages/Pendencias.tsx` | Média |
| 6 | Modelo de WhatsApp com `defaultValue` sobrescreve o salvo | `pages/Pendencias.tsx` | Média |
| 7 | Férias: 29/02 transborda; sem estado vencida | `api-server/src/lib/pessoal.ts` | Média |
| 8 | Telefone com zero antes do DDD gera número errado | `src/lib/whatsapp.ts` | Média |
| 9 | Hoje em UTC | seis telas e `routes/processos.ts`, `routes/pendencias.ts` | Média |
| 10 | Checklist copia estado do servidor para `useState` | `pages/CompetenciaChecklist.tsx` | Média |
| 11 | Erro lido no formato do axios | `pages/Competencias.tsx` | Baixa |
| 12 | `PATCH /folha/:id` e `PATCH /ferias/:id` sem uso | `routes/folha.ts`, `routes/ferias.ts` | Baixa |
| 13 | Trace do Playwright nunca gravado | `playwright.config.ts` | Baixa |

## Anexo C — Glossário

- **Competência:** o mês de referência das obrigações (ano/mês).
- **Checklist:** grade cliente × obrigação de uma competência; cada célula é um `checklist_item`.
- **Guia:** documento de arrecadação (DAS, DARF, GPS) ou declaração entregue ao cliente.
- **Protocolo:** registro de que uma guia foi enviada e, se houver, visualizada pelo cliente.
- **Pendências:** obrigações e honorários atrasados do escritório. Não confundir com **Guias em atraso** (débitos do cliente com o fisco).
- **Conta:** o escritório contábil (tenant). **Cliente:** empresa atendida pelo escritório.
- **Portal:** área do cliente, com sessão própria e escopo de um único cliente.
- **Worker:** processo que executa jobs da fila pg-boss; no Replit, roda dentro da API por disparo agendado.
