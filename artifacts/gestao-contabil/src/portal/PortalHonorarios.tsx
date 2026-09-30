import { useListarPortalHonorarios } from "@workspace/api-client-react";
import { formatarData, formatarMoeda, rotuloCompetencia } from "@/lib/formato";
import Consulta from "@/components/Consulta";

const ROTULO = { pendente: "Em aberto", pago: "Pago", isento: "Isento" } as const;

export default function PortalHonorarios() {
  const { data: lista = [], isLoading, error, refetch } = useListarPortalHonorarios();
  return (
    <div>
      <h1 className="mb-1 text-xl font-bold">Honorários</h1>
      <p className="mb-4 text-sm text-neutral-500">
        Últimos meses e, quando houver, o link para pagar.
      </p>
      <Consulta
        isLoading={isLoading}
        error={error}
        vazio={lista.length === 0}
        aoTentar={() => refetch()}
        mensagemVazio="Nenhum honorário lançado ainda."
      >
        <table className="w-full rounded-xl border border-black/10 bg-white text-left text-sm dark:border-white/10 dark:bg-neutral-950">
          <thead className="text-xs text-neutral-500">
            <tr>
              <th className="px-3 py-2 font-medium">Mês</th>
              <th className="px-3 py-2 font-medium">Valor</th>
              <th className="px-3 py-2 font-medium">Vencimento</th>
              <th className="px-3 py-2 font-medium">Situação</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-black/10 dark:divide-white/10">
            {lista.map((h) => (
              <tr key={h.id}>
                <td className="px-3 py-2">{rotuloCompetencia(h.ano, h.mes)}</td>
                <td className="px-3 py-2">{formatarMoeda(h.valor)}</td>
                <td className="px-3 py-2">{formatarData(h.vencimento)}</td>
                <td
                  className={`px-3 py-2 ${h.status === "pago" ? "text-green-700" : h.status === "pendente" ? "text-amber-700" : ""}`}
                >
                  {ROTULO[h.status]}
                  {h.dataPagamento ? ` em ${formatarData(h.dataPagamento)}` : ""}
                </td>
                <td className="px-3 py-2 text-right">
                  {h.status === "pendente" && h.linkPagamento && (
                    <a
                      href={h.linkPagamento}
                      target="_blank"
                      rel="noreferrer"
                      className="text-blue-600 hover:underline"
                    >
                      Pagar
                    </a>
                  )}
                  {h.status === "pendente" && h.qrPix && (
                    <button
                      type="button"
                      onClick={() => navigator.clipboard?.writeText(h.qrPix ?? "")}
                      className="ml-3 text-blue-600 hover:underline"
                      title="Copiar Pix copia e cola"
                    >
                      Copiar Pix
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Consulta>
    </div>
  );
}
