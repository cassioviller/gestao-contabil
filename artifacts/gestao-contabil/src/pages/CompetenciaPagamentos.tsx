import { useState } from "react";
import { Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetCompetencia,
  useListarPagamentos,
  getListarPagamentosQueryKey,
  useAtualizarPagamento,
  useCobrarPagamento,
} from "@workspace/api-client-react";
import { mensagemDeErro } from "@/lib/erros";
import { rotuloCompetencia, formatarMoeda, formatarNumeroBR, paraDecimalAPI } from "@/lib/formato";

type Pagamento = {
  id: number;
  status: "pendente" | "pago" | "isento";
  valor: string | null;
  dataPagamento: string | null;
  forma: string | null;
  observacao: string | null;
  codigo: number | null;
  cliente: string;
  cobrancaExternaId: string | null;
  linkPagamento: string | null;
  qrPix: string | null;
};

const ESTILO: Record<Pagamento["status"], string> = {
  pendente: "bg-amber-100 text-amber-800",
  pago: "bg-green-100 text-green-800",
  isento: "bg-neutral-200 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400",
};

function CabecalhoCompetencia({ id }: { id: number }) {
  const { data: comp } = useGetCompetencia(id);
  if (!comp) return null;
  const o = comp.resumo.obrigacoes;
  const p = comp.resumo.pagamentos;
  const pct = o.total ? Math.round((o.feitos / o.total) * 100) : 0;
  return (
    <div className="mb-6">
      <Link href="/competencias" className="text-sm text-blue-600 hover:underline">
        ← Competências
      </Link>
      <h1 className="mt-1 text-2xl font-bold">{rotuloCompetencia(comp.ano, comp.mes)}</h1>
      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { titulo: "Obrigações enviadas", valor: `${o.feitos}/${o.total}`, sub: `${pct}%` },
          { titulo: "Emitidas / pendentes", valor: `${o.emitidos} / ${o.pendentes}` },
          { titulo: "Recebido", valor: formatarMoeda(p.recebido), sub: `${p.pagos} pagos` },
          {
            titulo: "A receber",
            valor: formatarMoeda(p.aReceber),
            sub: `${p.pendentes} pendentes`,
          },
        ].map((m) => (
          <div
            key={m.titulo}
            className="rounded-lg border border-black/10 bg-white p-3 dark:border-white/10 dark:bg-neutral-950"
          >
            <p className="text-xs text-neutral-500">{m.titulo}</p>
            <p className="text-lg font-semibold">{m.valor}</p>
            {m.sub && <p className="text-xs text-neutral-400">{m.sub}</p>}
          </div>
        ))}
      </div>
      <div className="mt-4 flex gap-1 border-b border-black/10 dark:border-white/10">
        <Link
          href={`/competencias/${id}`}
          className="-mb-px border-b-2 border-transparent px-4 py-2 text-sm text-neutral-500 hover:text-neutral-800"
        >
          Obrigações
        </Link>
        <Link
          href={`/competencias/${id}/pagamentos`}
          className="-mb-px border-b-2 border-blue-600 px-4 py-2 text-sm font-medium text-blue-600"
        >
          Pagamentos
        </Link>
      </div>
    </div>
  );
}

export default function CompetenciaPagamentos({ params }: { params: { id: string } }) {
  const id = Number(params.id);
  const qc = useQueryClient();
  const { data: pgts = [], isLoading } = useListarPagamentos(id);
  const atualizarMutation = useAtualizarPagamento();
  const cobrarMutation = useCobrarPagamento();
  const [erro, setErro] = useState<string | null>(null);
  const [estado, setEstado] = useState<Pagamento[]>([]);
  const [filtro, setFiltro] = useState<"todos" | "pendente" | "pago">("todos");

  const estadoAtual = estado.length > 0 ? estado : (pgts as Pagamento[]);

  function salvar(p: Pagamento, mudancas: Partial<Pagamento>) {
    const atualizado = { ...p, ...mudancas };
    setEstado((s) => {
      const base = s.length > 0 ? s : (pgts as Pagamento[]);
      return base.map((x) => (x.id === p.id ? atualizado : x));
    });
    atualizarMutation.mutate(
      {
        id: p.id,
        data: {
          status: atualizado.status,
          valor: atualizado.valor,
          dataPagamento: atualizado.dataPagamento,
          forma: atualizado.forma,
          observacao: atualizado.observacao,
        },
      },
      {
        onSuccess: () => qc.invalidateQueries({ queryKey: getListarPagamentosQueryKey(id) }),
      },
    );
  }

  const visiveis = estadoAtual.filter((p) => (filtro === "todos" ? true : p.status === filtro));

  async function cobrar(p: Pagamento) {
    setErro(null);
    try {
      await cobrarMutation.mutateAsync({ id: p.id });
      setEstado([]);
      qc.invalidateQueries({ queryKey: getListarPagamentosQueryKey(id) });
    } catch (e) {
      setErro(mensagemDeErro(e, "Não foi possível gerar a cobrança."));
    }
  }

  return (
    <div>
      <CabecalhoCompetencia id={id} />
      {erro && (
        <p
          role="alert"
          className="mb-3 rounded-lg bg-red-600/10 px-3 py-2 text-sm text-red-700 dark:text-red-400"
        >
          {erro}
        </p>
      )}
      {isLoading ? (
        <p className="text-sm text-neutral-500">Carregando...</p>
      ) : (
        <div>
          <div className="mb-3 flex gap-2 text-sm">
            {(["todos", "pendente", "pago"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFiltro(f)}
                className={`rounded-lg px-3 py-1 ${filtro === f ? "bg-blue-600 text-white" : "border border-black/15 dark:border-white/15"}`}
              >
                {f === "todos" ? "Todos" : f === "pendente" ? "Pendentes" : "Pagos"}
              </button>
            ))}
          </div>
          <div className="overflow-x-auto rounded-xl border border-black/10 dark:border-white/10">
            <table className="w-full text-left text-sm">
              <thead className="bg-black/5 dark:bg-white/5">
                <tr>
                  <th className="px-3 py-2 font-medium">Cliente</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                  <th className="px-3 py-2 font-medium">Valor</th>
                  <th className="px-3 py-2 font-medium">Data</th>
                  <th className="px-3 py-2 font-medium">Forma</th>
                  <th className="px-3 py-2 font-medium">Cobrança</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black/10 dark:divide-white/10">
                {visiveis.map((p) => (
                  <tr key={p.id}>
                    <td className="px-3 py-2">
                      <span className="text-neutral-400">{p.codigo ?? "—"}</span> {p.cliente}
                    </td>
                    <td className="px-3 py-2">
                      <select
                        value={p.status}
                        onChange={(e) =>
                          salvar(p, { status: e.target.value as Pagamento["status"] })
                        }
                        className={`rounded-md px-2 py-1 text-xs font-medium ${ESTILO[p.status]}`}
                      >
                        <option value="pendente">Pendente</option>
                        <option value="pago">Pago</option>
                        <option value="isento">Isento</option>
                      </select>
                    </td>
                    <td className="px-3 py-2">
                      <input
                        defaultValue={formatarNumeroBR(p.valor)}
                        onBlur={(e) => {
                          const valor = paraDecimalAPI(e.target.value);
                          if (valor !== (p.valor ?? null)) salvar(p, { valor });
                        }}
                        placeholder="0,00"
                        className="w-24 rounded-md border border-black/15 bg-transparent px-2 py-1 dark:border-white/15"
                      />
                      <span className="ml-1 text-xs text-neutral-400">
                        {formatarMoeda(p.valor)}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="date"
                        defaultValue={p.dataPagamento ?? ""}
                        onChange={(e) => salvar(p, { dataPagamento: e.target.value || null })}
                        className="rounded-md border border-black/15 bg-transparent px-2 py-1 dark:border-white/15"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        defaultValue={p.forma ?? ""}
                        onBlur={(e) => {
                          if ((e.target.value || "") !== (p.forma || ""))
                            salvar(p, { forma: e.target.value || null });
                        }}
                        placeholder="PIX, boleto…"
                        className="w-28 rounded-md border border-black/15 bg-transparent px-2 py-1 dark:border-white/15"
                      />
                    </td>
                    <td className="px-3 py-2 text-xs">
                      {p.linkPagamento ? (
                        <span className="flex items-center gap-2">
                          <a
                            href={p.linkPagamento}
                            target="_blank"
                            rel="noreferrer"
                            className="text-blue-600 hover:underline"
                          >
                            🔗 link
                          </a>
                          {p.qrPix && (
                            <button
                              type="button"
                              onClick={() => navigator.clipboard?.writeText(p.qrPix ?? "")}
                              className="text-blue-600 hover:underline"
                              title="Copiar Pix copia e cola"
                            >
                              Pix
                            </button>
                          )}
                        </span>
                      ) : p.status === "pendente" ? (
                        <button
                          type="button"
                          onClick={() => cobrar(p)}
                          disabled={cobrarMutation.isPending}
                          className="text-blue-600 hover:underline disabled:opacity-50"
                          title="Gera link e Pix no provedor de cobrança"
                        >
                          Gerar cobrança
                        </button>
                      ) : (
                        <span className="text-neutral-400">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
