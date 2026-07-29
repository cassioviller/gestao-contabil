import { Router } from "express";
import { eq } from "drizzle-orm";
import { db } from "@workspace/db";
import { configuracoes } from "@workspace/db";
import {
  GetConfiguracaoParams,
  SalvarConfiguracaoParams,
  SalvarConfiguracaoBody,
} from "@workspace/api-zod";

const router = Router();

// GET /api/configuracoes/:chave
router.get("/:chave", async (req, res) => {
  const { chave } = GetConfiguracaoParams.parse(req.params);
  const [conf] = await db.select().from(configuracoes).where(eq(configuracoes.chave, chave));
  if (!conf) {
    res.json({ chave, valor: "" });
    return;
  }
  res.json(conf);
});

// PUT /api/configuracoes/:chave
router.put("/:chave", async (req, res) => {
  const { chave } = SalvarConfiguracaoParams.parse(req.params);
  const { valor } = SalvarConfiguracaoBody.parse(req.body);
  await db.insert(configuracoes)
    .values({ chave, valor })
    .onConflictDoUpdate({ target: configuracoes.chave, set: { valor } });
  res.json({ chave, valor });
});

export default router;
