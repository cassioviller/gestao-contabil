"use server";

// Mutações (Server Actions). Chamadas por formulários e botões das telas.
// Cada uma revalida as rotas afetadas para a tela atualizar.

import { revalidatePath } from "next/cache";
import { and, asc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
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
import { calcularVencimento } from "./prazos";

// Dia padrão de vencimento do honorário quando o cliente não define um.
const DIA_VENCIMENTO_HONORARIO_PADRAO = 10;

// ---------- helpers ----------

function texto(fd: FormData, campo: string): string | null {
  const v = fd.get(campo);
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t === "" ? null : t;
}

function moeda(fd: FormData, campo: string): string | null {
  const v = texto(fd, campo);
  if (!v) return null;
  // aceita "1.234,56" ou "1234.56"
  const n = v.replace(/\./g, "").replace(",", ".");
  return Number.isNaN(Number(n)) ? null : n;
}

// ---------- Clientes ----------

export async function salvarCliente(fd: FormData) {
  const id = texto(fd, "id");
  const dados = {
    codigo: texto(fd, "codigo") ? Number(texto(fd, "codigo")) : null,
    razaoSocial: texto(fd, "razaoSocial") ?? "",
    cnpj: texto(fd, "cnpj"),
    inscricaoEstadual: texto(fd, "inscricaoEstadual"),
    formaEnvio: texto(fd, "formaEnvio"),
    procuracao: texto(fd, "procuracao"),
    senhaNfse: texto(fd, "senhaNfse"),
    observacao: texto(fd, "observacao"),
    valorHonorario: moeda(fd, "valorHonorario"),
    diaVencimentoHonorario: texto(fd, "diaVencimentoHonorario")
      ? Number(texto(fd, "diaVencimentoHonorario"))
      : null,
    whatsapp: texto(fd, "whatsapp"),
    ativo: fd.get("ativo") !== null,
  };
  if (!dados.razaoSocial) throw new Error("Razão social é obrigatória.");

  // Obrigações marcadas no formulário (checkboxes "obrig_<tipoId>").
  const tipoIds = [...fd.keys()]
    .filter((k) => k.startsWith("obrig_"))
    .map((k) => Number(k.slice("obrig_".length)))
    .filter((n) => !Number.isNaN(n));

  let clienteId: number;
  if (id) {
    clienteId = Number(id);
    await db.update(clientes).set(dados).where(eq(clientes.id, clienteId));
  } else {
    const [novo] = await db.insert(clientes).values(dados).returning();
    clienteId = novo.id;
  }

  // Reconcilia obrigações do cliente com o que veio do formulário.
  await db.delete(clienteObrigacoes).where(eq(clienteObrigacoes.clienteId, clienteId));
  if (tipoIds.length) {
    await db.insert(clienteObrigacoes).values(
      tipoIds.map((t) => ({ clienteId, tipoObrigacaoId: t }))
    );
  }

  revalidatePath("/clientes");
  revalidatePath("/");
}

export async function removerCliente(fd: FormData) {
  const id = Number(texto(fd, "id"));
  if (!id) return;
  await db.delete(clientes).where(eq(clientes.id, id));
  revalidatePath("/clientes");
}

// ---------- Tipos de obrigação (catálogo) ----------

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

export async function removerTipoObrigacao(fd: FormData) {
  const id = Number(texto(fd, "id"));
  if (!id) return;
  await db.delete(tiposObrigacao).where(eq(tiposObrigacao.id, id));
  revalidatePath("/tipos");
}

// ---------- Competências (o coração da recorrência) ----------

// Abre um novo mês: cria a competência e GERA automaticamente o checklist
// (uma linha por obrigação de cada cliente ativo) e os pagamentos
// (uma linha por cliente ativo, com o valor do honorário do cadastro).
export async function abrirCompetencia(fd: FormData) {
  const ano = Number(texto(fd, "ano"));
  const mes = Number(texto(fd, "mes"));
  if (!ano || !mes || mes < 1 || mes > 12) throw new Error("Ano/mês inválidos.");

  const existente = await db
    .select({ id: competencias.id })
    .from(competencias)
    .where(and(eq(competencias.ano, ano), eq(competencias.mes, mes)));
  if (existente.length) throw new Error("Esse mês já foi aberto.");

  const [comp] = await db.insert(competencias).values({ ano, mes }).returning();

  // Clientes ativos e suas obrigações.
  const ativos = await db.select().from(clientes).where(eq(clientes.ativo, true));
  const ativosIds = ativos.map((c) => c.id);

  // Mapa de tipo -> dados de vencimento, para calcular o prazo de cada item.
  const tipos = await db.select().from(tiposObrigacao);
  const tipoPorId = new Map(tipos.map((t) => [t.id, t]));

  if (ativosIds.length) {
    const vinculos = await db
      .select()
      .from(clienteObrigacoes)
      .where(inArray(clienteObrigacoes.clienteId, ativosIds));

    if (vinculos.length) {
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
    }

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
  }

  revalidatePath("/competencias");
  revalidatePath("/");
  return comp.id;
}

export async function removerCompetencia(fd: FormData) {
  const id = Number(texto(fd, "id"));
  if (!id) return;
  await db.delete(competencias).where(eq(competencias.id, id));
  revalidatePath("/competencias");
  revalidatePath("/");
}

// ---------- Status do checklist ----------

export async function atualizarStatusItem(fd: FormData) {
  const id = Number(texto(fd, "id"));
  const status = texto(fd, "status") as "pendente" | "feito" | "nao_aplica";
  if (!id || !status) return;
  await db
    .update(checklistItens)
    .set({ status, atualizadoEm: new Date() })
    .where(eq(checklistItens.id, id));
  const comp = texto(fd, "competenciaId");
  if (comp) revalidatePath(`/competencias/${comp}`);
}

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

// ---------- Pagamentos ----------

export async function atualizarPagamento(fd: FormData) {
  const id = Number(texto(fd, "id"));
  if (!id) return;
  await db
    .update(pagamentos)
    .set({
      status: (texto(fd, "status") as "pendente" | "pago" | "isento") ?? "pendente",
      valor: moeda(fd, "valor"),
      dataPagamento: texto(fd, "dataPagamento"),
      forma: texto(fd, "forma"),
      observacao: texto(fd, "observacao"),
      atualizadoEm: new Date(),
    })
    .where(eq(pagamentos.id, id));
  const comp = texto(fd, "competenciaId");
  if (comp) revalidatePath(`/competencias/${comp}/pagamentos`);
}

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

// Registra que uma cobrança por WhatsApp foi disparada para um pagamento.
export async function registrarCobranca(fd: FormData) {
  const pagamentoId = Number(texto(fd, "pagamentoId"));
  if (!pagamentoId) return;
  await db.insert(cobrancas).values({ pagamentoId });
  revalidatePath("/pendencias");
}

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
