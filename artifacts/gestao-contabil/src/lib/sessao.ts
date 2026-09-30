import type { Query, QueryClient } from "@tanstack/react-query";
import { getGetSessaoAtualQueryKey, type SessaoAtual } from "@workspace/api-client-react";

/** Chave da query de sessão: a raiz do app (`Autenticado`) observa esta query. */
export const CHAVE_SESSAO = getGetSessaoAtualQueryKey();

type QualquerQuery = Query<unknown, unknown, unknown, readonly unknown[]>;

export function ehSessao(query?: QualquerQuery): boolean {
  return query?.queryKey?.[0] === CHAVE_SESSAO[0];
}

/**
 * Descarta o cache do usuário anterior sem destruir a query de sessão.
 * `queryClient.clear()` removia a query que a raiz observa, e o observador
 * ficava preso ao objeto destruído: o login respondia 200 e a tela não saía
 * do formulário.
 */
function descartarDadosDoUsuario(qc: QueryClient): void {
  qc.removeQueries({ predicate: (q) => !ehSessao(q) });
}

/** Depois de um login: os dados da tela são deste usuário a partir de agora. */
export function assumirSessao(qc: QueryClient, sessao: SessaoAtual): void {
  descartarDadosDoUsuario(qc);
  qc.setQueryData(CHAVE_SESSAO, sessao);
}

/**
 * Depois de sair (ou de a sessão cair): reconsulta `/auth/eu`, que responde
 * 401 e devolve a tela de login. Serve também quando o cookie já tinha
 * caducado — o pedido de sair falha, mas a sessão local precisa cair igual.
 */
export function encerrarSessaoLocal(qc: QueryClient): void {
  descartarDadosDoUsuario(qc);
  void qc.resetQueries({ queryKey: CHAVE_SESSAO });
}
