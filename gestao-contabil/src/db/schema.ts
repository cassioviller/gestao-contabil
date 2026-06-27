// Schema do banco (Postgres via Drizzle).
// Modela o controle mensal de obrigações e pagamentos de uma carteira contábil.
//
// Ideia central: separar o que é FIXO (cadastro do cliente e quais obrigações
// ele tem) do que é RECORRENTE por mês (competência, checklist e pagamento).
// Assim, "abrir um novo mês" deixa de ser copiar uma aba e passa a ser gerar
// automaticamente as pendências a partir do cadastro.

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

// ---------- Enums ----------

// Status de cada item do checklist de obrigações no mês.
export const statusItemEnum = pgEnum("status_item", [
  "pendente",
  "feito",
  "nao_aplica",
]);

// Status do pagamento de honorários no mês.
export const statusPagamentoEnum = pgEnum("status_pagamento", [
  "pendente",
  "pago",
  "isento",
]);

// ---------- Cadastro fixo ----------

// Empresa/cliente do escritório. Equivale a uma linha da aba "DADOS".
export const clientes = pgTable("clientes", {
  id: serial("id").primaryKey(),
  // Código que o escritório já usa na planilha (coluna "Cód.").
  codigo: integer("codigo"),
  razaoSocial: text("razao_social").notNull(),
  cnpj: text("cnpj"),
  inscricaoEstadual: text("inscricao_estadual"),
  // Texto livre da planilha: "email - fulano", "wpp", etc.
  formaEnvio: text("forma_envio"),
  // Coluna "Procuração" da DADOS (data/observação de procuração).
  procuracao: text("procuracao"),
  senhaNfse: text("senha_nfse"),
  observacao: text("observacao"),
  // Valor fixo do honorário mensal (R$). Usado para gerar a linha de pagamento
  // do mês; pode ser ajustado pontualmente no mês sem alterar o cadastro.
  valorHonorario: numeric("valor_honorario", { precision: 10, scale: 2 }),
  // Dia do mês de vencimento do honorário (nulo = usa o padrão do código).
  diaVencimentoHonorario: integer("dia_vencimento_honorario"),
  // Telefone para cobrança via WhatsApp (texto livre; normalizado na hora do link).
  whatsapp: text("whatsapp"),
  ativo: boolean("ativo").notNull().default(true),
  criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
});

// Catálogo de obrigações possíveis (DAS, DEFIS, INSS/DCTFweb, FGTS, ...).
// Cada coluna de obrigação das abas vira uma linha aqui.
export const tiposObrigacao = pgTable("tipos_obrigacao", {
  id: serial("id").primaryKey(),
  nome: text("nome").notNull().unique(),
  // Ordem de exibição na grade (espelha a ordem das colunas na planilha).
  ordem: integer("ordem").notNull().default(0),
  // Dia do mês em que esta obrigação vence (nulo = sem prazo definido).
  diaVencimento: integer("dia_vencimento"),
  // Meses após a competência em que o vencimento cai (0 = mesmo mês, 1 = mês seguinte).
  offsetMes: integer("offset_mes").notNull().default(1),
  ativo: boolean("ativo").notNull().default(true),
});

// Quais obrigações se aplicam a cada cliente (config vinda das abas).
// "detalhe" guarda o marcador original quando ele carrega informação extra
// (ex.: DAS = "V" / "S/V - Site", TIPO/DAS = "Prest. Serv.").
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

// ---------- Recorrência mensal ----------

// Um mês de trabalho. Cada aba de mês da planilha vira uma competência.
export const competencias = pgTable(
  "competencias",
  {
    id: serial("id").primaryKey(),
    ano: integer("ano").notNull(),
    mes: integer("mes").notNull(), // 1..12
    // Rótulo opcional ("JUNHO 2026") para casar com a planilha de origem.
    rotulo: text("rotulo"),
    criadoEm: timestamp("criado_em", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    unq: uniqueIndex("ux_competencia_ano_mes").on(t.ano, t.mes),
  })
);

// Uma obrigação de um cliente em um mês específico, com seu status.
// Gerado automaticamente a partir de cliente_obrigacoes ao abrir a competência.
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
    // Prazo de entrega; calculado ao abrir a competência, ajustável por item.
    vencimento: date("vencimento"),
    observacao: text("observacao"),
    atualizadoEm: timestamp("atualizado_em", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    unq: uniqueIndex("ux_checklist_item").on(
      t.competenciaId,
      t.clienteId,
      t.tipoObrigacaoId
    ),
  })
);

// Controle de pagamento de honorários por cliente em cada mês.
// Gerado junto com a competência; valor herda do cadastro mas é editável.
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
    // Vencimento do honorário; calculado ao abrir a competência.
    vencimento: date("vencimento"),
    forma: text("forma"), // PIX, boleto, etc.
    observacao: text("observacao"),
    atualizadoEm: timestamp("atualizado_em", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    unq: uniqueIndex("ux_pagamento").on(t.competenciaId, t.clienteId),
  })
);

// ---------- Configurações e cobranças ----------

// Pares chave/valor de configuração (ex.: modelo de mensagem de cobrança).
export const configuracoes = pgTable("configuracoes", {
  chave: text("chave").primaryKey(),
  valor: text("valor").notNull(),
});

// Histórico de cobranças disparadas (uma linha por clique no botão WhatsApp).
export const cobrancas = pgTable("cobrancas", {
  id: serial("id").primaryKey(),
  pagamentoId: integer("pagamento_id")
    .notNull()
    .references(() => pagamentos.id, { onDelete: "cascade" }),
  canal: text("canal").notNull().default("whatsapp"),
  enviadoEm: timestamp("enviado_em", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
