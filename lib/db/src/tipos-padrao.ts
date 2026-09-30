/**
 * Catálogo inicial de obrigações. Toda conta nova nasce com esta lista copiada
 * para dentro dela — daí em diante cada escritório edita a sua na tela Tipos
 * de obrigação, sem afetar as outras contas.
 *
 * Cada entrada já vem com periodicidade, mês âncora, dia de vencimento,
 * deslocamento de mês e regimes. Sem isso o checklist nascia sem vencimento e
 * a tela de Pendências nunca acusava atraso.
 *
 * Prazos de referência (validar com a contadora responsável; mudam por
 * legislação, UF e município). `diaVencimento` 31 = último dia do mês; o
 * cálculo ajusta para meses mais curtos. `offsetMes` conta a partir do mês de
 * competência: 1 = mês seguinte.
 */

export type Regime = "simples_nacional" | "mei" | "lucro_presumido" | "lucro_real";
export type Periodicidade = "mensal" | "bimestral" | "trimestral" | "semestral" | "anual";

export type TipoPadrao = {
  nome: string;
  descricao: string;
  periodicidade: Periodicidade;
  mesReferencia: number | null;
  diaVencimento: number | null;
  offsetMes: number;
  /** `null` = vale para todos os regimes. */
  regimes: Regime[] | null;
  /** Ao cadastrar um cliente do regime, a obrigação já vem vinculada. */
  vincularAutomatico: boolean;
};

const TODOS: Regime[] | null = null;
const SIMPLES: Regime[] = ["simples_nacional"];
const MEI: Regime[] = ["mei"];
const PRESUMIDO_REAL: Regime[] = ["lucro_presumido", "lucro_real"];
const NAO_MEI: Regime[] = ["simples_nacional", "lucro_presumido", "lucro_real"];

export const TIPOS_PADRAO: TipoPadrao[] = [
  // ---- Simples Nacional e MEI ----
  {
    nome: "DAS",
    descricao: "Documento de Arrecadação do Simples Nacional",
    periodicidade: "mensal", mesReferencia: null, diaVencimento: 20, offsetMes: 1,
    regimes: SIMPLES, vincularAutomatico: true,
  },
  {
    nome: "PGDAS-D",
    descricao: "Declaração mensal do Simples Nacional que gera o DAS",
    periodicidade: "mensal", mesReferencia: null, diaVencimento: 20, offsetMes: 1,
    regimes: SIMPLES, vincularAutomatico: true,
  },
  {
    nome: "DAS-MEI",
    descricao: "Guia mensal do microempreendedor individual",
    periodicidade: "mensal", mesReferencia: null, diaVencimento: 20, offsetMes: 1,
    regimes: MEI, vincularAutomatico: true,
  },
  {
    nome: "DEFIS",
    descricao: "Declaração anual do Simples Nacional (ano-calendário anterior)",
    periodicidade: "anual", mesReferencia: 3, diaVencimento: 31, offsetMes: 0,
    regimes: SIMPLES, vincularAutomatico: true,
  },
  {
    nome: "DASN-SIMEI",
    descricao: "Declaração anual do MEI",
    periodicidade: "anual", mesReferencia: 5, diaVencimento: 31, offsetMes: 0,
    regimes: MEI, vincularAutomatico: true,
  },
  {
    nome: "DeSTDA",
    descricao: "Declaração de substituição tributária, diferencial de alíquota e antecipação (Simples com ICMS)",
    periodicidade: "mensal", mesReferencia: null, diaVencimento: 28, offsetMes: 1,
    regimes: SIMPLES, vincularAutomatico: false,
  },

  // ---- Federais (todos ou não-MEI) ----
  {
    nome: "DCTFWeb",
    descricao: "Declaração de débitos e créditos tributários federais (inclui o MIT)",
    periodicidade: "mensal", mesReferencia: null, diaVencimento: 25, offsetMes: 1,
    regimes: NAO_MEI, vincularAutomatico: true,
  },
  {
    nome: "eSocial",
    descricao: "Fechamento dos eventos periódicos da folha",
    periodicidade: "mensal", mesReferencia: null, diaVencimento: 15, offsetMes: 1,
    regimes: TODOS, vincularAutomatico: false,
  },
  {
    nome: "FGTS Digital",
    descricao: "Recolhimento mensal do FGTS",
    periodicidade: "mensal", mesReferencia: null, diaVencimento: 20, offsetMes: 1,
    regimes: TODOS, vincularAutomatico: false,
  },
  {
    nome: "INSS",
    descricao: "DARF previdenciário gerado pela DCTFWeb",
    periodicidade: "mensal", mesReferencia: null, diaVencimento: 20, offsetMes: 1,
    regimes: TODOS, vincularAutomatico: false,
  },
  {
    nome: "IRRF",
    descricao: "Imposto de renda retido na fonte",
    periodicidade: "mensal", mesReferencia: null, diaVencimento: 20, offsetMes: 1,
    regimes: PRESUMIDO_REAL, vincularAutomatico: false,
  },
  {
    nome: "EFD-Reinf",
    descricao: "Escrituração das retenções e outras informações fiscais",
    periodicidade: "mensal", mesReferencia: null, diaVencimento: 15, offsetMes: 1,
    regimes: NAO_MEI, vincularAutomatico: false,
  },
  {
    nome: "PIS/COFINS",
    descricao: "DARF mensal de PIS e COFINS",
    periodicidade: "mensal", mesReferencia: null, diaVencimento: 25, offsetMes: 1,
    regimes: PRESUMIDO_REAL, vincularAutomatico: true,
  },
  {
    nome: "IRPJ/CSLL",
    descricao: "Apuração trimestral (último dia útil do mês seguinte ao trimestre)",
    periodicidade: "trimestral", mesReferencia: 3, diaVencimento: 31, offsetMes: 1,
    regimes: PRESUMIDO_REAL, vincularAutomatico: true,
  },
  {
    nome: "EFD-Contribuições",
    descricao: "Escrituração de PIS/COFINS (10º dia útil do 2º mês seguinte)",
    periodicidade: "mensal", mesReferencia: null, diaVencimento: 14, offsetMes: 2,
    regimes: PRESUMIDO_REAL, vincularAutomatico: true,
  },
  {
    nome: "ECF",
    descricao: "Escrituração Contábil Fiscal (último dia útil de julho)",
    periodicidade: "anual", mesReferencia: 7, diaVencimento: 31, offsetMes: 0,
    regimes: PRESUMIDO_REAL, vincularAutomatico: true,
  },
  {
    nome: "ECD",
    descricao: "Escrituração Contábil Digital (último dia útil de maio; frequentemente prorrogada)",
    periodicidade: "anual", mesReferencia: 5, diaVencimento: 31, offsetMes: 0,
    regimes: PRESUMIDO_REAL, vincularAutomatico: true,
  },
  {
    nome: "DIRPF dos sócios",
    descricao: "Declaração de imposto de renda pessoa física dos sócios",
    periodicidade: "anual", mesReferencia: 5, diaVencimento: 31, offsetMes: 0,
    regimes: TODOS, vincularAutomatico: false,
  },

  // ---- Estaduais ----
  {
    nome: "EFD ICMS/IPI",
    descricao: "Escrituração fiscal digital (dia varia por UF)",
    periodicidade: "mensal", mesReferencia: null, diaVencimento: 20, offsetMes: 1,
    regimes: PRESUMIDO_REAL, vincularAutomatico: false,
  },
  {
    nome: "GIA",
    descricao: "Guia de informação e apuração do ICMS (SP e equivalentes)",
    periodicidade: "mensal", mesReferencia: null, diaVencimento: 20, offsetMes: 1,
    regimes: PRESUMIDO_REAL, vincularAutomatico: false,
  },
  {
    nome: "DIFAL",
    descricao: "Diferencial de alíquota do ICMS",
    periodicidade: "mensal", mesReferencia: null, diaVencimento: 15, offsetMes: 1,
    regimes: NAO_MEI, vincularAutomatico: false,
  },

  // ---- Municipais ----
  {
    nome: "ISS",
    descricao: "Guia municipal do ISS (dia varia por município)",
    periodicidade: "mensal", mesReferencia: null, diaVencimento: 10, offsetMes: 1,
    regimes: TODOS, vincularAutomatico: false,
  },
  {
    nome: "Declaração municipal de serviços",
    descricao: "DES/DMS ou equivalente do município",
    periodicidade: "mensal", mesReferencia: null, diaVencimento: 10, offsetMes: 1,
    regimes: TODOS, vincularAutomatico: false,
  },

  // ---- Rotinas do escritório ----
  {
    nome: "Folha de pagamento",
    descricao: "Cálculo e pagamento dos salários",
    periodicidade: "mensal", mesReferencia: null, diaVencimento: 5, offsetMes: 1,
    regimes: TODOS, vincularAutomatico: false,
  },
  {
    nome: "Pró-labore",
    descricao: "Retirada dos sócios",
    periodicidade: "mensal", mesReferencia: null, diaVencimento: 5, offsetMes: 1,
    regimes: TODOS, vincularAutomatico: false,
  },
  {
    nome: "Balancete",
    descricao: "Fechamento contábil do mês",
    periodicidade: "mensal", mesReferencia: null, diaVencimento: 31, offsetMes: 1,
    regimes: PRESUMIDO_REAL, vincularAutomatico: false,
  },
  {
    nome: "Parcelamento",
    descricao: "Parcela mensal de débitos parcelados (só para quem tem parcelamento ativo)",
    periodicidade: "mensal", mesReferencia: null, diaVencimento: 31, offsetMes: 0,
    regimes: TODOS, vincularAutomatico: false,
  },
  {
    nome: "DIMOB/DMED",
    descricao: "Declarações anuais de setores específicos (imobiliário, saúde)",
    periodicidade: "anual", mesReferencia: 2, diaVencimento: 28, offsetMes: 0,
    regimes: TODOS, vincularAutomatico: false,
  },
];

/** Só os nomes, para scripts que precisam do catálogo em ordem. */
export const NOMES_TIPOS_PADRAO: string[] = TIPOS_PADRAO.map((t) => t.nome);
