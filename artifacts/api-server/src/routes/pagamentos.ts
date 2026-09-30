import { Router } from "express";
import { and, eq } from "drizzle-orm";
import { db } from "@workspace/db";
import { pagamentos, clientes, competencias } from "@workspace/db";
import { competenciaCurta, hojeBR } from "@workspace/dominio";
import {
  AtualizarPagamentoParams,
  AtualizarPagamentoBody,
  CobrarPagamentoParams,
} from "@workspace/api-zod";
import { cobrador, cobradorEhReal } from "../servicos/externos";
import { HttpError } from "../lib/http";
import { auditar } from "../lib/auditoria";
import { contaDaRequisicao, sessaoDaRequisicao } from "../middlewares/autenticacao";

const router = Router();

/** Projeção do pagamento, a mesma da listagem da competência. */
export const camposPagamento = {
  id: pagamentos.id,
  status: pagamentos.status,
  valor: pagamentos.valor,
  dataPagamento: pagamentos.dataPagamento,
  vencimento: pagamentos.vencimento,
  forma: pagamentos.forma,
  observacao: pagamentos.observacao,
  clienteId: clientes.id,
  codigo: clientes.codigo,
  cliente: clientes.razaoSocial,
  cobrancaExternaId: pagamentos.cobrancaExternaId,
  linkPagamento: pagamentos.linkPagamento,
  qrPix: pagamentos.qrPix,
};

function buscarPagamento(id: number, contaId: number) {
  return db
    .select(camposPagamento)
    .from(pagamentos)
    .innerJoin(clientes, eq(clientes.id, pagamentos.clienteId))
    .where(and(eq(pagamentos.id, id), eq(pagamentos.contaId, contaId)));
}

// PATCH /api/pagamentos/:id
router.patch("/:id", async (req, res) => {
  const contaId = contaDaRequisicao(req);
  const sessao = sessaoDaRequisicao(req);
  const { id } = AtualizarPagamentoParams.parse(req.params);
  const body = AtualizarPagamentoBody.parse(req.body);

  // Só o que veio no corpo é gravado: um PATCH com `{ status: "pago" }` não
  // pode zerar o valor nem a data. Texto vazio vale como "limpar" (null).
  const mudancas: Record<string, unknown> = {};
  for (const [chave, v] of Object.entries(body)) {
    if (v === undefined) continue;
    mudancas[chave] = typeof v === "string" && v.trim() === "" ? null : v;
  }
  if (Object.keys(mudancas).length === 0) throw new HttpError(400, "Nenhum campo para atualizar.");

  const [alterado] = await db
    .update(pagamentos)
    .set({ ...mudancas, atualizadoEm: new Date(), atualizadoPor: sessao.usuarioId })
    .where(and(eq(pagamentos.id, id), eq(pagamentos.contaId, contaId)))
    .returning({ id: pagamentos.id, status: pagamentos.status });
  if (!alterado) throw new HttpError(404, "Pagamento não encontrado.");
  if (mudancas.status !== undefined) {
    await auditar(req, {
      acao: "status_pagamento",
      entidade: "pagamento",
      entidadeId: id,
      para: String(mudancas.status),
    });
  }

  const [p] = await buscarPagamento(id, contaId);
  res.json(p);
});

/**
 * POST /api/pagamentos/:id/cobrar — cria a cobrança no provedor e guarda o
 * link e o Pix no pagamento. O retorno do provedor (webhook) dá a baixa.
 */
router.post("/:id/cobrar", async (req, res) => {
  const contaId = contaDaRequisicao(req);
  const { id } = CobrarPagamentoParams.parse(req.params);
  if (!cobradorEhReal && process.env.NODE_ENV === "production") {
    throw new HttpError(
      503,
      "Cobrança automática não configurada (ASAAS_API_KEY).",
      undefined,
      "cobranca_desligada",
    );
  }
  const [p] = await db
    .select({
      id: pagamentos.id,
      status: pagamentos.status,
      valor: pagamentos.valor,
      vencimento: pagamentos.vencimento,
      cobrancaExternaId: pagamentos.cobrancaExternaId,
      linkPagamento: pagamentos.linkPagamento,
      ano: competencias.ano,
      mes: competencias.mes,
      cliente: clientes.razaoSocial,
      cnpj: clientes.cnpj,
      email: clientes.email,
      whatsapp: clientes.whatsapp,
    })
    .from(pagamentos)
    .innerJoin(clientes, eq(clientes.id, pagamentos.clienteId))
    .innerJoin(competencias, eq(competencias.id, pagamentos.competenciaId))
    .where(and(eq(pagamentos.id, id), eq(pagamentos.contaId, contaId)));
  if (!p) throw new HttpError(404, "Pagamento não encontrado.");
  if (p.status !== "pendente") throw new HttpError(400, "Só honorário pendente gera cobrança.");
  if (!p.valor || Number(p.valor) <= 0)
    throw new HttpError(
      400,
      "Informe o valor do honorário antes de cobrar.",
      undefined,
      "sem_valor",
    );
  if (!p.cnpj?.replace(/\D/g, ""))
    throw new HttpError(400, "O cliente precisa ter CNPJ para a cobrança.", undefined, "sem_cnpj");
  if (p.cobrancaExternaId && p.linkPagamento) {
    const [atual] = await buscarPagamento(id, contaId);
    res.json(atual);
    return;
  }

  const clienteExterno = await cobrador.garantirCliente({
    nome: p.cliente,
    cnpj: p.cnpj,
    email: p.email,
    telefone: p.whatsapp,
  });
  const cobranca = await cobrador.criarCobranca({
    clienteExternoId: clienteExterno.id,
    valor: p.valor,
    vencimento: p.vencimento && p.vencimento >= hojeBR() ? p.vencimento : hojeBR(),
    descricao: `Honorários contábeis ${competenciaCurta(p.ano, p.mes)}`,
    referencia: `pagamento:${id}`,
  });
  await db
    .update(pagamentos)
    .set({
      cobrancaExternaId: cobranca.id,
      linkPagamento: cobranca.link,
      qrPix: cobranca.qrPix,
      atualizadoEm: new Date(),
    })
    .where(eq(pagamentos.id, id));
  await auditar(req, {
    acao: "gerar_cobranca",
    entidade: "pagamento",
    entidadeId: id,
    para: cobrador.nome,
  });
  const [atualizado] = await buscarPagamento(id, contaId);
  res.json(atualizado);
});

export default router;
