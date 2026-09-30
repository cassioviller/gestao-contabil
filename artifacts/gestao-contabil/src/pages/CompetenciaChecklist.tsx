import { useMemo, useState } from "react";
import { Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetCompetencia,
  useListarChecklist,
  getListarChecklistQueryKey,
  useAtualizarStatusChecklist,
  useAtualizarVencimentoChecklist,
} from "@workspace/api-client-react";
import { rotuloCompetencia, formatarMoeda, formatarData } from "@/lib/formato";

type Item = {
  id: number;
  status: "pendente" | "emitido" | "enviado" | "nao_aplica";
  clienteId: number;
  codigo: number | null;
  cliente: string;
  vencimento: string | null;
  tipoObrigacaoId: number;
  obrigacao: string;
  ordem: number;
};

// Ciclo da guia: pendente → emitido → enviado → não se aplica → pendente.
const PROXIMO: Record<Item["status"], Item["status"]> = {
  pendente: "emitido",
  emitido: "enviado",
  enviado: "nao_aplica",
  nao_aplica: "pendente",
};

const ESTILO: Record<Item["status"], string> = {
  pendente: "bg-amber-100 text-amber-800 hover:bg-amber-200",
  emitido: "bg-blue-500 text-white hover:bg-blue-600",
  enviado: "bg-green-500 text-white hover:bg-green-600",
  nao_aplica: "bg-neutral-200 text-neutral-400 dark:bg-neutral-800",
};

const SIMBOLO: Record<Item["status"], string> = {
  pendente: "•",
  emitido: "E",
  enviado: "✓",
  nao_aplica: "–",
};

const ROTULO: Record<Item["status"], string> = {
  pendente: "Pendente",
  emitido: "Emitido",
  enviado: "Enviado",
  nao_aplica: "Não se aplica",
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
          className="-mb-px border-b-2 border-blue-600 px-4 py-2 text-sm font-medium text-blue-600"
        >
          Obrigações
        </Link>
        <Link
          href={`/competencias/${id}/pagamentos`}
          className="-mb-px border-b-2 border-transparent px-4 py-2 text-sm text-neutral-500 hover:text-neutral-800"
        >
          Pagamentos
        </Link>
      </div>
    </div>
  );
}

export default function CompetenciaChecklist({ params }: { params: { id: string } }) {
  const id = Number(params.id);
  const qc = useQueryClient();
  const { data: itens = [], isLoading } = useListarChecklist(id);
  const statusMutation = useAtualizarStatusChecklist();
  const vencMutation = useAtualizarVencimentoChecklist();
  const [estado, setEstado] = useState<Item[]>([]);
  const [soPendentes, setSoPendentes] = useState(false);
  const [modoPrazos, setModoPrazos] = useState(false);

  const estadoAtual = estado.length > 0 ? estado : (itens as Item[]);

  const colunas = useMemo(() => {
    const m = new Map<number, { id: number; nome: string; ordem: number }>();
    for (const i of estadoAtual)
      if (!m.has(i.tipoObrigacaoId))
        m.set(i.tipoObrigacaoId, { id: i.tipoObrigacaoId, nome: i.obrigacao, ordem: i.ordem });
    return [...m.values()].sort((a, b) => a.ordem - b.ordem);
  }, [estadoAtual]);

  const linhas = useMemo(() => {
    const m = new Map<
      number,
      { id: number; codigo: number | null; nome: string; celulas: Map<number, Item> }
    >();
    for (const i of estadoAtual) {
      if (!m.has(i.clienteId))
        m.set(i.clienteId, {
          id: i.clienteId,
          codigo: i.codigo,
          nome: i.cliente,
          celulas: new Map(),
        });
      m.get(i.clienteId)!.celulas.set(i.tipoObrigacaoId, i);
    }
    let arr = [...m.values()].sort((a, b) => (a.codigo ?? 0) - (b.codigo ?? 0));
    if (soPendentes)
      arr = arr.filter((l) => [...l.celulas.values()].some((c) => c.status === "pendente"));
    return arr;
  }, [estadoAtual, soPendentes]);

  function clique(item: Item) {
    const novo = PROXIMO[item.status];
    setEstado((s) => {
      const base = s.length > 0 ? s : (itens as Item[]);
      return base.map((i) => (i.id === item.id ? { ...i, status: novo } : i));
    });
    statusMutation.mutate(
      { id: item.id, data: { status: novo } },
      {
        onSuccess: () => qc.invalidateQueries({ queryKey: getListarChecklistQueryKey(id) }),
      },
    );
  }

  function salvarPrazo(item: Item, valor: string) {
    setEstado((s) => {
      const base = s.length > 0 ? s : (itens as Item[]);
      return base.map((i) => (i.id === item.id ? { ...i, vencimento: valor || null } : i));
    });
    vencMutation.mutate(
      { id: item.id, data: { vencimento: valor || null } },
      {
        onSuccess: () => qc.invalidateQueries({ queryKey: getListarChecklistQueryKey(id) }),
      },
    );
  }

  return (
    <div>
      <CabecalhoCompetencia id={id} />
      {isLoading ? (
        <p className="text-sm text-neutral-500">Carregando...</p>
      ) : itens.length === 0 ? (
        <p className="rounded-lg bg-amber-100 px-4 py-3 text-sm text-amber-800">
          Nenhuma obrigação gerada. Verifique se os clientes têm obrigações cadastradas.
        </p>
      ) : (
        <div>
          <div className="mb-3 flex items-center gap-4 flex-wrap">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={soPendentes}
                onChange={(e) => setSoPendentes(e.target.checked)}
              />
              Mostrar só clientes com pendência
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={modoPrazos}
                onChange={(e) => setModoPrazos(e.target.checked)}
              />
              Ajustar prazos
            </label>
            <span className="flex flex-wrap items-center gap-2 text-xs text-neutral-500">
              Clique numa célula para avançar:
              {(["pendente", "emitido", "enviado", "nao_aplica"] as const).map((s, i) => (
                <span key={s} className="flex items-center gap-1">
                  {i > 0 && <span className="text-neutral-400">→</span>}
                  <span
                    className={`inline-flex h-5 w-5 items-center justify-center rounded text-[11px] font-bold ${ESTILO[s]}`}
                  >
                    {SIMBOLO[s]}
                  </span>
                  <span>{ROTULO[s]}</span>
                </span>
              ))}
            </span>
          </div>
          <div className="overflow-x-auto rounded-xl border border-black/10 dark:border-white/10">
            <table className="text-sm">
              <thead className="bg-black/5 dark:bg-white/5">
                <tr>
                  <th className="sticky left-0 z-10 bg-black/5 px-3 py-2 text-left font-medium dark:bg-white/5">
                    Cliente
                  </th>
                  {colunas.map((c) => (
                    <th key={c.id} className="px-2 py-2 text-center text-xs font-medium">
                      {c.nome}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-black/10 dark:divide-white/10">
                {linhas.map((l) => (
                  <tr key={l.id}>
                    <td className="sticky left-0 z-10 bg-white px-3 py-2 dark:bg-neutral-950">
                      <span className="text-neutral-400">{l.codigo ?? "—"}</span> {l.nome}
                    </td>
                    {colunas.map((c) => {
                      const cel = l.celulas.get(c.id);
                      if (!cel)
                        return (
                          <td
                            key={c.id}
                            className="px-2 py-2 text-center text-neutral-200 dark:text-neutral-700"
                          >
                            ·
                          </td>
                        );
                      return (
                        <td key={c.id} className="px-2 py-2 text-center">
                          {modoPrazos ? (
                            <input
                              type="date"
                              defaultValue={cel.vencimento ?? ""}
                              onChange={(e) => salvarPrazo(cel, e.target.value)}
                              className="rounded border border-black/15 bg-transparent px-1 py-0.5 text-xs dark:border-white/15"
                            />
                          ) : (
                            <button
                              onClick={() => clique(cel)}
                              aria-label={`${l.nome} — ${c.nome}: ${ROTULO[cel.status]}`}
                              title={
                                ROTULO[cel.status] +
                                (cel.vencimento ? ` · vence ${formatarData(cel.vencimento)}` : "")
                              }
                              className={`h-7 w-7 rounded-md text-sm font-bold ${ESTILO[cel.status]}`}
                            >
                              {SIMBOLO[cel.status]}
                            </button>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {linhas.length === 0 && (
            <p className="mt-3 text-sm text-neutral-500">
              Tudo certo — nenhum cliente com pendência. 🎉
            </p>
          )}
        </div>
      )}
    </div>
  );
}
