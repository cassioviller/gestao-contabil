import { sql, type SQL } from "drizzle-orm";

type Executor = { execute(query: SQL): Promise<{ rowCount?: number | null }> };

/**
 * Vincula aos clientes as obrigações do catálogo marcadas como automáticas e
 * compatíveis com o regime de cada um. Só acrescenta: nunca desvincula o que
 * a contadora marcou à mão, e o que já existe é ignorado pelo índice único.
 *
 * Com `clienteId`, só aquele cliente (ao definir/trocar o regime dele); sem,
 * todos os ativos da conta (o botão "vincular automáticas" da tela de Tipos,
 * para pôr a base em dia depois de ampliar o catálogo).
 */
export async function vincularObrigacoesAutomaticas(
  executor: Executor,
  contaId: number,
  clienteId?: number,
): Promise<number> {
  const resultado = await executor.execute(sql`
    insert into cliente_obrigacoes (cliente_id, tipo_obrigacao_id)
    select c.id, t.id
      from clientes c
      join tipos_obrigacao t on t.conta_id = c.conta_id
     where c.conta_id = ${contaId}
       and c.ativo
       and c.regime is not null
       and t.ativo
       and t.vincular_automatico
       and (t.regimes is null or cardinality(t.regimes) = 0 or c.regime = any(t.regimes))
       ${clienteId !== undefined ? sql`and c.id = ${clienteId}` : sql``}
    on conflict (cliente_id, tipo_obrigacao_id) do nothing
  `);
  return resultado.rowCount ?? 0;
}
