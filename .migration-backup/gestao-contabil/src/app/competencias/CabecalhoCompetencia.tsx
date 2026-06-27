import Link from "next/link";
import { formatarMoeda } from "@/lib/formato";

type Resumo = {
  obrigacoes: { total: number; feitos: number; pendentes: number };
  pagamentos: {
    total: number;
    pagos: number;
    pendentes: number;
    recebido: string;
    aReceber: string;
  };
};

export default function CabecalhoCompetencia({
  id,
  titulo,
  abaAtiva,
  resumo,
}: {
  id: number;
  titulo: string;
  abaAtiva: "obrigacoes" | "pagamentos";
  resumo: Resumo;
}) {
  const o = resumo.obrigacoes;
  const p = resumo.pagamentos;
  const pct = o.total ? Math.round((o.feitos / o.total) * 100) : 0;

  const abas = [
    { chave: "obrigacoes", rotulo: "Obrigações", href: `/competencias/${id}` },
    { chave: "pagamentos", rotulo: "Pagamentos", href: `/competencias/${id}/pagamentos` },
  ] as const;

  return (
    <div className="mb-6">
      <Link href="/competencias" className="text-sm text-blue-600 hover:underline">
        ← Competências
      </Link>
      <h1 className="mt-1 text-2xl font-bold">{titulo}</h1>

      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Mini titulo="Obrigações feitas" valor={`${o.feitos}/${o.total}`} sub={`${pct}%`} />
        <Mini titulo="Obrig. pendentes" valor={String(o.pendentes)} />
        <Mini titulo="Recebido" valor={formatarMoeda(p.recebido)} sub={`${p.pagos} pagos`} />
        <Mini titulo="A receber" valor={formatarMoeda(p.aReceber)} sub={`${p.pendentes} pendentes`} />
      </div>

      <div className="mt-4 flex gap-1 border-b border-black/10 dark:border-white/10">
        {abas.map((a) => (
          <Link
            key={a.chave}
            href={a.href}
            className={`-mb-px border-b-2 px-4 py-2 text-sm ${
              abaAtiva === a.chave
                ? "border-blue-600 font-medium text-blue-600"
                : "border-transparent text-neutral-500 hover:text-neutral-800"
            }`}
          >
            {a.rotulo}
          </Link>
        ))}
      </div>
    </div>
  );
}

function Mini({ titulo, valor, sub }: { titulo: string; valor: string; sub?: string }) {
  return (
    <div className="rounded-lg border border-black/10 bg-white p-3 dark:border-white/10 dark:bg-neutral-950">
      <p className="text-xs text-neutral-500">{titulo}</p>
      <p className="text-lg font-semibold">{valor}</p>
      {sub && <p className="text-xs text-neutral-400">{sub}</p>}
    </div>
  );
}
