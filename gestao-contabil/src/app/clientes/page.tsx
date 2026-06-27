import {
  listarClientes,
  listarTiposObrigacao,
  mapaObrigacoesPorCliente,
} from "@/lib/consultas";
import ClientesUI from "./ClientesUI";

export const dynamic = "force-dynamic";

export default async function PaginaClientes() {
  const [clientes, tipos, obrigacoesPorCliente] = await Promise.all([
    listarClientes(),
    listarTiposObrigacao(),
    mapaObrigacoesPorCliente(),
  ]);

  // Achata para objetos simples (serializáveis para o componente cliente).
  const dados = clientes.map((c) => ({
    id: c.id,
    codigo: c.codigo,
    razaoSocial: c.razaoSocial,
    cnpj: c.cnpj,
    inscricaoEstadual: c.inscricaoEstadual,
    formaEnvio: c.formaEnvio,
    procuracao: c.procuracao,
    senhaNfse: c.senhaNfse,
    observacao: c.observacao,
    valorHonorario: c.valorHonorario,
    diaVencimentoHonorario: c.diaVencimentoHonorario,
    whatsapp: c.whatsapp,
    ativo: c.ativo,
    obrigacoes: obrigacoesPorCliente[c.id] ?? [],
  }));

  return (
    <ClientesUI
      clientes={dados}
      tipos={tipos.map((t) => ({ id: t.id, nome: t.nome }))}
    />
  );
}
