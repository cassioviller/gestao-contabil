/**
 * Ordem em que as tabelas podem ser inseridas sem violar chave estrangeira:
 * pai antes de filho. Usada pelo export do seed e pela carga no primeiro boot.
 *
 * `sessoes` fica de fora — sessão é estado de quem está usando agora, não dado
 * do escritório, e um cookie de desenvolvimento não vale no deploy.
 */
export const ORDEM_TABELAS = [
  "contas",
  "usuarios",
  "clientes",
  "tipos_obrigacao",
  "cliente_obrigacoes",
  "competencias",
  "checklist_itens",
  "pagamentos",
  "debitos",
  "credenciais",
  "processos",
  "processo_etapas",
  "configuracoes",
  "cobrancas",
  "despesas",
  "funcionarios",
  "ferias",
  "folha_lancamentos",
] as const;

/** Tabelas cujo `id` vem de uma sequence que precisa ser reposicionada após a carga. */
export const TABELAS_COM_SEQUENCE = ORDEM_TABELAS.filter(
  (t) => t !== "configuracoes",
);
