"use client";

import { useState, useTransition } from "react";
import { atualizarPagamento } from "@/lib/acoes";
import { formatarMoeda } from "@/lib/formato";

type Pagamento = {
  id: number;
  status: "pendente" | "pago" | "isento";
  valor: string | null;
  dataPagamento: string | null;
  forma: string | null;
  observacao: string | null;
  codigo: number | null;
  cliente: string;
};

const ESTILO: Record<Pagamento["status"], string> = {
  pendente: "bg-amber-100 text-amber-800",
  pago: "bg-green-100 text-green-800",
  isento: "bg-neutral-200 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400",
};

export default function PagamentosUI({
  competenciaId,
  pagamentos,
}: {
  competenciaId: number;
  pagamentos: Pagamento[];
}) {
  const [estado, setEstado] = useState(pagamentos);
  const [filtro, setFiltro] = useState<"todos" | "pendente" | "pago">("todos");
  const [, startTransition] = useTransition();

  function salvar(p: Pagamento, mudancas: Partial<Pagamento>) {
    const atualizado = { ...p, ...mudancas };
    setEstado((s) => s.map((x) => (x.id === p.id ? atualizado : x)));
    const fd = new FormData();
    fd.set("id", String(p.id));
    fd.set("competenciaId", String(competenciaId));
    fd.set("status", atualizado.status);
    fd.set("valor", atualizado.valor ?? "");
    fd.set("dataPagamento", atualizado.dataPagamento ?? "");
    fd.set("forma", atualizado.forma ?? "");
    fd.set("observacao", atualizado.observacao ?? "");
    startTransition(() => atualizarPagamento(fd));
  }

  const visiveis = estado.filter((p) =>
    filtro === "todos" ? true : p.status === filtro
  );

  return (
    <div>
      <div className="mb-3 flex gap-2 text-sm">
        {(["todos", "pendente", "pago"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFiltro(f)}
            className={`rounded-lg px-3 py-1 ${
              filtro === f
                ? "bg-blue-600 text-white"
                : "border border-black/15 dark:border-white/15"
            }`}
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
            </tr>
          </thead>
          <tbody className="divide-y divide-black/10 dark:divide-white/10">
            {visiveis.map((p) => (
              <tr key={p.id}>
                <td className="px-3 py-2">
                  <span className="text-neutral-400">{p.codigo ?? "—"}</span>{" "}
                  {p.cliente}
                </td>
                <td className="px-3 py-2">
                  <select
                    value={p.status}
                    onChange={(e) =>
                      salvar(p, {
                        status: e.target.value as Pagamento["status"],
                      })
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
                    defaultValue={p.valor ?? ""}
                    onBlur={(e) => {
                      if ((e.target.value || "") !== (p.valor || ""))
                        salvar(p, { valor: e.target.value || null });
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
                    onChange={(e) =>
                      salvar(p, { dataPagamento: e.target.value || null })
                    }
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
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
