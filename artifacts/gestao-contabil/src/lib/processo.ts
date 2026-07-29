/** Status do enum `status_processo` do banco. */
export const STATUS_PROCESSO = [
  { valor: "aberto", rotulo: "Aberto" },
  { valor: "em_andamento", rotulo: "Em andamento" },
  { valor: "concluido", rotulo: "Concluído" },
  { valor: "cancelado", rotulo: "Cancelado" },
] as const;

export type StatusProcessoValor = (typeof STATUS_PROCESSO)[number]["valor"];

/**
 * Processos e pedidos compartilham a mesma máquina (mesma tabela, mesmas rotas,
 * mesmo checklist) — muda só a categoria e o vocabulário da tela. Processo é o
 * trâmite formal em órgão; pedido é a demanda corriqueira do cliente.
 */
export type Categoria = "processo" | "pedido";

export const TEXTOS: Record<Categoria, {
  titulo: string;
  singular: string;
  novo: string;
  sugestoes: string[];
  exemploTipo: string;
  exemploEtapa: string;
  mostrarOrgao: boolean;
}> = {
  processo: {
    titulo: "Processos",
    singular: "processo",
    novo: "Novo processo",
    exemploTipo: "ex: Troca de titularidade",
    exemploEtapa: "O que precisa ser feito? ex: protocolar alteração na JUCESP",
    mostrarOrgao: true,
    sugestoes: [
      "Troca de titularidade",
      "Alteração de endereço",
      "Alteração de sócios",
      "Alteração de capital social",
      "Alteração de atividade (CNAE)",
      "Abertura de empresa",
      "Baixa / encerramento",
      "Transferência de contabilidade",
      "Parcelamento de débitos",
      "Emissão de certidão",
      "Renovação de procuração",
      "Alteração de regime tributário",
    ],
  },
  pedido: {
    titulo: "Pedidos",
    singular: "pedido",
    novo: "Novo pedido",
    exemploTipo: "ex: Atualização de guia",
    exemploEtapa: "O que precisa ser feito? ex: conferir valor com o cliente",
    mostrarOrgao: false,
    sugestoes: [
      "Atualização de guia",
      "Atualização de salário",
      "Emissão de guia avulsa",
      "Segunda via de guia",
      "Admissão de funcionário",
      "Demissão de funcionário",
      "Férias",
      "Cálculo de rescisão",
      "Pró-labore",
      "Informe de rendimentos",
      "Relatório contábil",
      "Consulta / orientação",
    ],
  },
};

export function rotuloStatusProcesso(valor: string): string {
  return STATUS_PROCESSO.find((s) => s.valor === valor)?.rotulo ?? valor;
}

export function corStatusProcesso(valor: string): string {
  switch (valor) {
    case "concluido":
      return "bg-green-600/15 text-green-700 dark:text-green-400";
    case "em_andamento":
      return "bg-blue-600/15 text-blue-700 dark:text-blue-400";
    case "cancelado":
      return "bg-neutral-500/15 text-neutral-500";
    default:
      return "bg-amber-500/15 text-amber-700 dark:text-amber-400";
  }
}

/** Prazo vencido só conta enquanto o processo ainda está em aberto. */
export function atrasado(prazo: string | null | undefined, status: string): boolean {
  if (!prazo || status === "concluido" || status === "cancelado") return false;
  return prazo.slice(0, 10) < new Date().toISOString().slice(0, 10);
}
