import { timingSafeEqual } from "node:crypto";
import { Router, type RequestHandler } from "express";
import { desc, eq } from "drizzle-orm";
import { db, jobs } from "@workspace/db";
import { ExecutarJobsBody, ListarJobsQueryParams } from "@workspace/api-zod";
import { HttpError } from "../lib/http";
import { exigirPapel } from "../middlewares/autenticacao";
import { agendarRecorrentes, processarJobs } from "../servicos/jobs";

/**
 * `POST /api/jobs/executar` é chamado por um agendador externo, sem sessão:
 * o que o autoriza é o token de serviço `TOKEN_JOBS`.
 */
export const exigirTokenJobs: RequestHandler = (req, _res, next) => {
  const esperado = process.env.TOKEN_JOBS;
  if (!esperado) {
    throw new HttpError(503, "TOKEN_JOBS não configurado; a fila não pode ser disparada.", undefined, "jobs_desligados");
  }
  const cabecalho = req.headers.authorization ?? "";
  const recebido = cabecalho.startsWith("Bearer ") ? cabecalho.slice(7).trim() : "";
  const a = Buffer.from(recebido);
  const b = Buffer.from(esperado);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    throw new HttpError(401, "Token de serviço inválido.");
  }
  next();
};

export const executarJobs: RequestHandler = async (req, res) => {
  const { limiteMs } = ExecutarJobsBody.parse(req.body ?? {});
  await agendarRecorrentes();
  const resultado = await processarJobs({ limiteMs });
  req.log?.info(resultado, "rodada de jobs");
  res.json(resultado);
};

const router = Router();

// GET /api/jobs — só admin, para ver o que a fila anda fazendo.
router.get("/", exigirPapel("admin"), async (req, res) => {
  const { status } = ListarJobsQueryParams.parse(req.query);
  const consulta = db.select().from(jobs);
  const lista = await (status ? consulta.where(eq(jobs.status, status)) : consulta)
    .orderBy(desc(jobs.id))
    .limit(100);
  res.json(lista);
});

export default router;
