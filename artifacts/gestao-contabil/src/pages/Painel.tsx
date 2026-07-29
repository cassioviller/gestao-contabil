import { Link } from "wouter";
import { useGetPainel } from "@workspace/api-client-react";
import { formatarMoeda, rotuloCompetencia } from "@/lib/formato";

function Cartao({ titulo, valor, cor }: { titulo: string; valor: string; cor: string }) {
  return (
    <div className="rounded-xl border border-black/10 bg-white p-5 dark:border-white/10 dark:bg-neutral-950">
      <p className="text-sm text-neutral-500">{titulo}</p>
      <p className={`mt-2 text-3xl font-bold ${cor}`}>{valor}</p>
    </div>
  );
}

export default function Painel() {
  const { data, isLoading } = useGetPainel();

  if (isLoading) return <p className="text-sm text-neutral-500">Carregando...</p>;

  const ativos = data?.clientesAtivos ?? 0;
  const comp = data?.competenciaAtual;
  const resumo = comp?.resumo ?? null;

  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold">Painel</h1>
      <p className="mb-6 text-sm text-neutral-500">Visão geral do escritório</p>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Cartao titulo="Clientes ativos" valor={String(ativos)} cor="text-blue-600" />
        {resumo ? (
          <>
            <Cartao
              titulo="Obrigações pendentes"
              valor={String(resumo.obrigacoes.pendentes)}
              cor="text-amber-600"
            />
            <Cartao
              titulo="A receber no mês"
              valor={formatarMoeda(resumo.pagamentos.aReceber)}
              cor="text-red-600"
            />
            <Cartao
              titulo="Recebido no mês"
              valor={formatarMoeda(resumo.pagamentos.recebido)}
              cor="text-green-600"
            />
          </>
        ) : (
          <Cartao titulo="Competências" valor="0" cor="text-neutral-500" />
        )}
      </div>

      <div className="mt-8">
        <h2 className="mb-3 text-lg font-semibold">Mês atual</h2>
        {comp && resumo && comp.ano != null && comp.mes != null ? (
          <Link
            href={`/competencias/${comp.id}`}
            className="block rounded-xl border border-black/10 bg-white p-5 hover:border-blue-500 dark:border-white/10 dark:bg-neutral-950"
          >
            <p className="text-lg font-semibold">{rotuloCompetencia(comp.ano, comp.mes)}</p>
            <p className="mt-1 text-sm text-neutral-500">
              {resumo.obrigacoes.feitos}/{resumo.obrigacoes.total} obrigações enviadas ·{" "}
              {resumo.obrigacoes.emitidos} emitidas ·{" "}
              {resumo.pagamentos.pagos}/{resumo.pagamentos.total} pagamentos recebidos
            </p>
          </Link>
        ) : (
          <p className="rounded-lg bg-amber-100 px-4 py-3 text-sm text-amber-800">
            Nenhum mês aberto.{" "}
            <Link href="/competencias" className="font-medium underline">
              Abrir o primeiro mês
            </Link>
            .
          </p>
        )}
      </div>
    </div>
  );
}
