import { and, eq, isNull, lt, sql } from "drizzle-orm";
import {
  avisos,
  competencias,
  contas,
  db,
  eventosWebhook,
  jobs,
  tentativasLogin,
  tokensAcesso,
} from "@workspace/db";
import { hojeBR } from "@workspace/dominio";
import { limparSessoesVencidas } from "../lib/sessao";
import { gerarItensDaCompetencia } from "../routes/competencias";
import { enviarAviso } from "./avisos";
import { registrarJob } from "./jobs";

/**
 * Os manipuladores de cada tipo de job. Importado uma vez no boot da API
 * (`index.ts`); registrar aqui é o que faz um tipo existir para a fila.
 */

registrarJob("avisos.enviar", async ({ dados, tentativa, log }) => {
  const avisoId = Number(dados.avisoId);
  if (!avisoId) throw new Error("avisos.enviar sem avisoId.");
  // A última tentativa do job é a que marca o aviso como falhou.
  await enviarAviso(avisoId, tentativa >= 5);
  log.info({ avisoId }, "aviso enviado");
});

registrarJob("limpeza", async ({ log }) => {
  const agora = new Date();
  const dias = (n: number) => new Date(agora.getTime() - n * 24 * 60 * 60 * 1000);
  await limparSessoesVencidas();
  await db.delete(tokensAcesso).where(lt(tokensAcesso.expiraEm, dias(7)));
  await db.delete(tentativasLogin).where(lt(tentativasLogin.quando, dias(30)));
  await db.delete(eventosWebhook).where(lt(eventosWebhook.recebidoEm, dias(90)));
  await db
    .delete(jobs)
    .where(and(sql`${jobs.status} in ('concluido', 'falhou')`, lt(jobs.criadoEm, dias(30))));
  await db.delete(avisos).where(and(eq(avisos.status, "enviado"), lt(avisos.criadoEm, dias(365))));
  log.info("limpeza concluída");
});

/** Dia 1: abre o mês corrente para as contas com abertura automática. */
registrarJob("abrir-competencia", async ({ log }) => {
  const hoje = hojeBR();
  const ano = Number(hoje.slice(0, 4));
  const mes = Number(hoje.slice(5, 7));
  const automaticas = await db
    .select({ id: contas.id, nome: contas.nome })
    .from(contas)
    .where(and(eq(contas.ativo, true), eq(contas.aberturaAutomatica, true)));

  for (const conta of automaticas) {
    const [existente] = await db
      .select({ id: competencias.id })
      .from(competencias)
      .where(
        and(
          eq(competencias.contaId, conta.id),
          eq(competencias.ano, ano),
          eq(competencias.mes, mes),
          isNull(competencias.rotulo),
        ),
      );
    if (existente) continue;
    await db.transaction(async (tx) => {
      const [comp] = await tx
        .insert(competencias)
        .values({ contaId: conta.id, ano, mes, rotulo: null })
        .onConflictDoNothing()
        .returning({ id: competencias.id, ano: competencias.ano, mes: competencias.mes });
      if (!comp) return;
      const r = await gerarItensDaCompetencia(tx, conta.id, comp, false);
      log.info({ contaId: conta.id, ano, mes, ...r }, "competência aberta automaticamente");
    });
  }
});
