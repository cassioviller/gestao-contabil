import { and, eq, sql } from "drizzle-orm";
import { avisos, clientes, contas, db } from "@workspace/db";
import { normalizarTelefone } from "@workspace/dominio";
import { mensageiro } from "./externos";
import { enfileirar } from "./jobs";

type Executor = Pick<typeof db, "insert">;

export type NovoAviso = {
  contaId: number;
  clienteId: number | null;
  canal: "email" | "whatsapp" | "portal";
  destino: string | null;
  modelo: string;
  assunto?: string | null;
  corpo: string;
  /** Registro que motivou o aviso (para não avisar duas vezes). */
  referenciaEntidade?: string | null;
  referenciaId?: number | null;
};

/**
 * Grava o aviso e enfileira o envio. Quem chama escolhe o canal e o destino;
 * `destinoDoCliente` ajuda a achar o destino a partir do cadastro.
 */
export async function criarAviso(executor: Executor, dados: NovoAviso): Promise<number> {
  const [linha] = await executor
    .insert(avisos)
    .values({
      contaId: dados.contaId,
      clienteId: dados.clienteId,
      canal: dados.canal,
      destino: dados.destino,
      modelo: dados.modelo,
      assunto: dados.assunto ?? null,
      corpo: dados.corpo,
      referenciaEntidade: dados.referenciaEntidade ?? null,
      referenciaId: dados.referenciaId ?? null,
    })
    .returning({ id: avisos.id });
  await enfileirar(executor, {
    tipo: "avisos.enviar",
    dados: { avisoId: linha.id },
    contaId: dados.contaId,
  });
  return linha.id;
}

/** Já existe aviso (não falhado) para esta referência e modelo? */
export async function jaAvisado(
  contaId: number,
  modelo: string,
  referenciaEntidade: string,
  referenciaId: number,
): Promise<boolean> {
  const [linha] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(avisos)
    .where(
      and(
        eq(avisos.contaId, contaId),
        eq(avisos.modelo, modelo),
        eq(avisos.referenciaEntidade, referenciaEntidade),
        eq(avisos.referenciaId, referenciaId),
        sql`${avisos.status} <> 'falhou'`,
      ),
    );
  return (linha?.n ?? 0) > 0;
}

/** E-mail ou WhatsApp do cliente para o canal pedido; `null` se não tem. */
export async function destinoDoCliente(
  contaId: number,
  clienteId: number,
  canal: NovoAviso["canal"],
): Promise<{ destino: string | null; nome: string } | null> {
  const [c] = await db
    .select({ email: clientes.email, whatsapp: clientes.whatsapp, nome: clientes.razaoSocial })
    .from(clientes)
    .where(and(eq(clientes.id, clienteId), eq(clientes.contaId, contaId)));
  if (!c) return null;
  if (canal === "email") return { destino: c.email?.trim() || null, nome: c.nome };
  if (canal === "whatsapp")
    return { destino: c.whatsapp ? normalizarTelefone(c.whatsapp) : null, nome: c.nome };
  return { destino: c.email?.trim() || null, nome: c.nome };
}

/**
 * Manipulador do job `avisos.enviar`: manda pelo mensageiro e registra o
 * resultado. Lança erro para o job tentar de novo; a última tentativa marca
 * `falhou`.
 */
export async function enviarAviso(avisoId: number, ultimaTentativa: boolean): Promise<void> {
  const [a] = await db.select().from(avisos).where(eq(avisos.id, avisoId));
  if (!a) return;
  if (a.status === "enviado" || a.status === "entregue" || a.status === "lido") return;

  try {
    let provedorId: string;
    if (a.canal === "portal") {
      // Aviso no portal: fica disponível quando o cliente entrar; nada a enviar.
      provedorId = "portal";
    } else if (a.canal === "email") {
      if (!a.destino) throw new Error("Cliente sem e-mail cadastrado.");
      const [conta] = await db
        .select({ nome: contas.nome })
        .from(contas)
        .where(eq(contas.id, a.contaId));
      const assunto = a.assunto ?? `Aviso de ${conta?.nome ?? "seu escritório contábil"}`;
      ({ id: provedorId } = await mensageiro.enviarEmail({
        para: a.destino,
        assunto,
        texto: a.corpo,
        html: paraHtml(a.corpo),
      }));
    } else {
      if (!a.destino) throw new Error("Cliente sem WhatsApp cadastrado.");
      ({ id: provedorId } = await mensageiro.enviarWhatsapp({
        para: a.destino,
        modelo: a.modelo,
        variaveis: [a.corpo],
        texto: a.corpo,
      }));
    }
    await db
      .update(avisos)
      .set({
        status: "enviado",
        provedorId,
        enviadoEm: new Date(),
        erro: null,
        tentativas: sql`${avisos.tentativas} + 1`,
      })
      .where(eq(avisos.id, avisoId));
  } catch (erro) {
    const mensagem = erro instanceof Error ? erro.message : String(erro);
    await db
      .update(avisos)
      .set({
        status: ultimaTentativa ? "falhou" : "pendente",
        erro: mensagem.slice(0, 1000),
        tentativas: sql`${avisos.tentativas} + 1`,
      })
      .where(eq(avisos.id, avisoId));
    throw erro;
  }
}

function paraHtml(texto: string): string {
  const escapado = texto.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return `<div style="font-family:sans-serif;white-space:pre-wrap">${escapado}</div>`;
}
