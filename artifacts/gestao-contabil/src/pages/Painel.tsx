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

      {data?.alertas && (
        <div className="mt-8">
          <h2 className="mb-3 text-lg font-semibold">Alertas</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {(
              [
                !data.alertas.competenciaDoMesAberta && {
                  titulo: "Mês atual ainda não aberto",
                  valor: "Abrir",
                  href: "/competencias",
                  cor: "border-amber-400 bg-amber-50 text-amber-800 dark:bg-amber-950/30 dark:text-amber-300",
                },
                {
                  titulo: "Guias vencendo em 7 dias",
                  valor: data.alertas.vencendo7Dias,
                  href: data.alertas.competenciaDoMesId
                    ? `/competencias/${data.alertas.competenciaDoMesId}`
                    : "/competencias",
                },
                {
                  titulo: "Emitidas, não enviadas e vencidas",
                  valor: data.alertas.emitidasNaoEnviadasVencidas,
                  href: "/pendencias",
                },
                {
                  titulo: "Honorários vencidos",
                  valor: data.alertas.honorariosVencidos.quantidade,
                  sub: formatarMoeda(data.alertas.honorariosVencidos.total),
                  href: "/pendencias",
                },
                {
                  titulo: "Férias vencendo ou vencidas",
                  valor: data.alertas.feriasVencendo,
                  href: "/funcionarios",
                },
                {
                  titulo: "Procurações vencendo em 30 dias",
                  valor: data.alertas.procuracoesVencendo30Dias,
                  href: "/cadastro",
                },
                {
                  titulo: "Procurações vencidas",
                  valor: data.alertas.procuracoesVencidas,
                  href: "/cadastro",
                },
                {
                  titulo: "Processos com prazo estourado",
                  valor: data.alertas.processosAtrasados,
                  href: "/processos",
                },
                {
                  titulo: "Avisos que falharam",
                  valor: data.alertas.avisosFalhados,
                  href: "/pendencias",
                },
                {
                  titulo: "Clientes ativos sem obrigações",
                  valor: data.alertas.clientesSemObrigacoes,
                  href: "/clientes",
                },
              ] as Array<
                | false
                | {
                    titulo: string;
                    valor: number | string;
                    sub?: string;
                    href: string;
                    cor?: string;
                  }
              >
            )
              .filter(
                (
                  a,
                ): a is {
                  titulo: string;
                  valor: number | string;
                  sub?: string;
                  href: string;
                  cor?: string;
                } => !!a,
              )
              .map((a) => {
                const zerado = a.valor === 0;
                return (
                  <Link
                    key={a.titulo}
                    href={a.href}
                    data-alerta={a.titulo}
                    className={`rounded-xl border p-4 transition-colors hover:border-blue-500 ${
                      a.cor ??
                      (zerado
                        ? "border-black/10 bg-white text-neutral-400 dark:border-white/10 dark:bg-neutral-950"
                        : "border-red-300 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300")
                    }`}
                  >
                    <p className="text-sm">{a.titulo}</p>
                    <p className="mt-1 text-2xl font-bold">{a.valor}</p>
                    {a.sub && <p className="text-xs">{a.sub}</p>}
                  </Link>
                );
              })}
          </div>
        </div>
      )}

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
              {resumo.obrigacoes.emitidos} emitidas · {resumo.pagamentos.pagos}/
              {resumo.pagamentos.total} pagamentos recebidos
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
