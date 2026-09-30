import { Router, type IRouter } from "express";
import { sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { HealthCheckResponse } from "@workspace/api-zod";

const router: IRouter = Router();

/** Vivo? Não toca o banco: é o que o deploy consulta no boot. */
router.get("/healthz", (_req, res) => {
  const data = HealthCheckResponse.parse({ status: "ok" });
  res.json(data);
});

/**
 * Pronto para servir? Faz um `select 1` com prazo curto. Se o banco caiu
 * depois do boot, é aqui que aparece — o `/healthz` continuaria dizendo "ok".
 */
router.get("/readyz", async (_req, res) => {
  try {
    await Promise.race([
      db.execute(sql`select 1`),
      new Promise((_, rejeitar) =>
        setTimeout(() => rejeitar(new Error("banco não respondeu em 3 s")), 3_000),
      ),
    ]);
    res.json({ status: "ok", banco: "ok" });
  } catch (err) {
    res.status(503).json({
      status: "indisponivel",
      banco: err instanceof Error ? err.message : "erro",
    });
  }
});

export default router;
