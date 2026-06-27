import { notFound } from "next/navigation";
import {
  listarPagamentos,
  obterCompetencia,
  resumoCompetencia,
} from "@/lib/consultas";
import { rotuloCompetencia } from "@/lib/formato";
import CabecalhoCompetencia from "../../CabecalhoCompetencia";
import PagamentosUI from "./PagamentosUI";

export const dynamic = "force-dynamic";

export default async function PaginaPagamentos({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const competenciaId = Number(id);
  const comp = await obterCompetencia(competenciaId);
  if (!comp) notFound();

  const [pgs, resumo] = await Promise.all([
    listarPagamentos(competenciaId),
    resumoCompetencia(competenciaId),
  ]);

  return (
    <div>
      <CabecalhoCompetencia
        id={competenciaId}
        titulo={rotuloCompetencia(comp.ano, comp.mes)}
        abaAtiva="pagamentos"
        resumo={resumo}
      />
      <PagamentosUI
        competenciaId={competenciaId}
        pagamentos={pgs.map((p) => ({
          id: p.id,
          status: p.status,
          valor: p.valor,
          dataPagamento: p.dataPagamento,
          forma: p.forma,
          observacao: p.observacao,
          codigo: p.codigo,
          cliente: p.cliente,
        }))}
      />
    </div>
  );
}
