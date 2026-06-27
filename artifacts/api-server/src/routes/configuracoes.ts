import { Router } from "express";
import { eq } from "drizzle-orm";
import { db } from "@workspace/db";
import { configuracoes } from "@workspace/db";

const router = Router();

// GET /api/configuracoes/:chave
router.get("/:chave", async (req, res) => {
  const [conf] = await db.select().from(configuracoes).where(eq(configuracoes.chave, req.params.chave));
  if (!conf) {
    res.json({ chave: req.params.chave, valor: "" });
    return;
  }
  res.json(conf);
});

// PUT /api/configuracoes/:chave
router.put("/:chave", async (req, res) => {
  const { valor } = req.body;
  await db.insert(configuracoes)
    .values({ chave: req.params.chave, valor })
    .onConflictDoUpdate({ target: configuracoes.chave, set: { valor } });
  res.json({ chave: req.params.chave, valor });
});

export default router;
