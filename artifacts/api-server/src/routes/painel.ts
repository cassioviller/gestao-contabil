import { Router } from "express";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { checklistItens, clientes, competencias, pagamentos } from "@workspace/db";
import { contaDaRequisicao } from "../middlewares/autenticacao";

const router = Router();

// GET /api/painel
router.get("/", async (req, res) => {
  const contaId = contaDaRequisicao(req);

  const todos = await db.select().from(clientes).where(eq(clientes.contaId, contaId));
  const clientesAtivos = todos.filter((c) => c.ativo).length;

  const [comp] = await db
    .select()
    .from(competencias)
    .where(eq(competencias.contaId, contaId))
    .orderBy(sql`${competencias.ano} desc`, sql`${competencias.mes} desc`)
    .limit(1);

  if (!comp) {
    res.json({ clientesAtivos, competenciaAtual: null });
    return;
  }

  const [obr] = await db
    .select({
      total: sql<number>`count(*)::int`,
      feitos: sql<number>`count(*) filter (where ${checklistItens.status} = 'enviado')::int`,
      emitidos: sql<number>`count(*) filter (where ${checklistItens.status} = 'emitido')::int`,
      pendentes: sql<number>`count(*) filter (where ${checklistItens.status} = 'pendente')::int`,
    })
    .from(checklistItens)
    .where(and(eq(checklistItens.competenciaId, comp.id), eq(checklistItens.contaId, contaId)));

  const [pag] = await db
    .select({
      total: sql<number>`count(*)::int`,
      pagos: sql<number>`count(*) filter (where ${pagamentos.status} = 'pago')::int`,
      pendentes: sql<number>`count(*) filter (where ${pagamentos.status} = 'pendente')::int`,
      recebido: sql<string>`coalesce(sum(${pagamentos.valor}) filter (where ${pagamentos.status} = 'pago'), 0)::text`,
      aReceber: sql<string>`coalesce(sum(${pagamentos.valor}) filter (where ${pagamentos.status} = 'pendente'), 0)::text`,
    })
    .from(pagamentos)
    .where(and(eq(pagamentos.competenciaId, comp.id), eq(pagamentos.contaId, contaId)));

  res.json({
    clientesAtivos,
    competenciaAtual: {
      id: comp.id,
      ano: comp.ano,
      mes: comp.mes,
      resumo: { obrigacoes: obr, pagamentos: pag },
    },
  });
});

export default router;
