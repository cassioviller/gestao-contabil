import {
  listarObrigacoesEmAtraso,
  listarInadimplentes,
  obterConfiguracao,
} from "@/lib/consultas";
import { MODELO_WHATSAPP_PADRAO } from "@/lib/whatsapp";
import PendenciasUI from "./PendenciasUI";

export const dynamic = "force-dynamic";

export default async function PaginaPendencias() {
  const [obrigacoes, inadimplentes, modeloSalvo] = await Promise.all([
    listarObrigacoesEmAtraso(),
    listarInadimplentes(),
    obterConfiguracao("modelo_whatsapp_inadimplencia"),
  ]);

  return (
    <PendenciasUI
      obrigacoes={obrigacoes}
      inadimplentes={inadimplentes}
      modelo={modeloSalvo ?? MODELO_WHATSAPP_PADRAO}
    />
  );
}
