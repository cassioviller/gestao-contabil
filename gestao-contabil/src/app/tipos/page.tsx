import { listarTiposObrigacao } from "@/lib/consultas";
import TiposUI from "./TiposUI";

export const dynamic = "force-dynamic";

export default async function PaginaTipos() {
  const tipos = await listarTiposObrigacao();
  return (
    <TiposUI
      tipos={tipos.map((t) => ({
        id: t.id,
        nome: t.nome,
        ordem: t.ordem,
        diaVencimento: t.diaVencimento,
        offsetMes: t.offsetMes,
      }))}
    />
  );
}
