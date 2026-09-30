import { Router } from "express";
import { sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { hojeBR, somarMeses } from "@workspace/dominio";
import { GetProdutividadeQueryParams } from "@workspace/api-zod";
import { contaDaRequisicao } from "../middlewares/autenticacao";

const router = Router();

type PorUsuario = {
  usuario_id: number | null;
  login: string | null;
  nome: string | null;
  enviados: number;
  atrasados_no_envio: number;
  tempo_medio_horas: number | null;
};

type PorCliente = { cliente_id: number; cliente: string; total: number; atrasadas: number };

/**
 * GET /api/produtividade?meses=6
 *
 * Por colaborador: guias levadas a `enviado` (pela auditoria de status), quantas
 * já estavam vencidas na hora do envio e o tempo médio entre `emitido` e
 * `enviado`. Por cliente: obrigações do período e quantas atrasaram (vencidas
 * sem envio, ou enviadas depois do vencimento).
 */
router.get("/", async (req, res) => {
  const contaId = contaDaRequisicao(req);
  const { meses = 6 } = GetProdutividadeQueryParams.parse(req.query);
  const ate = hojeBR();
  const de = somarMeses(ate, -meses);
  const deAnoMes = Number(de.slice(0, 4)) * 100 + Number(de.slice(5, 7));

  const porUsuario = (
    await db.execute<PorUsuario>(sql`
      select a.usuario_id,
             u.login,
             u.nome,
             count(*)::int as enviados,
             count(*) filter (
               where ci.vencimento is not null
                 and ci.vencimento < (a.quando at time zone 'America/Sao_Paulo')::date
             )::int as atrasados_no_envio,
             avg(extract(epoch from (a.quando - e.quando)) / 3600)::float as tempo_medio_horas
        from auditoria a
        join checklist_itens ci on ci.id = a.entidade_id
        left join usuarios u on u.id = a.usuario_id
        left join lateral (
          select max(e.quando) as quando
            from auditoria e
           where e.entidade = 'checklist_item' and e.entidade_id = a.entidade_id
             and e.acao = 'status_item' and e.para = 'emitido' and e.quando < a.quando
        ) e on true
       where a.conta_id = ${contaId}
         and a.entidade = 'checklist_item'
         and a.acao = 'status_item'
         and a.para = 'enviado'
         and a.quando >= ${de}::date
       group by a.usuario_id, u.login, u.nome
       order by enviados desc, u.login
    `)
  ).rows;

  const porCliente = (
    await db.execute<PorCliente>(sql`
      select ci.cliente_id,
             c.razao_social as cliente,
             count(*)::int as total,
             count(*) filter (
               where ci.vencimento is not null and (
                 (ci.status in ('pendente', 'emitido') and ci.vencimento < ${ate}::date)
                 or (ci.status = 'enviado' and ci.enviado_em is not null
                     and (ci.enviado_em at time zone 'America/Sao_Paulo')::date > ci.vencimento)
               )
             )::int as atrasadas
        from checklist_itens ci
        join competencias k on k.id = ci.competencia_id
        join clientes c on c.id = ci.cliente_id
       where ci.conta_id = ${contaId}
         and k.rotulo is null
         and (k.ano * 100 + k.mes) >= ${deAnoMes}
       group by ci.cliente_id, c.razao_social
       having count(*) filter (
               where ci.vencimento is not null and (
                 (ci.status in ('pendente', 'emitido') and ci.vencimento < ${ate}::date)
                 or (ci.status = 'enviado' and ci.enviado_em is not null
                     and (ci.enviado_em at time zone 'America/Sao_Paulo')::date > ci.vencimento)
               )
             ) > 0
       order by atrasadas desc, c.razao_social
       limit 100
    `)
  ).rows;

  res.json({
    periodo: { de, ate, meses },
    porUsuario: porUsuario.map((u) => ({
      usuarioId: u.usuario_id,
      login: u.login,
      nome: u.nome,
      enviados: u.enviados,
      atrasadosNoEnvio: u.atrasados_no_envio,
      tempoMedioHoras:
        u.tempo_medio_horas === null ? null : Math.round(u.tempo_medio_horas * 10) / 10,
    })),
    porCliente: porCliente.map((c) => ({
      clienteId: c.cliente_id,
      cliente: c.cliente,
      total: c.total,
      atrasadas: c.atrasadas,
    })),
  });
});

export default router;
