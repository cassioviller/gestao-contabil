import { useState } from "react";
import { Link } from "wouter";
import { useGetProdutividade } from "@workspace/api-client-react";
import { formatarData } from "@/lib/formato";
import { mensagemDeErro } from "@/lib/erros";

/** Barra proporcional simples: mostra o peso de cada linha sem depender de gráfico. */
function Barra({ valor, maximo, cor }: { valor: number; maximo: number; cor: string }) {
  const pct = maximo > 0 ? Math.round((valor / maximo) * 100) : 0;
  return (
    <div className="h-2 w-full rounded bg-black/10 dark:bg-white/10">
      <div className={`h-2 rounded ${cor}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

export default function Produtividade() {
  const [meses, setMeses] = useState(6);
  const { data, isLoading, error } = useGetProdutividade({ meses });

  const porUsuario = data?.porUsuario ?? [];
  const porCliente = data?.porCliente ?? [];
  const maxEnviados = Math.max(0, ...porUsuario.map((u) => u.enviados));
  const maxAtrasadas = Math.max(0, ...porCliente.map((c) => c.atrasadas));

  return (
    <div className="max-w-5xl">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Produtividade</h1>
          <p className="text-sm text-neutral-500">
            Guias enviadas por colaborador e obrigações atrasadas por cliente
            {data
              ? ` · de ${formatarData(data.periodo.de)} a ${formatarData(data.periodo.ate)}`
              : ""}
          </p>
        </div>
        <label className="flex items-center gap-2 text-sm">
          Período
          <select
            value={meses}
            onChange={(e) => setMeses(Number(e.target.value))}
            className="rounded-lg border border-black/15 bg-neutral-900 px-3 py-2 text-sm text-white dark:border-white/15"
          >
            {[1, 3, 6, 12].map((m) => (
              <option key={m} value={m} className="bg-neutral-900 text-white">
                {m === 1 ? "último mês" : `últimos ${m} meses`}
              </option>
            ))}
          </select>
        </label>
      </div>

      {error && (
        <p
          role="alert"
          className="mb-4 rounded-lg bg-red-600/10 px-3 py-2 text-sm text-red-700 dark:text-red-400"
        >
          {mensagemDeErro(error)}
        </p>
      )}
      {isLoading && <p className="text-sm text-neutral-500">Carregando...</p>}

      {data && (
        <div className="grid gap-6 lg:grid-cols-2">
          <section className="rounded-xl border border-black/10 p-4 dark:border-white/10">
            <h2 className="mb-3 font-semibold">Por colaborador</h2>
            {porUsuario.length === 0 ? (
              <p className="text-sm text-neutral-500">
                Nenhuma guia enviada no período. Os envios contam a partir do momento em que cada
                pessoa passa a usar o próprio login.
              </p>
            ) : (
              <table className="w-full text-left text-sm">
                <thead className="text-xs text-neutral-500">
                  <tr>
                    <th className="py-1 pr-2 font-medium">Colaborador</th>
                    <th className="py-1 pr-2 font-medium">Enviadas</th>
                    <th className="py-1 pr-2 font-medium">Já vencidas no envio</th>
                    <th className="py-1 font-medium">Emitido → enviado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-black/10 dark:divide-white/10">
                  {porUsuario.map((u) => (
                    <tr key={u.usuarioId ?? u.login ?? "?"}>
                      <td className="py-2 pr-2">
                        <span className="font-medium">{u.nome ?? u.login ?? "(sem usuário)"}</span>
                        {u.nome && u.login && (
                          <span className="ml-1 text-xs text-neutral-500">{u.login}</span>
                        )}
                        <Barra valor={u.enviados} maximo={maxEnviados} cor="bg-green-500" />
                      </td>
                      <td className="py-2 pr-2 font-semibold">{u.enviados}</td>
                      <td
                        className={`py-2 pr-2 ${u.atrasadosNoEnvio ? "text-amber-700 dark:text-amber-400" : ""}`}
                      >
                        {u.atrasadosNoEnvio}
                      </td>
                      <td className="py-2 text-neutral-500">
                        {u.tempoMedioHoras === null ? "—" : `${u.tempoMedioHoras} h`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>

          <section className="rounded-xl border border-black/10 p-4 dark:border-white/10">
            <h2 className="mb-3 font-semibold">Clientes com obrigações atrasadas</h2>
            {porCliente.length === 0 ? (
              <p className="text-sm text-neutral-500">Nenhuma obrigação atrasada no período. 🎉</p>
            ) : (
              <table className="w-full text-left text-sm">
                <thead className="text-xs text-neutral-500">
                  <tr>
                    <th className="py-1 pr-2 font-medium">Cliente</th>
                    <th className="py-1 pr-2 font-medium">Atrasadas</th>
                    <th className="py-1 font-medium">De</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-black/10 dark:divide-white/10">
                  {porCliente.map((c) => (
                    <tr key={c.clienteId}>
                      <td className="py-2 pr-2">
                        <Link href="/pendencias" className="font-medium hover:underline">
                          {c.cliente}
                        </Link>
                        <Barra valor={c.atrasadas} maximo={maxAtrasadas} cor="bg-red-500" />
                      </td>
                      <td className="py-2 pr-2 font-semibold text-red-600">{c.atrasadas}</td>
                      <td className="py-2 text-neutral-500">{c.total}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
