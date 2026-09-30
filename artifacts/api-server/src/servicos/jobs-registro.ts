import { and, eq, gt, inArray, isNull, lt, sql } from "drizzle-orm";
import {
  avisos,
  checklistItens,
  clientes,
  competencias,
  contas,
  db,
  eventosWebhook,
  jobs,
  pagamentos,
  tentativasLogin,
  tiposObrigacao,
  tokensAcesso,
} from "@workspace/db";
import {
  competenciaCurta,
  formatarData,
  formatarMoeda,
  hojeBR,
  montarAviso,
  normalizarTelefone,
  somarDias,
} from "@workspace/dominio";
import { limparSessoesVencidas } from "../lib/sessao";
import { gerarItensDaCompetencia } from "../routes/competencias";
import { criarAviso, enviarAviso, jaAvisado } from "./avisos";
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

/** Canal e destino do cliente conforme a forma de envio escolhida no cadastro. */
function destinoAutomatico(c: {
  formaEnvio: string | null;
  email: string | null;
  whatsapp: string | null;
}): { canal: "email" | "whatsapp"; destino: string } | null {
  if (c.formaEnvio === "email" && c.email?.trim())
    return { canal: "email", destino: c.email.trim() };
  if (c.formaEnvio === "whatsapp") {
    const numero = normalizarTelefone(c.whatsapp);
    if (numero) return { canal: "whatsapp", destino: numero };
  }
  return null;
}

/** Três dias antes do vencimento, lembra o cliente da guia que ainda não foi enviada. */
registrarJob("vencimentos-d3", async ({ log }) => {
  const alvo = somarDias(hojeBR(), 3);
  const itens = await db
    .select({
      id: checklistItens.id,
      contaId: checklistItens.contaId,
      clienteId: clientes.id,
      cliente: clientes.razaoSocial,
      formaEnvio: clientes.formaEnvio,
      email: clientes.email,
      whatsapp: clientes.whatsapp,
      obrigacao: tiposObrigacao.nome,
      vencimento: checklistItens.vencimento,
      ano: competencias.ano,
      mes: competencias.mes,
      escritorio: contas.nome,
      contato: contas.telefone,
    })
    .from(checklistItens)
    .innerJoin(clientes, eq(clientes.id, checklistItens.clienteId))
    .innerJoin(tiposObrigacao, eq(tiposObrigacao.id, checklistItens.tipoObrigacaoId))
    .innerJoin(competencias, eq(competencias.id, checklistItens.competenciaId))
    .innerJoin(contas, eq(contas.id, checklistItens.contaId))
    .where(
      and(
        inArray(checklistItens.status, ["pendente", "emitido"]),
        eq(checklistItens.vencimento, alvo),
        eq(clientes.ativo, true),
        eq(contas.ativo, true),
      ),
    );

  let criados = 0;
  for (const i of itens) {
    const destino = destinoAutomatico(i);
    if (!destino) continue;
    if (await jaAvisado(i.contaId, "vencimento_proximo", "checklist_item", i.id)) continue;
    const msg = montarAviso("vencimento_proximo", {
      cliente: i.cliente,
      escritorio: i.escritorio,
      contato: i.contato ?? undefined,
      obrigacao: i.obrigacao,
      competencia: competenciaCurta(i.ano, i.mes),
      vencimento: i.vencimento ? formatarData(i.vencimento) : undefined,
    });
    await criarAviso(db, {
      contaId: i.contaId,
      clienteId: i.clienteId,
      canal: destino.canal,
      destino: destino.destino,
      modelo: "vencimento_proximo",
      assunto: msg.assunto,
      corpo: msg.texto,
      referenciaEntidade: "checklist_item",
      referenciaId: i.id,
    });
    criados += 1;
  }
  log.info({ alvo, itens: itens.length, criados }, "avisos de vencimento em 3 dias");
});

/** Honorário vencido há mais de `dias_para_cobrar` dias gera cobrança (uma por semana). */
registrarJob("honorarios-vencidos", async ({ log }) => {
  const hoje = hojeBR();
  const pendentes = await db
    .select({
      id: pagamentos.id,
      contaId: pagamentos.contaId,
      clienteId: clientes.id,
      cliente: clientes.razaoSocial,
      formaEnvio: clientes.formaEnvio,
      email: clientes.email,
      whatsapp: clientes.whatsapp,
      valor: pagamentos.valor,
      vencimento: pagamentos.vencimento,
      ano: competencias.ano,
      mes: competencias.mes,
      escritorio: contas.nome,
      contato: contas.telefone,
      chavePix: contas.chavePix,
      diasParaCobrar: contas.diasParaCobrar,
    })
    .from(pagamentos)
    .innerJoin(clientes, eq(clientes.id, pagamentos.clienteId))
    .innerJoin(competencias, eq(competencias.id, pagamentos.competenciaId))
    .innerJoin(contas, eq(contas.id, pagamentos.contaId))
    .where(
      and(
        eq(pagamentos.status, "pendente"),
        sql`${pagamentos.vencimento} is not null`,
        eq(clientes.ativo, true),
        eq(contas.ativo, true),
      ),
    );

  const umaSemanaAtras = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  let criados = 0;
  for (const p of pendentes) {
    if (!p.vencimento || somarDias(p.vencimento, p.diasParaCobrar) > hoje) continue;
    const destino = destinoAutomatico(p);
    if (!destino) continue;
    const [recente] = await db
      .select({ id: avisos.id })
      .from(avisos)
      .where(
        and(
          eq(avisos.referenciaEntidade, "pagamento"),
          eq(avisos.referenciaId, p.id),
          eq(avisos.modelo, "honorario_vencido"),
          gt(avisos.criadoEm, umaSemanaAtras),
        ),
      )
      .limit(1);
    if (recente) continue;
    const msg = montarAviso("honorario_vencido", {
      cliente: p.cliente,
      escritorio: p.escritorio,
      contato: p.contato ?? undefined,
      competencia: competenciaCurta(p.ano, p.mes),
      valor: p.valor ? formatarMoeda(p.valor) : undefined,
      vencimento: formatarData(p.vencimento),
      chavePix: p.chavePix ?? undefined,
    });
    await criarAviso(db, {
      contaId: p.contaId,
      clienteId: p.clienteId,
      canal: destino.canal,
      destino: destino.destino,
      modelo: "honorario_vencido",
      assunto: msg.assunto,
      corpo: msg.texto,
      referenciaEntidade: "pagamento",
      referenciaId: p.id,
    });
    criados += 1;
  }
  log.info({ pendentes: pendentes.length, criados }, "avisos de honorário vencido");
});
