import { timingSafeEqual } from "node:crypto";
import { Router } from "express";
import { and, eq, ne } from "drizzle-orm";
import { db, eventosWebhook, pagamentos } from "@workspace/db";
import { hojeBR } from "@workspace/dominio";
import { HttpError } from "../lib/http";
import { registrarAuditoria } from "../lib/auditoria";

const router = Router();

function tokenConfere(recebido: string | undefined, esperado: string | undefined): boolean {
  if (!recebido || !esperado) return false;
  const a = Buffer.from(recebido);
  const b = Buffer.from(esperado);
  return a.length === b.length && timingSafeEqual(a, b);
}

const EVENTOS_PAGO = new Set(["PAYMENT_RECEIVED", "PAYMENT_CONFIRMED"]);

/**
 * POST /api/webhooks/asaas — baixa automática do honorário. O Asaas manda o
 * token configurado no cabeçalho `asaas-access-token`; sem ele nada entra.
 * Cada evento é gravado uma vez (`eventos_webhook`): reenvio não reprocessa.
 */
router.post("/asaas", async (req, res) => {
  const esperado = process.env.ASAAS_WEBHOOK_TOKEN;
  if (!esperado)
    throw new HttpError(
      503,
      "ASAAS_WEBHOOK_TOKEN não configurado.",
      undefined,
      "webhook_desligado",
    );
  if (!tokenConfere(req.headers["asaas-access-token"] as string | undefined, esperado)) {
    throw new HttpError(401, "Token do webhook inválido.");
  }

  const corpo = (req.body ?? {}) as {
    id?: string;
    event?: string;
    payment?: { id?: string; paymentDate?: string; externalReference?: string };
  };
  const evento = corpo.event ?? "desconhecido";
  const cobrancaId = corpo.payment?.id;
  const eventoId = corpo.id ?? (cobrancaId ? `${evento}:${cobrancaId}` : `${evento}:${Date.now()}`);

  const [registrado] = await db
    .insert(eventosWebhook)
    .values({
      provedor: "asaas",
      eventoId,
      tipo: evento,
      payload: corpo as Record<string, unknown>,
    })
    .onConflictDoNothing()
    .returning({ id: eventosWebhook.id });
  if (!registrado) {
    res.json({ ok: true, duplicado: true });
    return;
  }

  if (EVENTOS_PAGO.has(evento) && cobrancaId) {
    const baixados = await db
      .update(pagamentos)
      .set({
        status: "pago",
        dataPagamento: corpo.payment?.paymentDate?.slice(0, 10) || hojeBR(),
        forma: "asaas",
        atualizadoEm: new Date(),
      })
      .where(and(eq(pagamentos.cobrancaExternaId, cobrancaId), ne(pagamentos.status, "pago")))
      .returning({ id: pagamentos.id, contaId: pagamentos.contaId });
    for (const p of baixados) {
      await registrarAuditoria({
        contaId: p.contaId,
        ator: "webhook",
        acao: "baixa_automatica",
        entidade: "pagamento",
        entidadeId: p.id,
        para: "pago",
      });
    }
    req.log?.info({ evento, cobrancaId, baixados: baixados.length }, "webhook asaas");
  }

  await db
    .update(eventosWebhook)
    .set({ processadoEm: new Date() })
    .where(eq(eventosWebhook.id, registrado.id));
  res.json({ ok: true });
});

export default router;
