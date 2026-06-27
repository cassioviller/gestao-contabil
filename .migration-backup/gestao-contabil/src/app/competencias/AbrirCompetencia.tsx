"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { abrirCompetencia } from "@/lib/acoes";
import { MESES } from "@/lib/formato";

export default function AbrirCompetencia() {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  // padrão: mês/ano "atuais" do controle (ajustável no formulário)
  const agora = new Date();
  const [ano, setAno] = useState(agora.getFullYear());
  const [mes, setMes] = useState(agora.getMonth() + 1);

  if (!aberto) {
    return (
      <button
        onClick={() => setAberto(true)}
        className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
      >
        + Abrir mês
      </button>
    );
  }

  return (
    <div className="rounded-xl border border-black/10 bg-white p-4 dark:border-white/10 dark:bg-neutral-950">
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-neutral-600 dark:text-neutral-400">Mês</span>
          <select
            value={mes}
            onChange={(e) => setMes(Number(e.target.value))}
            className="rounded-lg border border-black/15 bg-transparent px-3 py-2 dark:border-white/15"
          >
            {MESES.map((m, i) => (
              <option key={m} value={i + 1}>
                {m}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-neutral-600 dark:text-neutral-400">Ano</span>
          <input
            type="number"
            value={ano}
            onChange={(e) => setAno(Number(e.target.value))}
            className="w-24 rounded-lg border border-black/15 bg-transparent px-3 py-2 dark:border-white/15"
          />
        </label>
        <button
          onClick={async () => {
            setErro(null);
            const fd = new FormData();
            fd.set("ano", String(ano));
            fd.set("mes", String(mes));
            try {
              const id = await abrirCompetencia(fd);
              setAberto(false);
              if (id) router.push(`/competencias/${id}`);
            } catch (e) {
              setErro(e instanceof Error ? e.message : "Erro ao abrir mês.");
            }
          }}
          className="rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700"
        >
          Gerar checklist
        </button>
        <button
          onClick={() => setAberto(false)}
          className="rounded-lg border border-black/15 px-4 py-2 text-sm dark:border-white/15"
        >
          Cancelar
        </button>
      </div>
      {erro && <p className="mt-2 text-sm text-red-600">{erro}</p>}
    </div>
  );
}
