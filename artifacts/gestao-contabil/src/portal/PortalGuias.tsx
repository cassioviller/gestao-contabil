import { useQueryClient } from "@tanstack/react-query";
import {
  getListarPortalGuiasQueryKey,
  getUrlDownloadPortal,
  useDarCientePortal,
  useListarPortalGuias,
} from "@workspace/api-client-react";
import { formatarData, rotuloCompetencia } from "@/lib/formato";
import Consulta from "@/components/Consulta";

export default function PortalGuias() {
  const qc = useQueryClient();
  const { data: guias = [], isLoading, error, refetch } = useListarPortalGuias();
  const ciente = useDarCientePortal({
    mutation: {
      onSuccess: () => qc.invalidateQueries({ queryKey: getListarPortalGuiasQueryKey() }),
    },
  });

  async function baixar(id: number) {
    const { url } = await getUrlDownloadPortal(id);
    window.open(url, "_blank", "noopener");
  }

  return (
    <div>
      <h1 className="mb-1 text-xl font-bold">Guias</h1>
      <p className="mb-4 text-sm text-neutral-500">
        As guias que o escritório emitiu para você. Baixe, pague e marque como recebida.
      </p>
      <Consulta
        isLoading={isLoading}
        error={error}
        vazio={guias.length === 0}
        aoTentar={() => refetch()}
        mensagemVazio="Nenhuma guia disponível no momento."
      >
        <ul className="divide-y divide-black/10 rounded-xl border border-black/10 bg-white dark:divide-white/10 dark:border-white/10 dark:bg-neutral-950">
          {guias.map((g) => (
            <li key={g.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
              <div>
                <p className="font-medium">
                  {g.obrigacao} · {rotuloCompetencia(g.ano, g.mes)}
                </p>
                <p className="text-xs text-neutral-500">
                  {g.vencimento ? `vence em ${formatarData(g.vencimento)}` : "sem vencimento"}
                  {g.cienteEm ? ` · recebida em ${formatarData(g.cienteEm.slice(0, 10))}` : ""}
                </p>
                <div className="mt-1 flex flex-wrap gap-2">
                  {g.arquivos.map((a) => (
                    <button
                      key={a.id}
                      type="button"
                      onClick={() => baixar(a.id)}
                      className="text-sm text-blue-600 hover:underline"
                    >
                      📄 {a.nome}
                    </button>
                  ))}
                </div>
              </div>
              {g.cienteEm ? (
                <span className="text-sm text-green-700 dark:text-green-400">✓ Ciente</span>
              ) : (
                <button
                  type="button"
                  onClick={() => ciente.mutate({ id: g.id })}
                  disabled={ciente.isPending}
                  className="rounded-lg bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
                >
                  Recebi esta guia
                </button>
              )}
            </li>
          ))}
        </ul>
      </Consulta>
    </div>
  );
}
