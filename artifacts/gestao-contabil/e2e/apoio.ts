import type { APIRequestContext } from "@playwright/test";

/**
 * Limpeza de cliente criado por um spec. Cliente com competência gerada não
 * pode ser apagado (409 `tem_historico`): então é inativado, e some das
 * competências seguintes — o que basta para os outros specs não o verem.
 */
export async function apagarCliente(api: APIRequestContext, id: number): Promise<void> {
  const r = await api.delete(`/api/clientes/${id}`);
  if (r.status() === 409) await api.post(`/api/clientes/${id}/inativar`);
}
