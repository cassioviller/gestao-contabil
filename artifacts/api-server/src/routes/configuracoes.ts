import { Router } from "express";
import { and, eq } from "drizzle-orm";
import { db } from "@workspace/db";
import { configuracoes } from "@workspace/db";
import {
  GetConfiguracaoParams,
  SalvarConfiguracaoParams,
  SalvarConfiguracaoBody,
} from "@workspace/api-zod";
import { contaDaRequisicao } from "../middlewares/autenticacao";

const router = Router();

// GET /api/configuracoes/:chave
router.get("/:chave", async (req, res) => {
  const contaId = contaDaRequisicao(req);
  const { chave } = GetConfiguracaoParams.parse(req.params);
  const [conf] = await db
    .select()
    .from(configuracoes)
    .where(and(eq(configuracoes.contaId, contaId), eq(configuracoes.chave, chave)));
  if (!conf) {
    res.json({ chave, valor: "" });
    return;
  }
  res.json(conf);
});

// PUT /api/configuracoes/:chave
router.put("/:chave", async (req, res) => {
  const contaId = contaDaRequisicao(req);
  const { chave } = SalvarConfiguracaoParams.parse(req.params);
  const { valor } = SalvarConfiguracaoBody.parse(req.body);
  await db
    .insert(configuracoes)
    .values({ contaId, chave, valor })
    .onConflictDoUpdate({
      target: [configuracoes.contaId, configuracoes.chave],
      set: { valor },
    });
  res.json({ chave, valor });
});

export default router;
