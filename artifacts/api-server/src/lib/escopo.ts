import { and, eq, type Column, type SQL } from "drizzle-orm";
import { clientes, db } from "@workspace/db";
import { HttpError } from "./http";

/** `escritorio` = registro sem cliente; `clientes` = os de algum cliente. */
export type Escopo = "todos" | "escritorio" | "clientes" | undefined;

/**
 * Traduz o filtro de escopo da tela na condição sobre a coluna `cliente_id`.
 * As funções `isNull`/`isNotNull` chegam por parâmetro só para o módulo não
 * precisar importar o drizzle duas vezes com nomes diferentes.
 */
export function filtroEscopo(
  escopo: Escopo,
  coluna: Column,
  nulo: (c: Column) => SQL,
  naoNulo: (c: Column) => SQL,
): SQL | undefined {
  if (escopo === "escritorio") return nulo(coluna);
  if (escopo === "clientes") return naoNulo(coluna);
  return undefined;
}

/**
 * Um `clienteId` vindo do corpo só é aceito se for da conta de quem pede — sem
 * isto, um escritório poderia pendurar uma despesa (ou um funcionário) no
 * cliente de outro. `null`/ausente é válido: significa "do próprio escritório".
 */
export async function validarCliente(
  contaId: number,
  clienteId: number | null | undefined,
): Promise<void> {
  if (clienteId == null) return;
  const [cliente] = await db
    .select({ id: clientes.id })
    .from(clientes)
    .where(and(eq(clientes.id, clienteId), eq(clientes.contaId, contaId)));
  if (!cliente) throw new HttpError(400, "Cliente não encontrado.");
}
