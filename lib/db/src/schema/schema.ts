import {
  pgTable,
  serial,
  text,
  integer,
  boolean,
  numeric,
  date,
  timestamp,
  uniqueIndex,
  pgEnum,
} from "drizzle-orm/pg-core";

// Ciclo de vida de uma guia: nasce pendente, é emitida, depois enviada ao
// cliente. `nao_aplica` fica de fora do ciclo — é a obrigação que naquele mês
// não vale para aquela empresa.
export const statusItemEnum = pgEnum("status_item", [
  "pendente",
  "emitido",
  "enviado",
  "nao_aplica",
]);

export const statusPagamentoEnum = pgEnum("status_pagamento", [
  "pendente",
  "pago",
  "isento",
]);

export const periodicidadeEnum = pgEnum("periodicidade", [
  "mensal",
  "bimestral",
  "trimestral",
  "semestral",
  "anual",
]);

/** Separa o que é processo formal (JUCESP, Receita) do pedido corriqueiro do cliente. */
export const categoriaProcessoEnum = pgEnum("categoria_processo", ["processo", "pedido"]);

export const statusProcessoEnum = pgEnum("status_processo", [
  "aberto",
  "em_andamento",
  "concluido",
  "cancelado",
]);

export const regimeTributarioEnum = pgEnum("regime_tributario", [
  "simples_nacional",
  "mei",
  "lucro_presumido",
  "lucro_real",
]);

export const clientes = pgTable("clientes", {
  id: serial("id").primaryKey(),
  codigo: integer("codigo"),
  razaoSocial: text("razao_social").notNull(),
  cnpj: text("cnpj"),
  cnaePrincipal: text("cnae_principal"),
  regime: regimeTributarioEnum("regime"),
  inscricaoEstadual: text("inscricao_estadual"),
  inscricaoMunicipal: text("inscricao_municipal"),
  formaEnvio: text("forma_envio"),
  procuracao: text("procuracao"),
  procuracaoVencimento: date("procuracao_vencimento"),
  socioNome: text("socio_nome"),
  socioCpf: text("socio_cpf"),
  senhaGov: text("senha_gov"),
  senhaNfse: text("senha_nfse"),
  observacao: text("observacao"),
  valorHonorario: numeric("valor_honorario", { precision: 10, scale: 2 }),
  diaVencimentoHonorario: integer("dia_vencimento_honorario"),
  contatoNome: text("contato_nome"),
  whatsapp: text("whatsapp"),
  email: text("email"),
  ativo: boolean("ativo").notNull().default(true),
  criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
});

export const tiposObrigacao = pgTable("tipos_obrigacao", {
  id: serial("id").primaryKey(),
  nome: text("nome").notNull().unique(),
  ordem: integer("ordem").notNull().default(0),
  diaVencimento: integer("dia_vencimento"),
  offsetMes: integer("offset_mes").notNull().default(1),
  periodicidade: periodicidadeEnum("periodicidade").notNull().default("mensal"),
  /**
   * Mês âncora do ciclo, para o que não é mensal: a obrigação vale nos meses em
   * que `(mes - mesReferencia)` é múltiplo do intervalo. Ex.: anual com
   * referência 7 só cai em julho; trimestral com referência 3 cai em 3/6/9/12.
   */
  mesReferencia: integer("mes_referencia"),
  /**
   * Regimes a que a obrigação se aplica. Vazio/nulo = vale para todos — é o
   * caso da maioria; a lista existe para as que só cabem em um regime (DIFAL
   * no lucro presumido, DECLARAÇÃO MEI no MEI…).
   */
  regimes: regimeTributarioEnum("regimes").array(),
  ativo: boolean("ativo").notNull().default(true),
});

export const clienteObrigacoes = pgTable(
  "cliente_obrigacoes",
  {
    id: serial("id").primaryKey(),
    clienteId: integer("cliente_id")
      .notNull()
      .references(() => clientes.id, { onDelete: "cascade" }),
    tipoObrigacaoId: integer("tipo_obrigacao_id")
      .notNull()
      .references(() => tiposObrigacao.id, { onDelete: "cascade" }),
    detalhe: text("detalhe"),
  },
  (t) => ({
    unq: uniqueIndex("ux_cliente_obrigacao").on(t.clienteId, t.tipoObrigacaoId),
  })
);

export const competencias = pgTable(
  "competencias",
  {
    id: serial("id").primaryKey(),
    ano: integer("ano").notNull(),
    mes: integer("mes").notNull(),
    rotulo: text("rotulo"),
    criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    unq: uniqueIndex("ux_competencia_ano_mes").on(t.ano, t.mes),
  })
);

export const checklistItens = pgTable(
  "checklist_itens",
  {
    id: serial("id").primaryKey(),
    competenciaId: integer("competencia_id")
      .notNull()
      .references(() => competencias.id, { onDelete: "cascade" }),
    clienteId: integer("cliente_id")
      .notNull()
      .references(() => clientes.id, { onDelete: "cascade" }),
    tipoObrigacaoId: integer("tipo_obrigacao_id")
      .notNull()
      .references(() => tiposObrigacao.id, { onDelete: "cascade" }),
    status: statusItemEnum("status").notNull().default("pendente"),
    vencimento: date("vencimento"),
    observacao: text("observacao"),
    atualizadoEm: timestamp("atualizado_em", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    unq: uniqueIndex("ux_checklist_item").on(t.competenciaId, t.clienteId, t.tipoObrigacaoId),
  })
);

export const pagamentos = pgTable(
  "pagamentos",
  {
    id: serial("id").primaryKey(),
    competenciaId: integer("competencia_id")
      .notNull()
      .references(() => competencias.id, { onDelete: "cascade" }),
    clienteId: integer("cliente_id")
      .notNull()
      .references(() => clientes.id, { onDelete: "cascade" }),
    status: statusPagamentoEnum("status").notNull().default("pendente"),
    valor: numeric("valor", { precision: 10, scale: 2 }),
    dataPagamento: date("data_pagamento"),
    vencimento: date("vencimento"),
    forma: text("forma"),
    observacao: text("observacao"),
    atualizadoEm: timestamp("atualizado_em", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    unq: uniqueIndex("ux_pagamento").on(t.competenciaId, t.clienteId),
  })
);

/**
 * Senhas por sistema/obrigação de cada cliente (DAS, nota fiscal, e-CAC…).
 * `tipoObrigacaoId` liga ao catálogo quando a senha é de uma obrigação; fica
 * nulo para acessos gerais (gov.br, prefeitura). `rotulo` é o que aparece na
 * tela, então a linha continua legível mesmo sem vínculo com o catálogo.
 */
export const credenciais = pgTable("credenciais", {
  id: serial("id").primaryKey(),
  clienteId: integer("cliente_id")
    .notNull()
    .references(() => clientes.id, { onDelete: "cascade" }),
  tipoObrigacaoId: integer("tipo_obrigacao_id").references(() => tiposObrigacao.id, {
    onDelete: "set null",
  }),
  rotulo: text("rotulo").notNull(),
  login: text("login"),
  senha: text("senha"),
  observacao: text("observacao"),
});

/**
 * Processos avulsos de um cliente (troca de titularidade, alteração de endereço,
 * abertura, baixa…). Diferente do checklist mensal: não tem competência, cada
 * processo tem prazo próprio e um roteiro de etapas montado à mão.
 */
export const processos = pgTable("processos", {
  id: serial("id").primaryKey(),
  clienteId: integer("cliente_id")
    .notNull()
    .references(() => clientes.id, { onDelete: "cascade" }),
  categoria: categoriaProcessoEnum("categoria").notNull().default("processo"),
  tipo: text("tipo").notNull(),
  titulo: text("titulo"),
  status: statusProcessoEnum("status").notNull().default("aberto"),
  orgao: text("orgao"),
  protocolo: text("protocolo"),
  abertoEm: date("aberto_em"),
  prazo: date("prazo"),
  concluidoEm: date("concluido_em"),
  observacao: text("observacao"),
  criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
});

/** Checklist de um processo: o que precisa ser feito e o que já foi. */
export const processoEtapas = pgTable("processo_etapas", {
  id: serial("id").primaryKey(),
  processoId: integer("processo_id")
    .notNull()
    .references(() => processos.id, { onDelete: "cascade" }),
  descricao: text("descricao").notNull(),
  feito: boolean("feito").notNull().default(false),
  ordem: integer("ordem").notNull().default(0),
  concluidoEm: timestamp("concluido_em", { withTimezone: true }),
  observacao: text("observacao"),
});

export const configuracoes = pgTable("configuracoes", {
  chave: text("chave").primaryKey(),
  valor: text("valor").notNull(),
});

export const cobrancas = pgTable("cobrancas", {
  id: serial("id").primaryKey(),
  pagamentoId: integer("pagamento_id")
    .notNull()
    .references(() => pagamentos.id, { onDelete: "cascade" }),
  canal: text("canal").notNull().default("whatsapp"),
  enviadoEm: timestamp("enviado_em", { withTimezone: true }).notNull().defaultNow(),
});
