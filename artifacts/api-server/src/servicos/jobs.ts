import { sql } from "drizzle-orm";
import { db, jobs } from "@workspace/db";
import { hojeBR } from "@workspace/dominio";
import { logger } from "../lib/logger";

/**
 * Fila de tarefas na tabela `jobs`, no mesmo Postgres. Sem processo residente:
 * o autoscale desliga sem tráfego, então quem puxa a fila é `POST /jobs/executar`
 * (agendador externo a cada 5 min) ou, onde há processo permanente, o laço
 * interno (`JOBS_INTERVALO_S`). Várias instâncias podem rodar ao mesmo tempo:
 * cada uma pega uma tarefa com `for update skip locked`.
 *
 * Garantias: ao menos uma execução (a tarefa travada há mais de 10 min volta à
 * fila), até `max_tentativas` com espera crescente, `chave` única para não
 * enfileirar a mesma coisa duas vezes.
 */

export type ContextoJob = {
  id: number;
  tipo: string;
  dados: Record<string, unknown>;
  contaId: number | null;
  tentativa: number;
  log: typeof logger;
};

export type ManipuladorJob = (ctx: ContextoJob) => Promise<void>;

const manipuladores = new Map<string, ManipuladorJob>();

export function registrarJob(tipo: string, fn: ManipuladorJob): void {
  manipuladores.set(tipo, fn);
}

export function tiposRegistrados(): string[] {
  return [...manipuladores.keys()];
}

type Executor = Pick<typeof db, "insert">;

export type NovoJob = {
  tipo: string;
  dados?: Record<string, unknown>;
  /** Única: enfileirar de novo a mesma chave não cria outra tarefa. */
  chave?: string;
  contaId?: number | null;
  executarEm?: Date;
  maxTentativas?: number;
};

/** Devolve o id, ou `null` se a chave já existia. */
export async function enfileirar(executor: Executor, job: NovoJob): Promise<number | null> {
  const [linha] = await executor
    .insert(jobs)
    .values({
      tipo: job.tipo,
      dados: job.dados ?? {},
      chave: job.chave ?? null,
      contaId: job.contaId ?? null,
      executarEm: job.executarEm ?? new Date(),
      maxTentativas: job.maxTentativas ?? 5,
    })
    .onConflictDoNothing({ target: jobs.chave })
    .returning({ id: jobs.id });
  return linha?.id ?? null;
}

type Reservado = {
  id: number;
  tipo: string;
  dados: Record<string, unknown>;
  conta_id: number | null;
  tentativas: number;
  max_tentativas: number;
};

/** Pega a próxima tarefa pronta, marcando-a como em execução na mesma instrução. */
async function reservar(): Promise<Reservado | null> {
  const r = await db.execute<Reservado>(sql`
    update jobs
       set status = 'executando', iniciado_em = now(), tentativas = tentativas + 1, erro = null
     where id = (
       select id from jobs
        where status = 'pendente' and executar_em <= now()
        order by executar_em, id
        limit 1
        for update skip locked
     )
    returning id, tipo, dados, conta_id, tentativas, max_tentativas
  `);
  return r.rows[0] ?? null;
}

/** Tarefa que ficou "executando" por mais de 10 min é de um processo que morreu. */
async function retomarTravadas(): Promise<void> {
  await db.execute(sql`
    update jobs
       set status = 'pendente', erro = 'retomada: o processo anterior não terminou'
     where status = 'executando' and iniciado_em < now() - interval '10 minutes'
  `);
}

function esperaMinutos(tentativa: number): number {
  return Math.min(60, 2 ** tentativa);
}

async function concluir(id: number): Promise<void> {
  await db.execute(
    sql`update jobs set status = 'concluido', concluido_em = now() where id = ${id}`,
  );
}

async function falhar(job: Reservado, erro: unknown): Promise<void> {
  const mensagem = (erro instanceof Error ? erro.message : String(erro)).slice(0, 2000);
  if (job.tentativas >= job.max_tentativas) {
    await db.execute(
      sql`update jobs set status = 'falhou', concluido_em = now(), erro = ${mensagem} where id = ${job.id}`,
    );
  } else {
    const minutos = esperaMinutos(job.tentativas);
    await db.execute(sql`
      update jobs
         set status = 'pendente', erro = ${mensagem},
             executar_em = now() + (${minutos} * interval '1 minute')
       where id = ${job.id}
    `);
  }
}

export type ResultadoRodada = { executados: number; falhas: number; restantes: number };

/** Processa a fila até acabar o tempo ou as tarefas prontas. */
export async function processarJobs(
  opcoes: { limiteMs?: number; maxJobs?: number } = {},
): Promise<ResultadoRodada> {
  const limiteMs = opcoes.limiteMs ?? Number(process.env.JOBS_TEMPO_MAX_MS ?? 240_000);
  const maxJobs = opcoes.maxJobs ?? 500;
  const inicio = Date.now();
  let executados = 0;
  let falhas = 0;

  await retomarTravadas();

  while (executados + falhas < maxJobs && Date.now() - inicio < limiteMs) {
    const job = await reservar();
    if (!job) break;
    const log = logger.child({ jobId: job.id, tipo: job.tipo, tentativa: job.tentativas });
    const manipulador = manipuladores.get(job.tipo);
    try {
      if (!manipulador) throw new Error(`Sem manipulador para o job "${job.tipo}".`);
      await manipulador({
        id: job.id,
        tipo: job.tipo,
        dados: job.dados ?? {},
        contaId: job.conta_id,
        tentativa: job.tentativas,
        log,
      });
      await concluir(job.id);
      executados += 1;
    } catch (erro) {
      log.warn({ err: erro }, "job falhou");
      await falhar(job, erro);
      falhas += 1;
    }
  }

  const [{ n }] = (
    await db.execute<{ n: number }>(
      sql`select count(*)::int n from jobs where status = 'pendente' and executar_em <= now()`,
    )
  ).rows;
  return { executados, falhas, restantes: n };
}

/**
 * Garante as tarefas recorrentes do período: a `chave` única faz o agendador
 * poder chamar isto a cada 5 minutos sem duplicar nada.
 */
export async function agendarRecorrentes(): Promise<void> {
  const hoje = hojeBR();
  await enfileirar(db, { tipo: "limpeza", chave: `limpeza:${hoje}` });
  await enfileirar(db, {
    tipo: "abrir-competencia",
    chave: `abrir-competencia:${hoje.slice(0, 7)}`,
  });
}

/** Laço interno para ambientes com processo permanente (Docker, dev). */
export function iniciarLacoInterno(): NodeJS.Timeout | null {
  const intervaloS = Number(process.env.JOBS_INTERVALO_S ?? 0);
  if (!intervaloS) return null;
  const timer = setInterval(() => {
    agendarRecorrentes()
      .then(() => processarJobs({ limiteMs: intervaloS * 1000 }))
      .catch((err) => logger.error({ err }, "laço de jobs falhou"));
  }, intervaloS * 1000);
  timer.unref();
  logger.info({ intervaloS }, "Laço interno de jobs ligado");
  return timer;
}
