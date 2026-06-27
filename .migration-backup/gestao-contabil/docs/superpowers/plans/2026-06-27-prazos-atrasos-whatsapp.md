# Prazos, Atrasos e Cobrança por WhatsApp — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dar prazos de entrega às obrigações e honorários, detectar o que está em atraso, e permitir cobrar inadimplentes por WhatsApp (link wa.me) numa tela dedicada.

**Architecture:** Datas de vencimento são calculadas por uma função pura ao abrir a competência e gravadas em colunas novas; o atraso é 100% derivado em SQL (`current_date`); a tela `/pendencias` lista atrasos e monta links wa.me a partir de um modelo de mensagem editável, registrando cada cobrança. Segue os padrões do app: leituras em `consultas.ts`, mutações em `acoes.ts`, telas como Server Components + pequenos Client Components.

**Tech Stack:** Next.js 16 (App Router, Server Actions), React 19, Drizzle ORM + Postgres (node-postgres), Tailwind v4, TypeScript. Testes de funções puras via `node:test` rodado pelo `tsx` (sem libs novas).

## Global Constraints

- **Sem dependências novas.** wa.me é só um link; testes usam `node:test` (nativo) + `tsx` (já em devDependencies).
- **Next.js 16 é diferente do que você conhece.** Antes de mexer em rotas/Server Components, cheque `node_modules/next/dist/docs/` (ver `AGENTS.md`).
- **Colunas Drizzle `date` usam modo string** (`"YYYY-MM-DD"`) na leitura e na escrita. Funções e queries devem trabalhar com essas strings.
- **Idioma do código:** nomes, comentários e textos de UI em português, como no código existente.
- **Diretório de trabalho:** todos os caminhos são relativos a `gestao-contabil/`. Rode os comandos a partir de `gestao-contabil/`.
- **Compatibilidade:** itens/pagamentos antigos ficam com `vencimento = null` e NÃO podem gerar falso atraso (as queries exigem `vencimento is not null`).

---

## File Structure

**Criar:**
- `src/lib/prazos.ts` — `calcularVencimento` (pura).
- `src/lib/prazos.test.ts` — testes de `prazos.ts`.
- `src/lib/whatsapp.ts` — `MODELO_WHATSAPP_PADRAO`, `normalizarTelefone`, `montarMensagem`, `linkWhatsapp` (puras).
- `src/lib/whatsapp.test.ts` — testes de `whatsapp.ts`.
- `src/app/pendencias/page.tsx` — Server Component da tela de pendências.
- `src/app/pendencias/PendenciasUI.tsx` — Client Component (filtro, ações, botão WhatsApp, edição do modelo).
- `drizzle/0001_*.sql` — migration gerada (nome gerado pelo drizzle-kit).

**Modificar:**
- `package.json` — script `test`.
- `src/db/schema.ts` — colunas novas + tabelas `configuracoes` e `cobrancas`.
- `src/lib/acoes.ts` — geração de vencimento, `atualizarVencimentoItem`, `marcarPagamentoPago`, `registrarCobranca`, `salvarConfiguracao`, campos novos em `salvarCliente`/`salvarTipoObrigacao`.
- `src/lib/consultas.ts` — `vencimento` no checklist, `listarObrigacoesEmAtraso`, `listarInadimplentes`, `obterConfiguracao`.
- `src/app/clientes/page.tsx` + `ClientesUI.tsx` — campos WhatsApp e dia de vencimento do honorário.
- `src/app/tipos/page.tsx` + `TiposUI.tsx` — dia de vencimento e offset de mês.
- `src/app/competencias/[id]/page.tsx` + `ChecklistUI.tsx` — exibir/editar vencimento por item.
- `src/components/MenuLateral.tsx` — link `/pendencias`.

---

## Task 1: Função de cálculo de vencimento + infra de testes

**Files:**
- Create: `src/lib/prazos.ts`
- Test: `src/lib/prazos.test.ts`
- Modify: `package.json`

**Interfaces:**
- Produces: `calcularVencimento(ano: number, mes: number, dia: number | null, offsetMes: number): string | null` — retorna data ISO `"YYYY-MM-DD"` ou `null` se `dia` for nulo/0. `mes` é 1–12; `offsetMes` soma meses (rola o ano); o dia é "clampado" ao último dia do mês alvo.

- [ ] **Step 1: Adicionar o script de teste ao `package.json`**

No bloco `"scripts"`, adicione a linha `test` (mantém as demais):

```json
  "scripts": {
    "dev": "next dev -p 5000",
    "build": "next build",
    "start": "next start",
    "lint": "eslint",
    "test": "tsx --test src/lib/*.test.ts"
  },
```

- [ ] **Step 2: Escrever os testes (falhando)**

Crie `src/lib/prazos.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { calcularVencimento } from "./prazos";

test("offset 1 joga para o mês seguinte", () => {
  // competência maio/2026, dia 20, mês seguinte => 20/06/2026
  assert.equal(calcularVencimento(2026, 5, 20, 1), "2026-06-20");
});

test("offset 0 fica no mesmo mês", () => {
  assert.equal(calcularVencimento(2026, 5, 10, 0), "2026-05-10");
});

test("vira o ano quando passa de dezembro", () => {
  // dezembro/2026 + 1 mês => janeiro/2027
  assert.equal(calcularVencimento(2026, 12, 15, 1), "2027-01-15");
});

test("clampa para o último dia do mês curto", () => {
  // janeiro/2026 dia 31 + 1 mês => fevereiro só tem 28 dias
  assert.equal(calcularVencimento(2026, 1, 31, 1), "2026-02-28");
});

test("dia nulo ou zero retorna null", () => {
  assert.equal(calcularVencimento(2026, 5, null, 1), null);
  assert.equal(calcularVencimento(2026, 5, 0, 1), null);
});
```

- [ ] **Step 3: Rodar os testes e confirmar que falham**

Run: `npm test`
Expected: FAIL — erro de import/módulo `./prazos` não encontrado.

- [ ] **Step 4: Implementar `calcularVencimento`**

Crie `src/lib/prazos.ts`:

```ts
// Cálculo de datas de vencimento (puro, sem acesso a banco).
// Trabalha com datas ISO "YYYY-MM-DD" para casar com as colunas date do Drizzle.

// Dado a competência (ano/mês 1-12), o dia de vencimento e quantos meses depois
// ele cai (offsetMes: 0 = mesmo mês, 1 = mês seguinte), devolve a data ISO.
// O dia é ajustado para o último dia do mês quando o mês alvo é mais curto.
export function calcularVencimento(
  ano: number,
  mes: number,
  dia: number | null,
  offsetMes: number
): string | null {
  if (!dia || dia < 1) return null;

  // Índice de mês base-0 a partir de janeiro do ano da competência, somando o offset.
  const base = mes - 1 + offsetMes;
  const alvoAno = ano + Math.floor(base / 12);
  const alvoMes = ((base % 12) + 12) % 12; // 0..11

  // Dia 0 do mês seguinte = último dia do mês alvo.
  const ultimoDia = new Date(Date.UTC(alvoAno, alvoMes + 1, 0)).getUTCDate();
  const diaFinal = Math.min(dia, ultimoDia);

  const mm = String(alvoMes + 1).padStart(2, "0");
  const dd = String(diaFinal).padStart(2, "0");
  return `${alvoAno}-${mm}-${dd}`;
}
```

- [ ] **Step 5: Rodar os testes e confirmar que passam**

Run: `npm test`
Expected: PASS — `# pass 5  # fail 0`.

- [ ] **Step 6: Commit**

```bash
git add package.json src/lib/prazos.ts src/lib/prazos.test.ts
git commit -m "feat: função pura calcularVencimento + infra de testes"
```

---

## Task 2: Schema — colunas de vencimento + tabelas configuracoes e cobrancas

**Files:**
- Modify: `src/db/schema.ts`
- Create: `drizzle/0001_*.sql` (gerado)

**Interfaces:**
- Produces (novas colunas/tabelas usadas pelas tasks seguintes):
  - `tiposObrigacao.diaVencimento` (`integer`, nullable), `tiposObrigacao.offsetMes` (`integer`, not null default 1)
  - `clientes.diaVencimentoHonorario` (`integer`, nullable), `clientes.whatsapp` (`text`, nullable)
  - `checklistItens.vencimento` (`date`, nullable), `pagamentos.vencimento` (`date`, nullable)
  - `configuracoes { chave: text PK, valor: text not null }`
  - `cobrancas { id: serial PK, pagamentoId: int -> pagamentos.id cascade, canal: text default 'whatsapp', enviadoEm: timestamptz default now }`

- [ ] **Step 1: Adicionar colunas em `tipos_obrigacao`**

Em `src/db/schema.ts`, dentro de `tiposObrigacao`, após `ordem`:

```ts
  ordem: integer("ordem").notNull().default(0),
  // Dia do mês em que esta obrigação vence (nulo = sem prazo definido).
  diaVencimento: integer("dia_vencimento"),
  // Meses após a competência em que o vencimento cai (0 = mesmo mês, 1 = mês seguinte).
  offsetMes: integer("offset_mes").notNull().default(1),
  ativo: boolean("ativo").notNull().default(true),
```

- [ ] **Step 2: Adicionar colunas em `clientes`**

Dentro de `clientes`, após `valorHonorario`:

```ts
  valorHonorario: numeric("valor_honorario", { precision: 10, scale: 2 }),
  // Dia do mês de vencimento do honorário (nulo = usa o padrão do código).
  diaVencimentoHonorario: integer("dia_vencimento_honorario"),
  // Telefone para cobrança via WhatsApp (texto livre; normalizado na hora do link).
  whatsapp: text("whatsapp"),
  ativo: boolean("ativo").notNull().default(true),
```

- [ ] **Step 3: Adicionar `vencimento` em `checklist_itens` e `pagamentos`**

Em `checklistItens`, após `status`:

```ts
    status: statusItemEnum("status").notNull().default("pendente"),
    // Prazo de entrega; calculado ao abrir a competência, ajustável por item.
    vencimento: date("vencimento"),
    observacao: text("observacao"),
```

Em `pagamentos`, após `dataPagamento`:

```ts
    dataPagamento: date("data_pagamento"),
    // Vencimento do honorário; calculado ao abrir a competência.
    vencimento: date("vencimento"),
    forma: text("forma"), // PIX, boleto, etc.
```

- [ ] **Step 4: Adicionar as tabelas `configuracoes` e `cobrancas`**

No fim de `src/db/schema.ts`:

```ts
// ---------- Configurações e cobranças ----------

// Pares chave/valor de configuração (ex.: modelo de mensagem de cobrança).
export const configuracoes = pgTable("configuracoes", {
  chave: text("chave").primaryKey(),
  valor: text("valor").notNull(),
});

// Histórico de cobranças disparadas (uma linha por clique no botão WhatsApp).
export const cobrancas = pgTable("cobrancas", {
  id: serial("id").primaryKey(),
  pagamentoId: integer("pagamento_id")
    .notNull()
    .references(() => pagamentos.id, { onDelete: "cascade" }),
  canal: text("canal").notNull().default("whatsapp"),
  enviadoEm: timestamp("enviado_em", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
```

- [ ] **Step 5: Gerar a migration**

Run: `npx drizzle-kit generate`
Expected: cria `drizzle/0001_<nome>.sql` com os `ALTER TABLE ... ADD COLUMN` e os `CREATE TABLE configuracoes/cobrancas`, e atualiza `drizzle/meta/`.

- [ ] **Step 6: Aplicar a migration no banco**

Run: `npx drizzle-kit migrate`
Expected: aplica a `0001` (a baseline `0000` já está registrada). Sem erros.

- [ ] **Step 7: Conferir tipo do projeto**

Run: `npx tsc --noEmit`
Expected: sem erros novos relacionados ao schema.

- [ ] **Step 8: Commit**

```bash
git add src/db/schema.ts drizzle/
git commit -m "feat: colunas de vencimento e tabelas configuracoes/cobrancas"
```

---

## Task 3: Geração de vencimento ao abrir competência + ação de ajuste manual

**Files:**
- Modify: `src/lib/acoes.ts`

**Interfaces:**
- Consumes: `calcularVencimento` (Task 1); colunas de Task 2.
- Produces: `atualizarVencimentoItem(fd: FormData)` — lê `id`, `vencimento` (string ISO ou vazio = null), `competenciaId`; atualiza `checklistItens.vencimento`.

- [ ] **Step 1: Importar `calcularVencimento` e as tabelas necessárias**

No topo de `src/lib/acoes.ts`, adicione o import (as tabelas `checklistItens`, `pagamentos`, `tiposObrigacao`, `clientes`, `competencias` já estão importadas):

```ts
import { calcularVencimento } from "./prazos";
```

E, logo abaixo dos imports, uma constante:

```ts
// Dia padrão de vencimento do honorário quando o cliente não define um.
const DIA_VENCIMENTO_HONORARIO_PADRAO = 10;
```

- [ ] **Step 2: Carregar os tipos dentro de `abrirCompetencia`**

Em `abrirCompetencia`, logo após obter `ativos`/`ativosIds`, adicione:

```ts
  const ativos = await db.select().from(clientes).where(eq(clientes.ativo, true));
  const ativosIds = ativos.map((c) => c.id);

  // Mapa de tipo -> dados de vencimento, para calcular o prazo de cada item.
  const tipos = await db.select().from(tiposObrigacao);
  const tipoPorId = new Map(tipos.map((t) => [t.id, t]));
```

- [ ] **Step 3: Gravar `vencimento` ao inserir o checklist**

Substitua o `.map` do `insert(checklistItens)` por:

```ts
      await db.insert(checklistItens).values(
        vinculos.map((v) => {
          const tipo = tipoPorId.get(v.tipoObrigacaoId);
          return {
            competenciaId: comp.id,
            clienteId: v.clienteId,
            tipoObrigacaoId: v.tipoObrigacaoId,
            status: "pendente" as const,
            vencimento: tipo
              ? calcularVencimento(ano, mes, tipo.diaVencimento, tipo.offsetMes)
              : null,
          };
        })
      );
```

- [ ] **Step 4: Gravar `vencimento` ao inserir os pagamentos**

Substitua o `.map` do `insert(pagamentos)` por:

```ts
    await db.insert(pagamentos).values(
      ativos.map((c) => ({
        competenciaId: comp.id,
        clienteId: c.id,
        status: "pendente" as const,
        valor: c.valorHonorario,
        vencimento: calcularVencimento(
          ano,
          mes,
          c.diaVencimentoHonorario ?? DIA_VENCIMENTO_HONORARIO_PADRAO,
          1
        ),
      }))
    );
```

- [ ] **Step 5: Adicionar a ação de ajuste manual de prazo**

Após `atualizarStatusItem`, adicione:

```ts
export async function atualizarVencimentoItem(fd: FormData) {
  const id = Number(texto(fd, "id"));
  if (!id) return;
  await db
    .update(checklistItens)
    .set({ vencimento: texto(fd, "vencimento"), atualizadoEm: new Date() })
    .where(eq(checklistItens.id, id));
  const comp = texto(fd, "competenciaId");
  if (comp) revalidatePath(`/competencias/${comp}`);
}
```

- [ ] **Step 6: Conferir tipos**

Run: `npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 7: Commit**

```bash
git add src/lib/acoes.ts
git commit -m "feat: gera vencimento ao abrir competência + ação atualizarVencimentoItem"
```

---

## Task 4: Cadastro de cliente e tipo — campos de prazo e WhatsApp

**Files:**
- Modify: `src/lib/acoes.ts`, `src/app/clientes/page.tsx`, `src/app/clientes/ClientesUI.tsx`, `src/app/tipos/page.tsx`, `src/app/tipos/TiposUI.tsx`

**Interfaces:**
- Consumes: colunas de Task 2.
- Produces: formulários que gravam `whatsapp`, `diaVencimentoHonorario`, `diaVencimento`, `offsetMes`.

- [ ] **Step 1: Gravar os campos novos em `salvarCliente`**

No objeto `dados` de `salvarCliente`, após `valorHonorario`:

```ts
    valorHonorario: moeda(fd, "valorHonorario"),
    diaVencimentoHonorario: texto(fd, "diaVencimentoHonorario")
      ? Number(texto(fd, "diaVencimentoHonorario"))
      : null,
    whatsapp: texto(fd, "whatsapp"),
    ativo: fd.get("ativo") !== null,
```

- [ ] **Step 2: Gravar os campos novos em `salvarTipoObrigacao`**

Substitua o corpo de `salvarTipoObrigacao` por:

```ts
export async function salvarTipoObrigacao(fd: FormData) {
  const id = texto(fd, "id");
  const nome = texto(fd, "nome");
  if (!nome) throw new Error("Nome é obrigatório.");
  const ordem = Number(texto(fd, "ordem") ?? "0") || 0;
  const diaVencimento = texto(fd, "diaVencimento")
    ? Number(texto(fd, "diaVencimento"))
    : null;
  const offsetMes = Number(texto(fd, "offsetMes") ?? "1") || 0;
  const dados = { nome, ordem, diaVencimento, offsetMes };
  if (id) {
    await db.update(tiposObrigacao).set(dados).where(eq(tiposObrigacao.id, Number(id)));
  } else {
    await db.insert(tiposObrigacao).values(dados);
  }
  revalidatePath("/tipos");
  revalidatePath("/clientes");
}
```

- [ ] **Step 3: Passar os campos novos do cliente para a UI**

Em `src/app/clientes/page.tsx`, no `clientes.map`, adicione duas linhas antes de `obrigacoes`:

```ts
    valorHonorario: c.valorHonorario,
    diaVencimentoHonorario: c.diaVencimentoHonorario,
    whatsapp: c.whatsapp,
    ativo: c.ativo,
    obrigacoes: obrigacoesPorCliente[c.id] ?? [],
```

- [ ] **Step 4: Atualizar o tipo `Cliente` e o objeto `novo` em `ClientesUI.tsx`**

No `type Cliente`, após `valorHonorario`:

```ts
  valorHonorario: string | null;
  diaVencimentoHonorario: number | null;
  whatsapp: string | null;
  ativo: boolean;
```

No objeto `novo`, após `valorHonorario: ""`:

```ts
    valorHonorario: "",
    diaVencimentoHonorario: null,
    whatsapp: "",
    ativo: true,
```

- [ ] **Step 5: Adicionar os campos ao formulário de cliente**

Em `FormularioCliente`, logo após o `<Campo ... name="valorHonorario" .../>`:

```tsx
          <Campo
            label="Honorário mensal (R$)"
            name="valorHonorario"
            defaultValue={cliente.valorHonorario ?? ""}
            placeholder="ex: 350,00"
          />
          <Campo
            label="WhatsApp"
            name="whatsapp"
            defaultValue={cliente.whatsapp ?? ""}
            placeholder="ex: (11) 99999-9999"
          />
          <Campo
            label="Dia venc. honorário"
            name="diaVencimentoHonorario"
            defaultValue={cliente.diaVencimentoHonorario ?? ""}
            type="number"
            placeholder="ex: 10"
          />
```

- [ ] **Step 6: Passar os campos novos do tipo para a UI**

Em `src/app/tipos/page.tsx`, troque o `map`:

```ts
  return (
    <TiposUI
      tipos={tipos.map((t) => ({
        id: t.id,
        nome: t.nome,
        ordem: t.ordem,
        diaVencimento: t.diaVencimento,
        offsetMes: t.offsetMes,
      }))}
    />
  );
```

- [ ] **Step 7: Atualizar o tipo `Tipo`, o `novo` e o formulário em `TiposUI.tsx`**

Troque o `type Tipo`:

```ts
type Tipo = {
  id: number;
  nome: string;
  ordem: number;
  diaVencimento: number | null;
  offsetMes: number;
};
```

Troque a const `novo`:

```ts
  const novo: Tipo = { id: 0, nome: "", ordem: tipos.length, diaVencimento: null, offsetMes: 1 };
```

No `<form>`, após o `<label>` de "Ordem de exibição", adicione:

```tsx
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-neutral-600 dark:text-neutral-400">
                  Dia de vencimento
                </span>
                <input
                  name="diaVencimento"
                  type="number"
                  min={1}
                  max={31}
                  defaultValue={editando.diaVencimento ?? ""}
                  placeholder="ex: 20"
                  className="rounded-lg border border-black/15 bg-transparent px-3 py-2 dark:border-white/15"
                />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-neutral-600 dark:text-neutral-400">
                  Vence em
                </span>
                <select
                  name="offsetMes"
                  defaultValue={String(editando.offsetMes)}
                  className="rounded-lg border border-black/15 bg-transparent px-3 py-2 dark:border-white/15"
                >
                  <option value="0">Mesmo mês da competência</option>
                  <option value="1">Mês seguinte</option>
                </select>
              </label>
```

- [ ] **Step 8: Conferir tipos e lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: sem erros.

- [ ] **Step 9: Verificação manual**

Run: `npm run dev` e abra `http://localhost:5000`.
Verifique: em **Tipos de obrigação**, editar um tipo mostra "Dia de vencimento" e "Vence em" e salva; em **Clientes**, editar mostra "WhatsApp" e "Dia venc. honorário" e salva. (Pare o dev com Ctrl+C ao terminar.)

- [ ] **Step 10: Commit**

```bash
git add src/lib/acoes.ts src/app/clientes/ src/app/tipos/
git commit -m "feat: campos de prazo e whatsapp no cadastro de cliente e tipo"
```

---

## Task 5: Checklist — exibir e ajustar o vencimento por item

**Files:**
- Modify: `src/lib/consultas.ts`, `src/app/competencias/[id]/page.tsx`, `src/app/competencias/[id]/ChecklistUI.tsx`

**Interfaces:**
- Consumes: `atualizarVencimentoItem` (Task 3); `formatarData` (de `@/lib/formato`).
- Produces: `listarChecklist` passa a retornar `vencimento: string | null` por item.

- [ ] **Step 1: Incluir `vencimento` em `listarChecklist`**

Em `src/lib/consultas.ts`, no `select` de `listarChecklist`, após `observacao`:

```ts
      status: checklistItens.status,
      observacao: checklistItens.observacao,
      vencimento: checklistItens.vencimento,
      clienteId: clientes.id,
```

- [ ] **Step 2: Passar `vencimento` do page para a UI**

Em `src/app/competencias/[id]/page.tsx`, no `itens.map`, adicione antes de `tipoObrigacaoId`:

```ts
          cliente: i.cliente,
          vencimento: i.vencimento,
          tipoObrigacaoId: i.tipoObrigacaoId,
```

- [ ] **Step 3: Atualizar o tipo `Item` e imports em `ChecklistUI.tsx`**

No topo, troque o import de ações e adicione o de formatação:

```ts
import { atualizarStatusItem, atualizarVencimentoItem } from "@/lib/acoes";
import { formatarData } from "@/lib/formato";
```

No `type Item`, após `cliente`:

```ts
  cliente: string;
  vencimento: string | null;
  tipoObrigacaoId: number;
```

- [ ] **Step 4: Adicionar o estado e a ação de ajustar prazo**

Logo após `const [soPendentes, setSoPendentes] = useState(false);`:

```ts
  const [modoPrazos, setModoPrazos] = useState(false);
```

E, logo após a função `clique`, adicione:

```ts
  function salvarPrazo(item: Item, valor: string) {
    setEstado((s) =>
      s.map((i) => (i.id === item.id ? { ...i, vencimento: valor || null } : i))
    );
    const fd = new FormData();
    fd.set("id", String(item.id));
    fd.set("vencimento", valor);
    fd.set("competenciaId", String(competenciaId));
    startTransition(() => {
      atualizarVencimentoItem(fd);
    });
  }
```

- [ ] **Step 5: Adicionar o toggle "Ajustar prazos"**

Dentro do `<div className="mb-3 flex items-center gap-4">`, após o `<label>` de "Mostrar só clientes com pendência":

```tsx
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={modoPrazos}
            onChange={(e) => setModoPrazos(e.target.checked)}
          />
          Ajustar prazos
        </label>
```

- [ ] **Step 6: Renderizar input de data ou botão de status na célula**

Substitua o bloco `return ( <td ...><button onClick={() => clique(cel)} ...>{SIMBOLO[cel.status]}</button></td> );` (a célula com conteúdo) por:

```tsx
                  return (
                    <td key={c.id} className="px-2 py-2 text-center">
                      {modoPrazos ? (
                        <input
                          type="date"
                          defaultValue={cel.vencimento ?? ""}
                          onChange={(e) => salvarPrazo(cel, e.target.value)}
                          className="rounded border border-black/15 bg-transparent px-1 py-0.5 text-xs dark:border-white/15"
                        />
                      ) : (
                        <button
                          onClick={() => clique(cel)}
                          title={
                            cel.vencimento
                              ? `vence ${formatarData(cel.vencimento)}`
                              : cel.status
                          }
                          className={`h-7 w-7 rounded-md text-sm font-bold ${ESTILO[cel.status]}`}
                        >
                          {SIMBOLO[cel.status]}
                        </button>
                      )}
                    </td>
                  );
```

- [ ] **Step 7: Conferir tipos e lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: sem erros.

- [ ] **Step 8: Verificação manual**

Com `npm run dev`, abra uma competência. Passe o mouse numa célula: o tooltip mostra "vence dd/mm/aaaa" (em itens com prazo). Marque "Ajustar prazos": as células viram campos de data; alterar uma data persiste (recarregue para confirmar).

- [ ] **Step 9: Commit**

```bash
git add src/lib/consultas.ts src/app/competencias/
git commit -m "feat: vencimento por item no checklist (exibição e ajuste)"
```

---

## Task 6: Utilidades de WhatsApp (puras)

**Files:**
- Create: `src/lib/whatsapp.ts`
- Test: `src/lib/whatsapp.test.ts`

**Interfaces:**
- Produces:
  - `MODELO_WHATSAPP_PADRAO: string`
  - `normalizarTelefone(raw: string | null | undefined): string | null` — só dígitos; prefixa `55` se faltar; retorna `null` se inválido (fora de 12–13 dígitos após normalizar).
  - `montarMensagem(modelo: string, dados: Record<string, string>): string` — troca `{chave}` pelos valores; deixa `{chave}` intacto se não houver valor.
  - `linkWhatsapp(telefone: string, mensagem: string): string` — `https://wa.me/<telefone>?text=<encoded>`.

- [ ] **Step 1: Escrever os testes (falhando)**

Crie `src/lib/whatsapp.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizarTelefone, montarMensagem, linkWhatsapp } from "./whatsapp";

test("normaliza celular com máscara e adiciona DDI 55", () => {
  assert.equal(normalizarTelefone("(11) 99999-9999"), "5511999999999");
});

test("mantém número que já tem 55", () => {
  assert.equal(normalizarTelefone("5511999999999"), "5511999999999");
});

test("rejeita número curto ou vazio", () => {
  assert.equal(normalizarTelefone("123"), null);
  assert.equal(normalizarTelefone(null), null);
  assert.equal(normalizarTelefone(""), null);
});

test("monta mensagem trocando as variáveis", () => {
  const msg = montarMensagem("Oi {cliente}, valor {valor}", {
    cliente: "ACME",
    valor: "R$ 350,00",
  });
  assert.equal(msg, "Oi ACME, valor R$ 350,00");
});

test("deixa intacta a variável sem valor", () => {
  assert.equal(montarMensagem("Oi {cliente} {x}", { cliente: "ACME" }), "Oi ACME {x}");
});

test("link encoda a mensagem", () => {
  assert.equal(
    linkWhatsapp("5511999999999", "oi mundo"),
    "https://wa.me/5511999999999?text=oi%20mundo"
  );
});
```

- [ ] **Step 2: Rodar e confirmar que falham**

Run: `npm test`
Expected: FAIL — módulo `./whatsapp` não encontrado.

- [ ] **Step 3: Implementar `src/lib/whatsapp.ts`**

```ts
// Utilidades para montar a cobrança por WhatsApp via link wa.me (puras).
// NÃO importar nada de servidor aqui: este módulo roda também no cliente.

// Modelo padrão da mensagem de inadimplência. Variáveis disponíveis:
// {cliente} {valor} {competencia} {vencimento} {dias_atraso}
export const MODELO_WHATSAPP_PADRAO =
  "Olá {cliente}, identificamos que o honorário referente a {competencia} " +
  "(venc. {vencimento}, valor {valor}) está em aberto há {dias_atraso} dias. " +
  "Poderia regularizar? Qualquer dúvida estamos à disposição.";

// Mantém só dígitos e garante o DDI 55 (Brasil) para números de 10/11 dígitos.
export function normalizarTelefone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let d = raw.replace(/\D/g, "");
  if (d.length === 10 || d.length === 11) d = "55" + d;
  if (d.length < 12 || d.length > 13) return null;
  return d;
}

// Substitui {chave} pelos valores informados; preserva chaves sem valor.
export function montarMensagem(modelo: string, dados: Record<string, string>): string {
  return modelo.replace(/\{(\w+)\}/g, (original, chave) =>
    chave in dados ? dados[chave] : original
  );
}

export function linkWhatsapp(telefone: string, mensagem: string): string {
  return `https://wa.me/${telefone}?text=${encodeURIComponent(mensagem)}`;
}
```

- [ ] **Step 4: Rodar e confirmar que passam**

Run: `npm test`
Expected: PASS — todos os testes de `prazos` e `whatsapp` verdes (`# fail 0`).

- [ ] **Step 5: Commit**

```bash
git add src/lib/whatsapp.ts src/lib/whatsapp.test.ts
git commit -m "feat: utilidades puras de WhatsApp (wa.me)"
```

---

## Task 7: Consultas de atraso e leitura de configuração

**Files:**
- Modify: `src/lib/consultas.ts`

**Interfaces:**
- Consumes: tabelas/colunas de Task 2.
- Produces:
  - `obterConfiguracao(chave: string): Promise<string | null>`
  - `listarObrigacoesEmAtraso(clienteId?: number)` → linhas `{ id, competenciaId, ano, mes, vencimento, diasAtraso, clienteId, codigo, cliente, obrigacao }`
  - `listarInadimplentes(clienteId?: number)` → linhas `{ id, competenciaId, ano, mes, valor, vencimento, diasAtraso, clienteId, codigo, cliente, whatsapp, cobradoEm }`

- [ ] **Step 1: Importar as novas tabelas**

No import de `@/db/schema` em `consultas.ts`, adicione `cobrancas` e `configuracoes`:

```ts
import {
  checklistItens,
  clienteObrigacoes,
  clientes,
  cobrancas,
  competencias,
  configuracoes,
  pagamentos,
  tiposObrigacao,
} from "@/db/schema";
```

- [ ] **Step 2: Adicionar `obterConfiguracao`**

No fim de `consultas.ts`:

```ts
export async function obterConfiguracao(chave: string): Promise<string | null> {
  const [c] = await db
    .select({ valor: configuracoes.valor })
    .from(configuracoes)
    .where(eq(configuracoes.chave, chave));
  return c?.valor ?? null;
}
```

- [ ] **Step 3: Adicionar `listarObrigacoesEmAtraso`**

```ts
// Obrigações pendentes cujo vencimento já passou (atraso = current_date - vencimento).
export async function listarObrigacoesEmAtraso(clienteId?: number) {
  const cond = [
    eq(checklistItens.status, "pendente"),
    sql`${checklistItens.vencimento} is not null`,
    sql`${checklistItens.vencimento} < current_date`,
  ];
  if (clienteId) cond.push(eq(checklistItens.clienteId, clienteId));

  return db
    .select({
      id: checklistItens.id,
      competenciaId: checklistItens.competenciaId,
      ano: competencias.ano,
      mes: competencias.mes,
      vencimento: checklistItens.vencimento,
      diasAtraso: sql<number>`(current_date - ${checklistItens.vencimento})::int`,
      clienteId: clientes.id,
      codigo: clientes.codigo,
      cliente: clientes.razaoSocial,
      obrigacao: tiposObrigacao.nome,
    })
    .from(checklistItens)
    .innerJoin(clientes, eq(clientes.id, checklistItens.clienteId))
    .innerJoin(tiposObrigacao, eq(tiposObrigacao.id, checklistItens.tipoObrigacaoId))
    .innerJoin(competencias, eq(competencias.id, checklistItens.competenciaId))
    .where(and(...cond))
    .orderBy(sql`(current_date - ${checklistItens.vencimento}) desc`);
}
```

- [ ] **Step 4: Adicionar `listarInadimplentes`**

```ts
// Pagamentos pendentes vencidos, com a data da última cobrança registrada (se houver).
export async function listarInadimplentes(clienteId?: number) {
  const cond = [
    eq(pagamentos.status, "pendente"),
    sql`${pagamentos.vencimento} is not null`,
    sql`${pagamentos.vencimento} < current_date`,
  ];
  if (clienteId) cond.push(eq(pagamentos.clienteId, clienteId));

  return db
    .select({
      id: pagamentos.id,
      competenciaId: pagamentos.competenciaId,
      ano: competencias.ano,
      mes: competencias.mes,
      valor: pagamentos.valor,
      vencimento: pagamentos.vencimento,
      diasAtraso: sql<number>`(current_date - ${pagamentos.vencimento})::int`,
      clienteId: clientes.id,
      codigo: clientes.codigo,
      cliente: clientes.razaoSocial,
      whatsapp: clientes.whatsapp,
      cobradoEm: sql<string | null>`max(${cobrancas.enviadoEm})::text`,
    })
    .from(pagamentos)
    .innerJoin(clientes, eq(clientes.id, pagamentos.clienteId))
    .innerJoin(competencias, eq(competencias.id, pagamentos.competenciaId))
    .leftJoin(cobrancas, eq(cobrancas.pagamentoId, pagamentos.id))
    .where(and(...cond))
    .groupBy(pagamentos.id, clientes.id, competencias.id)
    .orderBy(sql`(current_date - ${pagamentos.vencimento}) desc`);
}
```

- [ ] **Step 5: Conferir tipos**

Run: `npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 6: Commit**

```bash
git add src/lib/consultas.ts
git commit -m "feat: consultas de obrigações em atraso, inadimplentes e configuração"
```

---

## Task 8: Ações da tela de pendências

**Files:**
- Modify: `src/lib/acoes.ts`

**Interfaces:**
- Consumes: tabelas `cobrancas`, `configuracoes`, `pagamentos` (Task 2).
- Produces:
  - `marcarPagamentoPago(fd: FormData)` — lê `id`; seta `status='pago'`. Não toca em `valor`/`forma` (evita sobrescrita).
  - `registrarCobranca(fd: FormData)` — lê `pagamentoId`; insere uma linha em `cobrancas`.
  - `salvarConfiguracao(fd: FormData)` — lê `chave`, `valor`; faz upsert em `configuracoes`.

- [ ] **Step 1: Importar as tabelas novas em `acoes.ts`**

No import de `@/db/schema`, adicione `cobrancas` e `configuracoes` (ordene junto às demais):

```ts
import {
  checklistItens,
  clienteObrigacoes,
  clientes,
  cobrancas,
  competencias,
  configuracoes,
  pagamentos,
  tiposObrigacao,
} from "@/db/schema";
```

- [ ] **Step 2: Adicionar `marcarPagamentoPago`**

Após `atualizarPagamento`:

```ts
// Marca um pagamento como pago sem mexer em valor/forma (usado na tela de pendências).
export async function marcarPagamentoPago(fd: FormData) {
  const id = Number(texto(fd, "id"));
  if (!id) return;
  await db
    .update(pagamentos)
    .set({ status: "pago", atualizadoEm: new Date() })
    .where(eq(pagamentos.id, id));
  revalidatePath("/pendencias");
}
```

- [ ] **Step 3: Adicionar `registrarCobranca`**

```ts
// Registra que uma cobrança por WhatsApp foi disparada para um pagamento.
export async function registrarCobranca(fd: FormData) {
  const pagamentoId = Number(texto(fd, "pagamentoId"));
  if (!pagamentoId) return;
  await db.insert(cobrancas).values({ pagamentoId });
  revalidatePath("/pendencias");
}
```

- [ ] **Step 4: Adicionar `salvarConfiguracao`**

```ts
// Upsert de uma configuração (ex.: modelo da mensagem de cobrança).
export async function salvarConfiguracao(fd: FormData) {
  const chave = texto(fd, "chave");
  const valor = fd.get("valor");
  if (!chave || typeof valor !== "string") return;
  await db
    .insert(configuracoes)
    .values({ chave, valor })
    .onConflictDoUpdate({ target: configuracoes.chave, set: { valor } });
  revalidatePath("/pendencias");
}
```

- [ ] **Step 5: Conferir tipos**

Run: `npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 6: Commit**

```bash
git add src/lib/acoes.ts
git commit -m "feat: ações de marcar pago, registrar cobrança e salvar configuração"
```

---

## Task 9: Tela /pendencias + link no menu

**Files:**
- Create: `src/app/pendencias/page.tsx`, `src/app/pendencias/PendenciasUI.tsx`
- Modify: `src/components/MenuLateral.tsx`

**Interfaces:**
- Consumes: `listarObrigacoesEmAtraso`, `listarInadimplentes`, `obterConfiguracao` (Task 7); `MODELO_WHATSAPP_PADRAO`, `normalizarTelefone`, `montarMensagem`, `linkWhatsapp` (Task 6); `atualizarStatusItem`, `marcarPagamentoPago`, `registrarCobranca`, `salvarConfiguracao` (Tasks 3/8); `formatarMoeda`, `formatarData`, `rotuloCompetencia` (de `@/lib/formato`).

- [ ] **Step 1: Criar o Server Component da página**

Crie `src/app/pendencias/page.tsx`:

```tsx
import {
  listarObrigacoesEmAtraso,
  listarInadimplentes,
  obterConfiguracao,
} from "@/lib/consultas";
import { MODELO_WHATSAPP_PADRAO } from "@/lib/whatsapp";
import PendenciasUI from "./PendenciasUI";

export const dynamic = "force-dynamic";

export default async function PaginaPendencias() {
  const [obrigacoes, inadimplentes, modeloSalvo] = await Promise.all([
    listarObrigacoesEmAtraso(),
    listarInadimplentes(),
    obterConfiguracao("modelo_whatsapp_inadimplencia"),
  ]);

  return (
    <PendenciasUI
      obrigacoes={obrigacoes}
      inadimplentes={inadimplentes}
      modelo={modeloSalvo ?? MODELO_WHATSAPP_PADRAO}
    />
  );
}
```

- [ ] **Step 2: Criar o Client Component da tela**

Crie `src/app/pendencias/PendenciasUI.tsx`:

```tsx
"use client";

import { useMemo, useState, useTransition } from "react";
import {
  atualizarStatusItem,
  marcarPagamentoPago,
  registrarCobranca,
  salvarConfiguracao,
} from "@/lib/acoes";
import { formatarData, formatarMoeda, rotuloCompetencia } from "@/lib/formato";
import { linkWhatsapp, montarMensagem, normalizarTelefone } from "@/lib/whatsapp";

type Obrigacao = {
  id: number;
  competenciaId: number;
  ano: number;
  mes: number;
  vencimento: string | null;
  diasAtraso: number;
  clienteId: number;
  codigo: number | null;
  cliente: string;
  obrigacao: string;
};

type Inadimplente = {
  id: number;
  competenciaId: number;
  ano: number;
  mes: number;
  valor: string | null;
  vencimento: string | null;
  diasAtraso: number;
  clienteId: number;
  codigo: number | null;
  cliente: string;
  whatsapp: string | null;
  cobradoEm: string | null;
};

export default function PendenciasUI({
  obrigacoes,
  inadimplentes,
  modelo,
}: {
  obrigacoes: Obrigacao[];
  inadimplentes: Inadimplente[];
  modelo: string;
}) {
  const [obrs, setObrs] = useState(obrigacoes);
  const [inads, setInads] = useState(inadimplentes);
  const [filtro, setFiltro] = useState(0); // 0 = todos; senão clienteId
  const [, startTransition] = useTransition();

  // Lista de clientes presentes nas duas tabelas, para o filtro.
  const opcoesClientes = useMemo(() => {
    const m = new Map<number, string>();
    for (const o of obrs) m.set(o.clienteId, o.cliente);
    for (const i of inads) m.set(i.clienteId, i.cliente);
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [obrs, inads]);

  const obrsView = filtro ? obrs.filter((o) => o.clienteId === filtro) : obrs;
  const inadsView = filtro ? inads.filter((i) => i.clienteId === filtro) : inads;

  function marcarFeito(o: Obrigacao) {
    setObrs((s) => s.filter((x) => x.id !== o.id));
    const fd = new FormData();
    fd.set("id", String(o.id));
    fd.set("status", "feito");
    fd.set("competenciaId", String(o.competenciaId));
    startTransition(() => {
      atualizarStatusItem(fd);
    });
  }

  function marcarPago(i: Inadimplente) {
    setInads((s) => s.filter((x) => x.id !== i.id));
    const fd = new FormData();
    fd.set("id", String(i.id));
    startTransition(() => {
      marcarPagamentoPago(fd);
    });
  }

  function cobrar(i: Inadimplente) {
    const tel = normalizarTelefone(i.whatsapp);
    if (!tel) return;
    const msg = montarMensagem(modelo, {
      cliente: i.cliente,
      valor: formatarMoeda(i.valor),
      competencia: rotuloCompetencia(i.ano, i.mes),
      vencimento: formatarData(i.vencimento),
      dias_atraso: String(i.diasAtraso),
    });
    const fd = new FormData();
    fd.set("pagamentoId", String(i.id));
    startTransition(() => {
      registrarCobranca(fd);
    });
    setInads((s) =>
      s.map((x) => (x.id === i.id ? { ...x, cobradoEm: new Date().toISOString() } : x))
    );
    window.open(linkWhatsapp(tel, msg), "_blank");
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Pendências</h1>
        <p className="text-sm text-neutral-500">
          Obrigações atrasadas e clientes inadimplentes
        </p>
      </div>

      <div className="mb-6 flex items-center gap-2">
        <label className="text-sm text-neutral-600 dark:text-neutral-400">
          Filtrar por cliente:
        </label>
        <select
          value={filtro}
          onChange={(e) => setFiltro(Number(e.target.value))}
          className="rounded-lg border border-black/15 bg-transparent px-3 py-2 text-sm dark:border-white/15"
        >
          <option value={0}>Todos</option>
          {opcoesClientes.map(([id, nome]) => (
            <option key={id} value={id}>
              {nome}
            </option>
          ))}
        </select>
      </div>

      {/* Obrigações em atraso */}
      <section className="mb-10">
        <h2 className="mb-3 text-lg font-semibold">
          Obrigações em atraso{" "}
          <span className="text-sm font-normal text-neutral-500">
            ({obrsView.length})
          </span>
        </h2>
        <div className="overflow-x-auto rounded-xl border border-black/10 dark:border-white/10">
          <table className="w-full text-left text-sm">
            <thead className="bg-black/5 dark:bg-white/5">
              <tr>
                <th className="px-3 py-3 font-medium">Cliente</th>
                <th className="px-3 py-3 font-medium">Obrigação</th>
                <th className="px-3 py-3 font-medium">Competência</th>
                <th className="px-3 py-3 font-medium">Vencimento</th>
                <th className="px-3 py-3 font-medium">Atraso</th>
                <th className="px-3 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-black/10 dark:divide-white/10">
              {obrsView.map((o) => (
                <tr key={o.id}>
                  <td className="px-3 py-3">
                    <span className="text-neutral-400">{o.codigo ?? "—"}</span>{" "}
                    {o.cliente}
                  </td>
                  <td className="px-3 py-3">{o.obrigacao}</td>
                  <td className="px-3 py-3">{rotuloCompetencia(o.ano, o.mes)}</td>
                  <td className="px-3 py-3">{formatarData(o.vencimento)}</td>
                  <td className="px-3 py-3 text-red-600">{o.diasAtraso} dia(s)</td>
                  <td className="px-3 py-3 text-right">
                    <button
                      onClick={() => marcarFeito(o)}
                      className="text-xs text-green-600 hover:underline"
                    >
                      Marcar feito
                    </button>
                  </td>
                </tr>
              ))}
              {obrsView.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-3 py-6 text-center text-neutral-500">
                    Nenhuma obrigação em atraso. 🎉
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Clientes inadimplentes */}
      <section className="mb-10">
        <h2 className="mb-3 text-lg font-semibold">
          Clientes inadimplentes{" "}
          <span className="text-sm font-normal text-neutral-500">
            ({inadsView.length})
          </span>
        </h2>
        <div className="overflow-x-auto rounded-xl border border-black/10 dark:border-white/10">
          <table className="w-full text-left text-sm">
            <thead className="bg-black/5 dark:bg-white/5">
              <tr>
                <th className="px-3 py-3 font-medium">Cliente</th>
                <th className="px-3 py-3 font-medium">Competência</th>
                <th className="px-3 py-3 font-medium">Valor</th>
                <th className="px-3 py-3 font-medium">Vencimento</th>
                <th className="px-3 py-3 font-medium">Atraso</th>
                <th className="px-3 py-3 font-medium">Cobrança</th>
                <th className="px-3 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-black/10 dark:divide-white/10">
              {inadsView.map((i) => (
                <tr key={i.id}>
                  <td className="px-3 py-3">
                    <span className="text-neutral-400">{i.codigo ?? "—"}</span>{" "}
                    {i.cliente}
                  </td>
                  <td className="px-3 py-3">{rotuloCompetencia(i.ano, i.mes)}</td>
                  <td className="px-3 py-3">{formatarMoeda(i.valor)}</td>
                  <td className="px-3 py-3">{formatarData(i.vencimento)}</td>
                  <td className="px-3 py-3 text-red-600">{i.diasAtraso} dia(s)</td>
                  <td className="px-3 py-3 text-xs text-neutral-500">
                    {i.cobradoEm ? `cobrado em ${formatarData(i.cobradoEm)}` : "—"}
                  </td>
                  <td className="px-3 py-3 text-right">
                    <div className="flex justify-end gap-3">
                      {normalizarTelefone(i.whatsapp) ? (
                        <button
                          onClick={() => cobrar(i)}
                          className="text-xs text-green-700 hover:underline"
                        >
                          WhatsApp
                        </button>
                      ) : (
                        <span className="text-xs text-neutral-400" title="Sem WhatsApp cadastrado">
                          sem zap
                        </span>
                      )}
                      <button
                        onClick={() => marcarPago(i)}
                        className="text-xs text-blue-600 hover:underline"
                      >
                        Marcar pago
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {inadsView.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-3 py-6 text-center text-neutral-500">
                    Nenhum cliente inadimplente. 🎉
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Modelo da mensagem */}
      <section>
        <h2 className="mb-3 text-lg font-semibold">Modelo da mensagem de cobrança</h2>
        <form
          action={salvarConfiguracao}
          className="max-w-2xl rounded-xl border border-black/10 p-4 dark:border-white/10"
        >
          <input type="hidden" name="chave" value="modelo_whatsapp_inadimplencia" />
          <textarea
            name="valor"
            defaultValue={modelo}
            rows={4}
            className="w-full rounded-lg border border-black/15 bg-transparent px-3 py-2 text-sm dark:border-white/15"
          />
          <p className="mt-2 text-xs text-neutral-500">
            Variáveis: {"{cliente}"} {"{valor}"} {"{competencia}"} {"{vencimento}"}{" "}
            {"{dias_atraso}"}
          </p>
          <button
            type="submit"
            className="mt-3 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700"
          >
            Salvar modelo
          </button>
        </form>
      </section>
    </div>
  );
}
```

- [ ] **Step 3: Adicionar o link no menu lateral**

Em `src/components/MenuLateral.tsx`, no array `itens`, após a entrada de Competências:

```ts
  { href: "/competencias", rotulo: "Competências", icone: "📅" },
  { href: "/pendencias", rotulo: "Pendências", icone: "⏰" },
  { href: "/tipos", rotulo: "Tipos de obrigação", icone: "🏷️" },
```

- [ ] **Step 4: Conferir tipos, lint e build**

Run: `npx tsc --noEmit && npm run lint && npm run build`
Expected: build conclui sem erros; a rota `/pendencias` aparece na lista de rotas.

- [ ] **Step 5: Verificação manual (fluxo completo)**

Com `npm run dev`:
1. Cadastre um tipo com dia de vencimento (ex.: 5, mês seguinte) e um cliente com WhatsApp e honorário, ligado a esse tipo.
2. Abra uma competência antiga o suficiente para o vencimento já ter passado (ex.: meses atrás).
3. Acesse **Pendências**: o item e o pagamento aparecem com dias de atraso.
4. Clique **WhatsApp**: abre o wa.me com a mensagem preenchida; a linha passa a mostrar "cobrado em…".
5. Clique **Marcar feito** / **Marcar pago**: a linha some. Recarregue para confirmar a persistência.
6. Edite o modelo da mensagem, salve, e refaça o passo 4 para ver o texto novo.

- [ ] **Step 6: Commit**

```bash
git add src/app/pendencias/ src/components/MenuLateral.tsx
git commit -m "feat: tela de pendências com cobrança por WhatsApp"
```

---

## Self-Review

**Spec coverage:**
- Peça 1 (datas): colunas e cálculo (Tasks 1–3), campos de cadastro (Task 4), ajuste manual no checklist (Task 5). ✓
- Peça 2 (detecção de atraso): queries derivadas (Task 7). ✓
- Peça 3 (tela + WhatsApp): utilidades (Task 6), ações (Task 8), tela `/pendencias` com link wa.me, modelo editável e histórico de cobranças (Tasks 8–9). ✓
- Honorário vence no mês seguinte (offsetMes=1): Task 3, Step 4. ✓
- Compatibilidade (itens antigos sem falso atraso): queries exigem `vencimento is not null` (Task 7). ✓

**Placeholders:** nenhum TODO/TBD; todo passo tem código ou comando concreto. ✓

**Type consistency:** `calcularVencimento` (string|null) usado consistentemente em acoes; `vencimento` é `string | null` em queries, page e UI; `cobradoEm` é `string | null` (`::text`) e formatado com `formatarData`; `marcarPagamentoPago` evita o bug de `moeda()` ao não reenviar `valor`. ✓

## Notas de decisão

- **Ajuste manual de prazo** fica num modo "Ajustar prazos" no checklist (toggle que troca os botões de status por campos de data), preservando o clique rápido de status atual.
- **Marcar pago** usa uma ação dedicada (`marcarPagamentoPago`) em vez de `atualizarPagamento`, porque esta última reprocessa `valor` via `moeda()` e corromperia o valor ao reenviar a string numérica do banco.
- **Modelo de mensagem** tem default no código (`MODELO_WHATSAPP_PADRAO`); a tabela `configuracoes` só guarda overrides — sem necessidade de seed na migration.
