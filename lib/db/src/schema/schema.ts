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

export const statusItemEnum = pgEnum("status_item", [
  "pendente",
  "feito",
  "nao_aplica",
]);

export const statusPagamentoEnum = pgEnum("status_pagamento", [
  "pendente",
  "pago",
  "isento",
]);

export const clientes = pgTable("clientes", {
  id: serial("id").primaryKey(),
  codigo: integer("codigo"),
  razaoSocial: text("razao_social").notNull(),
  cnpj: text("cnpj"),
  inscricaoEstadual: text("inscricao_estadual"),
  formaEnvio: text("forma_envio"),
  procuracao: text("procuracao"),
  senhaNfse: text("senha_nfse"),
  observacao: text("observacao"),
  valorHonorario: numeric("valor_honorario", { precision: 10, scale: 2 }),
  diaVencimentoHonorario: integer("dia_vencimento_honorario"),
  whatsapp: text("whatsapp"),
  ativo: boolean("ativo").notNull().default(true),
  criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
});

export const tiposObrigacao = pgTable("tipos_obrigacao", {
  id: serial("id").primaryKey(),
  nome: text("nome").notNull().unique(),
  ordem: integer("ordem").notNull().default(0),
  diaVencimento: integer("dia_vencimento"),
  offsetMes: integer("offset_mes").notNull().default(1),
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
