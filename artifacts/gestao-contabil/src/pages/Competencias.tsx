import { useState } from "react";
import { Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListarCompetencias,
  getListarCompetenciasQueryKey,
  useAbrirCompetencia,
} from "@workspace/api-client-react";
import { rotuloCompetencia, MESES } from "@/lib/formato";

export default function Competencias() {
  const qc = useQueryClient();
  const { data: comps = [], isLoading } = useListarCompetencias();
  const abrirMutation = useAbrirCompetencia();
  const [aberto, setAberto] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const agora = new Date();
  const [ano, setAno] = useState(agora.getFullYear());
  const [mes, setMes] = useState(agora.getMonth() + 1);
  const [somenteHonorarios, setSomenteHonorarios] = useState(false);

  async function handleAbrir() {
    setErro(null);
    try {
      await abrirMutation.mutateAsync({ data: { ano, mes, somenteHonorarios } });
      qc.invalidateQueries({ queryKey: getListarCompetenciasQueryKey() });
      setAberto(false);
    } catch (e: unknown) {
      // @ts-ignore
      const msg = e?.response?.data?.error ?? (e instanceof Error ? e.message : "Erro ao abrir mês.");
      setErro(msg);
    }
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Competências</h1>
          <p className="text-sm text-neutral-500">
            Cada mês de trabalho. Abrir um mês gera o checklist e os pagamentos automaticamente.
          </p>
        </div>
        {!aberto ? (
          <button onClick={() => setAberto(true)}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
            + Abrir mês
          </button>
        ) : (
          <div className="rounded-xl border border-black/10 bg-white p-4 dark:border-white/10 dark:bg-neutral-950">
            <div className="flex flex-wrap items-end gap-3">
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-neutral-600 dark:text-neutral-400">Mês</span>
                <select name="mes" value={mes} onChange={(e) => setMes(Number(e.target.value))}
                  className="rounded-lg border border-black/15 bg-transparent px-3 py-2 dark:border-white/15">
                  {MESES.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-neutral-600 dark:text-neutral-400">Ano</span>
                <input type="number" name="ano" value={ano} onChange={(e) => setAno(Number(e.target.value))}
                  className="w-24 rounded-lg border border-black/15 bg-transparent px-3 py-2 dark:border-white/15" />
              </label>
              <button onClick={handleAbrir} disabled={abrirMutation.isPending}
                className="rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50">
                {abrirMutation.isPending ? "Gerando..." : somenteHonorarios ? "Gerar honorários" : "Gerar checklist"}
              </button>
              <button onClick={() => { setAberto(false); setErro(null); }}
                className="rounded-lg border border-black/15 px-4 py-2 text-sm dark:border-white/15">Cancelar</button>
            </div>
            <label className="mt-3 flex items-start gap-2 text-sm">
              <input type="checkbox" name="somenteHonorarios" checked={somenteHonorarios}
                onChange={(e) => setSomenteHonorarios(e.target.checked)} className="mt-1" />
              <span>
                Somente honorários (não gerar checklist de obrigações)
                <span className="block text-xs text-neutral-500">
                  Para meses anteriores ao início do uso do sistema — registra o honorário em atraso sem
                  encher o checklist de itens de um mês que você não vai acompanhar.
                </span>
              </span>
            </label>
            {erro && <p className="mt-2 text-sm text-red-600">{erro}</p>}
          </div>
        )}
      </div>

      {isLoading ? <p className="text-sm text-neutral-500">Carregando...</p> : comps.length === 0 ? (
        <p className="rounded-lg bg-amber-100 px-4 py-3 text-sm text-amber-800">
          Nenhum mês aberto ainda. Clique em "Abrir mês" para começar.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {comps.map((c) => {
            const o = c.resumo.obrigacoes;
            const p = c.resumo.pagamentos;
            const pct = o.total ? Math.round((o.feitos / o.total) * 100) : 0;
            return (
              <Link key={c.id} href={`/competencias/${c.id}`}
                className="rounded-xl border border-black/10 bg-white p-5 transition-colors hover:border-blue-500 dark:border-white/10 dark:bg-neutral-950">
                <p className="text-lg font-semibold">{rotuloCompetencia(c.ano, c.mes)}</p>
                <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-black/10 dark:bg-white/10">
                  <div className="h-full bg-green-500" style={{ width: `${pct}%` }} />
                </div>
                <p className="mt-2 text-xs text-neutral-500">
                  Obrigações: {o.feitos}/{o.total} enviadas ({pct}%) · {o.emitidos} emitidas · {o.pendentes} pendentes
                </p>
                <p className="text-xs text-neutral-500">Pagamentos: {p.pagos}/{p.total} pagos · {p.pendentes} pendentes</p>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
