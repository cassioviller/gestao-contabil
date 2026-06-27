import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useListarTipos, getListarTiposQueryKey, useSalvarTipo, useRemoverTipo } from "@workspace/api-client-react";

type Tipo = { id: number; nome: string; ordem: number; diaVencimento: number | null; offsetMes: number };

export default function Tipos() {
  const qc = useQueryClient();
  const { data: tipos = [], isLoading } = useListarTipos();
  const [editando, setEditando] = useState<Tipo | null>(null);
  const salvarMutation = useSalvarTipo();
  const removerMutation = useRemoverTipo();

  const novo: Tipo = { id: 0, nome: "", ordem: tipos.length, diaVencimento: null, offsetMes: 1 };

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const dados = {
      id: editando?.id || null,
      nome: String(fd.get("nome") ?? ""),
      ordem: Number(fd.get("ordem") ?? 0),
      diaVencimento: fd.get("diaVencimento") ? Number(fd.get("diaVencimento")) : null,
      offsetMes: Number(fd.get("offsetMes") ?? 1),
    };
    // @ts-ignore
    await salvarMutation.mutateAsync({ data: dados });
    qc.invalidateQueries({ queryKey: getListarTiposQueryKey() });
    setEditando(null);
  }

  async function handleRemover() {
    if (!editando || !confirm("Remover este tipo? Sai do checklist de todos.")) return;
    await removerMutation.mutateAsync({ id: editando.id });
    qc.invalidateQueries({ queryKey: getListarTiposQueryKey() });
    setEditando(null);
  }

  return (
    <div className="max-w-xl">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Tipos de obrigação</h1>
          <p className="text-sm text-neutral-500">Catálogo usado no checklist mensal</p>
        </div>
        <button onClick={() => setEditando(novo)}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
          + Novo tipo
        </button>
      </div>

      {isLoading ? <p className="text-sm text-neutral-500">Carregando...</p> : (
        <ul className="divide-y divide-black/10 rounded-xl border border-black/10 dark:divide-white/10 dark:border-white/10">
          {tipos.map((t) => (
            <li key={t.id} className="flex items-center justify-between px-4 py-3">
              <span><span className="text-neutral-400">{t.ordem}.</span> {t.nome}</span>
              <button onClick={() => setEditando(t as Tipo)} className="text-xs text-blue-600 hover:underline">Editar</button>
            </li>
          ))}
          {tipos.length === 0 && (
            <li className="px-4 py-6 text-center text-neutral-500">Nenhum tipo cadastrado.</li>
          )}
        </ul>
      )}

      {editando && (
        <div className="fixed inset-0 z-10 flex items-start justify-center bg-black/40 p-4">
          <div className="my-12 w-full max-w-md rounded-xl border border-black/10 bg-white p-6 shadow-xl dark:border-white/10 dark:bg-neutral-950">
            <h2 className="mb-4 text-lg font-semibold">{editando.id ? "Editar tipo" : "Novo tipo"}</h2>
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-neutral-600 dark:text-neutral-400">Nome</span>
                <input name="nome" defaultValue={editando.nome} required
                  className="rounded-lg border border-black/15 bg-transparent px-3 py-2 dark:border-white/15" />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-neutral-600 dark:text-neutral-400">Ordem de exibição</span>
                <input name="ordem" type="number" defaultValue={editando.ordem}
                  className="rounded-lg border border-black/15 bg-transparent px-3 py-2 dark:border-white/15" />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-neutral-600 dark:text-neutral-400">Dia de vencimento</span>
                <input name="diaVencimento" type="number" min={1} max={31} defaultValue={editando.diaVencimento ?? ""}
                  placeholder="ex: 20"
                  className="rounded-lg border border-black/15 bg-transparent px-3 py-2 dark:border-white/15" />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-neutral-600 dark:text-neutral-400">Vence em</span>
                <select name="offsetMes" defaultValue={String(editando.offsetMes)}
                  className="rounded-lg border border-black/15 bg-transparent px-3 py-2 dark:border-white/15">
                  <option value="0">Mesmo mês da competência</option>
                  <option value="1">Mês seguinte</option>
                </select>
              </label>
              <div className="flex items-center justify-between">
                {editando.id ? (
                  <button type="button" onClick={handleRemover} className="text-sm text-red-600 hover:underline">Remover</button>
                ) : <span />}
                <div className="flex gap-2">
                  <button type="button" onClick={() => setEditando(null)}
                    className="rounded-lg border border-black/15 px-4 py-2 text-sm dark:border-white/15">Cancelar</button>
                  <button type="submit" disabled={salvarMutation.isPending}
                    className="rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50">
                    {salvarMutation.isPending ? "Salvando..." : "Salvar"}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
