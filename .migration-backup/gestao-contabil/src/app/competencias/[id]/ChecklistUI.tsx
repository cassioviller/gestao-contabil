"use client";

import { useMemo, useState, useTransition } from "react";
import { atualizarStatusItem, atualizarVencimentoItem } from "@/lib/acoes";
import { formatarData } from "@/lib/formato";

type Item = {
  id: number;
  status: "pendente" | "feito" | "nao_aplica";
  clienteId: number;
  codigo: number | null;
  cliente: string;
  vencimento: string | null;
  tipoObrigacaoId: number;
  obrigacao: string;
  ordem: number;
};

// Ciclo de status ao clicar na célula.
const PROXIMO: Record<Item["status"], Item["status"]> = {
  pendente: "feito",
  feito: "nao_aplica",
  nao_aplica: "pendente",
};

const ESTILO: Record<Item["status"], string> = {
  pendente: "bg-amber-100 text-amber-800 hover:bg-amber-200",
  feito: "bg-green-500 text-white hover:bg-green-600",
  nao_aplica: "bg-neutral-200 text-neutral-400 dark:bg-neutral-800",
};

const SIMBOLO: Record<Item["status"], string> = {
  pendente: "•",
  feito: "✓",
  nao_aplica: "–",
};

export default function ChecklistUI({
  competenciaId,
  itens,
}: {
  competenciaId: number;
  itens: Item[];
}) {
  const [estado, setEstado] = useState(itens);
  const [soPendentes, setSoPendentes] = useState(false);
  const [modoPrazos, setModoPrazos] = useState(false);
  const [, startTransition] = useTransition();

  // Colunas (obrigações) e linhas (clientes) a partir dos itens.
  const colunas = useMemo(() => {
    const m = new Map<number, { id: number; nome: string; ordem: number }>();
    for (const i of estado)
      if (!m.has(i.tipoObrigacaoId))
        m.set(i.tipoObrigacaoId, { id: i.tipoObrigacaoId, nome: i.obrigacao, ordem: i.ordem });
    return [...m.values()].sort((a, b) => a.ordem - b.ordem);
  }, [estado]);

  const linhas = useMemo(() => {
    const m = new Map<number, { id: number; codigo: number | null; nome: string; celulas: Map<number, Item> }>();
    for (const i of estado) {
      if (!m.has(i.clienteId))
        m.set(i.clienteId, { id: i.clienteId, codigo: i.codigo, nome: i.cliente, celulas: new Map() });
      m.get(i.clienteId)!.celulas.set(i.tipoObrigacaoId, i);
    }
    let arr = [...m.values()].sort((a, b) => (a.codigo ?? 0) - (b.codigo ?? 0));
    if (soPendentes)
      arr = arr.filter((l) => [...l.celulas.values()].some((c) => c.status === "pendente"));
    return arr;
  }, [estado, soPendentes]);

  function clique(item: Item) {
    const novo = PROXIMO[item.status];
    setEstado((s) => s.map((i) => (i.id === item.id ? { ...i, status: novo } : i)));
    const fd = new FormData();
    fd.set("id", String(item.id));
    fd.set("status", novo);
    fd.set("competenciaId", String(competenciaId));
    startTransition(() => {
      atualizarStatusItem(fd);
    });
  }

  function salvarPrazo(item: Item, valor: string) {
    setEstado((s) =>
      s.map((i) => (i.id === item.id ? { ...i, vencimento: valor || null } : i))
    );
    const fd = new FormData();
    fd.set("id", String(item.id));
    fd.set("vencimento", valor);
    fd.set("competenciaId", String(competenciaId));
    startTransition(() => {
      atualizarVencimentoItem(fd);
    });
  }

  if (itens.length === 0) {
    return (
      <p className="rounded-lg bg-amber-100 px-4 py-3 text-sm text-amber-800">
        Nenhuma obrigação gerada. Verifique se os clientes têm obrigações
        cadastradas.
      </p>
    );
  }

  return (
    <div>
      <div className="mb-3 flex items-center gap-4">
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
        <span className="text-xs text-neutral-500">
          Clique numa célula: pendente → feito → não se aplica
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
                  <span className="text-neutral-400">{l.codigo ?? "—"}</span>{" "}
                  {l.nome}
                </td>
                {colunas.map((c) => {
                  const cel = l.celulas.get(c.id);
                  if (!cel)
                    return (
                      <td key={c.id} className="px-2 py-2 text-center text-neutral-200 dark:text-neutral-700">
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
                          title={
                            cel.vencimento
                              ? `vence ${formatarData(cel.vencimento)}`
                              : cel.status
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
  );
}
