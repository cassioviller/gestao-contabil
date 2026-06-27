# Prazos, atrasos e cobrança por WhatsApp — Design

**Data:** 2026-06-27
**Projeto:** gestao-contabil (Next.js 16 + Postgres/Drizzle)
**Status:** aprovado para planejamento

## Objetivo

Dar ao escritório contábil controle de **prazos de entrega** das obrigações e dos
honorários, detectar automaticamente o que está **em atraso**, e facilitar a
**cobrança de inadimplentes via WhatsApp**. Tudo integrado ao fluxo atual de
competências mensais, sem libs externas e sem APIs pagas.

O roadmap é dividido em 3 peças com dependência natural:
**(1) datas → (2) detecção de atraso → (3) tela de pendências + WhatsApp.**

## Contexto do app atual

- `clientes` — cadastro fixo (razão social, CNPJ, forma de envio, honorário, ativo).
- `tipos_obrigacao` — catálogo (DAS, DEFIS, INSS, FGTS…).
- `cliente_obrigacoes` — quais obrigações cada cliente tem.
- `competencias` — cada mês de trabalho.
- `checklist_itens` — uma obrigação de um cliente num mês (status: pendente/feito/nao_aplica).
- `pagamentos` — honorário de um cliente num mês (status: pendente/pago/isento).

Ao "abrir uma competência" (`abrirCompetencia` em `acoes.ts`), o sistema já gera
automaticamente o checklist e os pagamentos dos clientes ativos. As datas e os
atrasos se encaixam exatamente nesse ponto de geração.

Padrões a seguir: leituras em `src/lib/consultas.ts`, mutações em
`src/lib/acoes.ts`, telas como Server Components com pequenos Client Components
para interação, migrations via Drizzle em `drizzle/`.

---

## Peça 1 — Datas de entrega/vencimento

### Mudanças no schema (`src/db/schema.ts`)

**`tipos_obrigacao`** — novos campos:

- `dia_vencimento` — `integer`, nullable. Dia do mês (1–31) em que a obrigação vence.
- `offset_mes` — `integer`, not null, default `1`. Quantos meses após a competência
  cai o vencimento. `0` = mesmo mês; `1` = mês seguinte (padrão, caso mais comum
  na contabilidade — ex.: DAS competência maio vence em junho).

**`clientes`** — novos campos:

- `dia_vencimento_honorario` — `integer`, nullable. Dia do mês de vencimento do
  honorário. Quando nulo, usa um fallback de código (constante `DIA_VENCIMENTO_HONORARIO_PADRAO = 10`).
- `whatsapp` — `text`, nullable. Telefone para cobrança (ver Peça 3).

**`checklist_itens`** — novo campo:

- `vencimento` — `date`, nullable. Calculado ao abrir a competência; pode ser
  sobrescrito manualmente por item.

**`pagamentos`** — novo campo:

- `vencimento` — `date`, nullable. Calculado ao abrir a competência.

### Regra de cálculo do vencimento

Função utilitária pura (nova, em `src/lib/formato.ts` ou novo `src/lib/prazos.ts`):

```
calcularVencimento(ano, mes, dia, offsetMes) -> Date | null
```

- Soma `offsetMes` ao mês da competência (rola o ano se passar de dezembro).
- Usa `dia` como dia do mês, **com clamp para o último dia** se o mês alvo for
  mais curto (ex.: dia 31 em fevereiro → 28/29).
- Retorna `null` se `dia` for nulo.

### Geração automática em `abrirCompetencia`

Ao gerar `checklist_itens`: para cada vínculo, buscar o `dia_vencimento`/`offset_mes`
do tipo de obrigação e gravar `vencimento` calculado (ou `null` se o tipo não tiver dia).

Ao gerar `pagamentos`: gravar `vencimento` = `calcularVencimento(ano, mes,
cliente.dia_vencimento_honorario ?? 10, 1)` (honorário vence no **mês seguinte**
à competência).

### Telas

- **`/tipos`** (`TiposUI.tsx`): adicionar campos "dia de vencimento" e "mês"
  (mesmo mês / mês seguinte) no formulário de tipo de obrigação.
- **`/clientes`** (`ClientesUI.tsx`): adicionar campos "WhatsApp" e
  "dia de vencimento do honorário".
- **Checklist da competência** (`ChecklistUI.tsx`): exibir a coluna/indicador de
  vencimento por item; permitir editar o vencimento de um item (nova action
  `atualizarVencimentoItem`).

### Compatibilidade

Itens e pagamentos já existentes ficam com `vencimento = null` — **não geram falso
atraso**. As datas só passam a existir para competências abertas após a mudança
(ou se preenchidas manualmente).

---

## Peça 2 — Detecção de atraso

Lógica **100% derivada de consulta** — nenhuma tabela nova, nenhum campo "marcado".

Definições (referência: data de hoje no fuso do servidor):

- **Obrigação em atraso:** `checklist_itens.status = 'pendente'`
  E `vencimento IS NOT NULL` E `vencimento < hoje`.
- **Inadimplência (pagamento):** `pagamentos.status = 'pendente'`
  E `vencimento IS NOT NULL` E `vencimento < hoje`.
- **Dias de atraso:** `hoje - vencimento` (inteiro de dias).

Novas consultas em `consultas.ts`:

- `listarObrigacoesEmAtraso({ clienteId? })` — junta cliente + tipo; retorna
  cliente, obrigação, competência (ano/mês), vencimento, dias de atraso. Ordena por
  dias de atraso desc.
- `listarInadimplentes({ clienteId? })` — junta cliente; retorna cliente,
  competência, valor, vencimento, dias de atraso, whatsapp do cliente, e se já há
  cobrança registrada no mês (ver Peça 3). Ordena por dias de atraso desc.

---

## Peça 3 — Tela de pendências + cobrança por WhatsApp

### Schema adicional

**`configuracoes`** (nova tabela, key/value reutilizável):

- `chave` — `text`, primary key.
- `valor` — `text`, not null.

Seed inicial: `modelo_whatsapp_inadimplencia` com um texto padrão, ex.:

```
Olá {cliente}, identificamos que o honorário referente a {competencia}
(venc. {vencimento}, valor {valor}) está em aberto há {dias_atraso} dias.
Poderia regularizar? Qualquer dúvida estamos à disposição.
```

**`cobrancas`** (nova tabela — histórico):

- `id` — serial, pk.
- `pagamento_id` — fk → `pagamentos.id`, on delete cascade.
- `canal` — `text`, default `'whatsapp'`.
- `enviado_em` — `timestamp` with tz, default now.

### Nova rota `/pendencias`

Server Component, adicionada ao `MenuLateral.tsx`. Duas seções:

1. **Obrigações em atraso** — tabela: cliente · obrigação · competência ·
   vencimento · dias de atraso · botão "marcar feito" (reusa `atualizarStatusItem`).
2. **Clientes inadimplentes** — tabela: cliente · competência · valor ·
   vencimento · dias de atraso · "cobrado em dd/mm" (se houver) ·
   botão "marcar pago" (reusa `atualizarPagamento`) · **botão WhatsApp**.

Filtro simples por cliente (query param `?cliente=`).

### Geração do link WhatsApp

Função utilitária pura em `src/lib/whatsapp.ts`:

- `normalizarTelefone(raw)` — remove tudo que não é dígito; se não começar com
  `55` e tiver 10–11 dígitos, prefixa `55`. Retorna `null` se inválido.
- `montarMensagem(modelo, dados)` — substitui as variáveis `{cliente}`, `{valor}`,
  `{competencia}`, `{vencimento}`, `{dias_atraso}` no modelo.
- `linkWhatsapp(telefone, mensagem)` — retorna `https://wa.me/<telefone>?text=<encodeURIComponent(mensagem)>`.

### Fluxo do botão WhatsApp (Client Component)

1. Botão renderizado apenas se o cliente tem `whatsapp` válido (senão, mostra
   aviso "sem WhatsApp cadastrado").
2. Ao clicar: chama server action `registrarCobranca(pagamentoId)` que insere em
   `cobrancas`, e em seguida abre `window.open(link, '_blank')`.
3. A tela revalida e passa a mostrar "cobrado em dd/mm".

### Edição do modelo de mensagem

Pequena seção/form na própria `/pendencias` (ou em `/tipos` como "configurações"):
textarea com o modelo atual + lista das variáveis disponíveis. Action
`salvarConfiguracao(chave, valor)`.

---

## Escopo explícito

**Incluído:**
- Dia de vencimento por tipo (com offset de mês) e por honorário do cliente.
- Cálculo automático de vencimento ao abrir competência + ajuste manual por item.
- Detecção derivada de obrigações atrasadas e inadimplentes.
- Tela `/pendencias` com as duas listas e filtro por cliente.
- Link wa.me 1-clique, modelo de mensagem editável, histórico de cobranças.

**Fora de escopo (futuro):**
- Envio automático/agendado por API paga (Z-API, Twilio, Meta).
- Cards de atraso no painel inicial e destaque inline na grade da competência.
- Avisos por e-mail, relatórios/extratos por cliente, importação do `.xlsx`.
- Controle de procurações/senhas vencendo.

## Ordem de implementação

1. Peça 1 — schema, migration, cálculo de vencimento, geração em `abrirCompetencia`, campos nas telas.
2. Peça 2 — consultas de atraso/inadimplência.
3. Peça 3 — tabelas `configuracoes`/`cobrancas`, utilitário wa.me, tela `/pendencias`, botão de cobrança.
