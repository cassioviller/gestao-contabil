import Link from "next/link";
import { listarCompetencias, resumoCompetencia } from "@/lib/consultas";
import { rotuloCompetencia } from "@/lib/formato";
import AbrirCompetencia from "./AbrirCompetencia";

export const dynamic = "force-dynamic";

export default async function PaginaCompetencias() {
  const comps = await listarCompetencias();
  const comResumo = await Promise.all(
    comps.map(async (c) => ({ ...c, resumo: await resumoCompetencia(c.id) }))
  );
  // mais recentes primeiro
  comResumo.reverse();

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Competências</h1>
          <p className="text-sm text-neutral-500">
            Cada mês de trabalho. Abrir um mês gera o checklist e os pagamentos
            automaticamente.
          </p>
        </div>
        <AbrirCompetencia />
      </div>

      {comResumo.length === 0 ? (
        <p className="rounded-lg bg-amber-100 px-4 py-3 text-sm text-amber-800">
          Nenhum mês aberto ainda. Clique em “Abrir mês” para começar.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {comResumo.map((c) => {
            const o = c.resumo.obrigacoes;
            const p = c.resumo.pagamentos;
            const pct = o.total ? Math.round((o.feitos / o.total) * 100) : 0;
            return (
              <Link
                key={c.id}
                href={`/competencias/${c.id}`}
                className="rounded-xl border border-black/10 bg-white p-5 transition-colors hover:border-blue-500 dark:border-white/10 dark:bg-neutral-950"
              >
                <p className="text-lg font-semibold">
                  {rotuloCompetencia(c.ano, c.mes)}
                </p>
                <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-black/10 dark:bg-white/10">
                  <div
                    className="h-full bg-green-500"
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <p className="mt-2 text-xs text-neutral-500">
                  Obrigações: {o.feitos}/{o.total} feitas ({pct}%)
                </p>
                <p className="text-xs text-neutral-500">
                  Pagamentos: {p.pagos}/{p.total} pagos · {p.pendentes} pendentes
                </p>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
