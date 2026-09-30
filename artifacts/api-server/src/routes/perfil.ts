import { Router } from "express";
import { eq } from "drizzle-orm";
import { contas, db } from "@workspace/db";
import { SalvarPerfilBody } from "@workspace/api-zod";
import { HttpError } from "../lib/http";
import { contaDaRequisicao } from "../middlewares/autenticacao";

const router = Router();

const campos = {
  id: contas.id,
  nome: contas.nome,
  cnpj: contas.cnpj,
  responsavel: contas.responsavel,
  crc: contas.crc,
  telefone: contas.telefone,
  email: contas.email,
  endereco: contas.endereco,
};

// GET /api/perfil
router.get("/", async (req, res) => {
  const contaId = contaDaRequisicao(req);
  const [perfil] = await db.select(campos).from(contas).where(eq(contas.id, contaId));
  if (!perfil) throw new HttpError(404, "Escritório não encontrado.");
  res.json(perfil);
});

// PUT /api/perfil
router.put("/", async (req, res) => {
  const contaId = contaDaRequisicao(req);
  const dados = SalvarPerfilBody.parse(req.body);

  // O `where` é pelo id da sessão, nunca por um id do corpo: assim não existe
  // requisição capaz de editar o perfil de outro escritório.
  const [perfil] = await db
    .update(contas)
    .set(dados)
    .where(eq(contas.id, contaId))
    .returning(campos);
  if (!perfil) throw new HttpError(404, "Escritório não encontrado.");
  res.json(perfil);
});

export default router;
