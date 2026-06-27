import { notFound } from "next/navigation";
import {
  listarChecklist,
  obterCompetencia,
  resumoCompetencia,
} from "@/lib/consultas";
import { rotuloCompetencia } from "@/lib/formato";
import CabecalhoCompetencia from "../CabecalhoCompetencia";
import ChecklistUI from "./ChecklistUI";

export const dynamic = "force-dynamic";

export default async function PaginaChecklist({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const competenciaId = Number(id);
  const comp = await obterCompetencia(competenciaId);
  if (!comp) notFound();

  const [itens, resumo] = await Promise.all([
    listarChecklist(competenciaId),
    resumoCompetencia(competenciaId),
  ]);

  return (
    <div>
      <CabecalhoCompetencia
        id={competenciaId}
        titulo={rotuloCompetencia(comp.ano, comp.mes)}
        abaAtiva="obrigacoes"
        resumo={resumo}
      />
      <ChecklistUI
        competenciaId={competenciaId}
        itens={itens.map((i) => ({
          id: i.id,
          status: i.status,
          clienteId: i.clienteId,
          codigo: i.codigo,
          cliente: i.cliente,
          vencimento: i.vencimento,
          tipoObrigacaoId: i.tipoObrigacaoId,
          obrigacao: i.obrigacao,
          ordem: i.ordem,
        }))}
      />
    </div>
  );
}
