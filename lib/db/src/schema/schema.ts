import {
  pgTable,
  primaryKey,
  serial,
  text,
  integer,
  boolean,
  numeric,
  date,
  timestamp,
  index,
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

/** Situação de uma guia em atraso do cliente com o fisco. */
export const statusDebitoEnum = pgEnum("status_debito", [
  "em_aberto",
  "parcelado",
  "pago",
]);

export const periodicidadeEnum = pgEnum("periodicidade", [
  "mensal",
  "bimestral",
  "trimestral",
  "semestral",
  "anual",
]);

/** Separa o que é processo formal (JUCESP, Receita) do pedido corriqueiro do cliente. */
export const categoriaProcessoEnum = pgEnum("categoria_processo", [
  "processo",
  "pedido",
]);

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

/**
 * Um escritório de contabilidade. É a fronteira do multitenant: **toda** tabela
 * de dados carrega `contaId`, e nenhuma consulta da API roda sem esse filtro.
 * Contas são criadas por script (`pnpm --filter @workspace/db run criar-conta`),
 * não há cadastro aberto.
 */
export const contas = pgTable("contas", {
  id: serial("id").primaryKey(),
  nome: text("nome").notNull(),
  /**
   * Perfil do escritório — o que aparece no cabeçalho das telas e nos textos de
   * cobrança. Tudo opcional: a conta nasce por script, só com o nome, e a
   * contadora completa o resto na tela de Perfil.
   */
  cnpj: text("cnpj"),
  /** A contadora responsável: é o nome que assina a comunicação com o cliente. */
  responsavel: text("responsavel"),
  crc: text("crc"),
  telefone: text("telefone"),
  email: text("email"),
  endereco: text("endereco"),
  ativo: boolean("ativo").notNull().default(true),
  criadoEm: timestamp("criado_em", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/**
 * Quem entra no sistema. O `login` é único no sistema inteiro (e não por conta):
 * a tela de login pede só login e senha, então dois escritórios não podem ter um
 * "admin" cada. `senhaHash` é `scrypt` no formato `scrypt$N$r$p$salt$hash`.
 */
export const usuarios = pgTable("usuarios", {
  id: serial("id").primaryKey(),
  contaId: integer("conta_id")
    .notNull()
    .references(() => contas.id, { onDelete: "cascade" }),
  login: text("login").notNull().unique(),
  senhaHash: text("senha_hash").notNull(),
  nome: text("nome"),
  ativo: boolean("ativo").notNull().default(true),
  criadoEm: timestamp("criado_em", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/**
 * Sessão viva, guardada no banco em vez da memória do processo: o deploy é
 * autoscale (várias instâncias, reinícios frequentes) e sessão em memória
 * derrubaria o usuário a cada troca de instância.
 */
export const sessoes = pgTable(
  "sessoes",
  {
    token: text("token").primaryKey(),
    usuarioId: integer("usuario_id")
      .notNull()
      .references(() => usuarios.id, { onDelete: "cascade" }),
    criadoEm: timestamp("criado_em", { withTimezone: true })
      .notNull()
      .defaultNow(),
    expiraEm: timestamp("expira_em", { withTimezone: true }).notNull(),
  },
  (t) => ({
    porUsuario: index("ix_sessoes_usuario").on(t.usuarioId),
  }),
);

export const clientes = pgTable("clientes", {
  id: serial("id").primaryKey(),
  contaId: integer("conta_id")
    .notNull()
    .references(() => contas.id, { onDelete: "cascade" }),
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
  criadoEm: timestamp("criado_em", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const tiposObrigacao = pgTable(
  "tipos_obrigacao",
  {
    id: serial("id").primaryKey(),
    contaId: integer("conta_id")
      .notNull()
      .references(() => contas.id, { onDelete: "cascade" }),
    nome: text("nome").notNull(),
    ordem: integer("ordem").notNull().default(0),
    diaVencimento: integer("dia_vencimento"),
    offsetMes: integer("offset_mes").notNull().default(1),
    periodicidade: periodicidadeEnum("periodicidade")
      .notNull()
      .default("mensal"),
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
  },
  (t) => ({
    // O nome é único dentro do escritório — cada conta tem o seu catálogo.
    unq: uniqueIndex("ux_tipo_obrigacao_nome").on(t.contaId, t.nome),
  }),
);

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
  }),
);

export const competencias = pgTable(
  "competencias",
  {
    id: serial("id").primaryKey(),
    contaId: integer("conta_id")
      .notNull()
      .references(() => contas.id, { onDelete: "cascade" }),
    ano: integer("ano").notNull(),
    mes: integer("mes").notNull(),
    rotulo: text("rotulo"),
    criadoEm: timestamp("criado_em", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    unq: uniqueIndex("ux_competencia_ano_mes").on(t.contaId, t.ano, t.mes),
  }),
);

export const checklistItens = pgTable(
  "checklist_itens",
  {
    id: serial("id").primaryKey(),
    contaId: integer("conta_id")
      .notNull()
      .references(() => contas.id, { onDelete: "cascade" }),
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
    atualizadoEm: timestamp("atualizado_em", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    unq: uniqueIndex("ux_checklist_item").on(
      t.competenciaId,
      t.clienteId,
      t.tipoObrigacaoId,
    ),
  }),
);

export const pagamentos = pgTable(
  "pagamentos",
  {
    id: serial("id").primaryKey(),
    contaId: integer("conta_id")
      .notNull()
      .references(() => contas.id, { onDelete: "cascade" }),
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
    atualizadoEm: timestamp("atualizado_em", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    unq: uniqueIndex("ux_pagamento").on(t.competenciaId, t.clienteId),
  }),
);

/**
 * Guias que o cliente deve ao fisco (INSS, FGTS, parcelamento…). Nada a ver com
 * `pendencias`, que são as obrigações do escritório em atraso: aqui o devedor é
 * a empresa, e o registro sobrevive à competência em que a guia venceu.
 */
export const debitos = pgTable("debitos", {
  id: serial("id").primaryKey(),
  contaId: integer("conta_id")
    .notNull()
    .references(() => contas.id, { onDelete: "cascade" }),
  clienteId: integer("cliente_id")
    .notNull()
    .references(() => clientes.id, { onDelete: "cascade" }),
  tipoObrigacaoId: integer("tipo_obrigacao_id").references(
    () => tiposObrigacao.id,
    {
      onDelete: "set null",
    },
  ),
  /** Nome da guia como o contador escreve — livre para o que não está no catálogo. */
  rotulo: text("rotulo").notNull(),
  /** Competência de origem, em texto: aceita "05/2026" ou "03 a 05/2025". */
  competenciaRef: text("competencia_ref"),
  vencimento: date("vencimento"),
  valor: numeric("valor", { precision: 12, scale: 2 }),
  status: statusDebitoEnum("status").notNull().default("em_aberto"),
  observacao: text("observacao"),
  criadoEm: timestamp("criado_em", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/**
 * Senhas por sistema/obrigação de cada cliente (DAS, nota fiscal, e-CAC…).
 * `tipoObrigacaoId` liga ao catálogo quando a senha é de uma obrigação; fica
 * nulo para acessos gerais (gov.br, prefeitura). `rotulo` é o que aparece na
 * tela, então a linha continua legível mesmo sem vínculo com o catálogo.
 */
export const credenciais = pgTable("credenciais", {
  id: serial("id").primaryKey(),
  contaId: integer("conta_id")
    .notNull()
    .references(() => contas.id, { onDelete: "cascade" }),
  clienteId: integer("cliente_id")
    .notNull()
    .references(() => clientes.id, { onDelete: "cascade" }),
  tipoObrigacaoId: integer("tipo_obrigacao_id").references(
    () => tiposObrigacao.id,
    {
      onDelete: "set null",
    },
  ),
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
  contaId: integer("conta_id")
    .notNull()
    .references(() => contas.id, { onDelete: "cascade" }),
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
  criadoEm: timestamp("criado_em", { withTimezone: true })
    .notNull()
    .defaultNow(),
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

export const configuracoes = pgTable(
  "configuracoes",
  {
    contaId: integer("conta_id")
      .notNull()
      .references(() => contas.id, { onDelete: "cascade" }),
    chave: text("chave").notNull(),
    valor: text("valor").notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.contaId, t.chave] }),
  }),
);

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

/**
 * Situação do funcionário. `ferias` é situação temporária e existe para a tela
 * saber quem está fora agora sem precisar cruzar as datas de `ferias`.
 */
export const situacaoFuncionarioEnum = pgEnum("situacao_funcionario", [
  "ativo",
  "ferias",
  "afastado",
  "demitido",
]);

/**
 * O que um lançamento de folha representa. Separado do mês porque 13º e férias
 * são pagos junto com um mês qualquer e não podem ser confundidos com o salário
 * daquele mês nos totais.
 */
export const tipoFolhaEnum = pgEnum("tipo_folha", [
  "mensal",
  "ferias",
  "decimo_terceiro",
]);

/**
 * Gasto do escritório ou de um cliente. `clienteId` nulo = despesa da própria
 * contabilidade (aluguel, sistema, pró-labore); preenchido = despesa que o
 * escritório acompanha para o cliente. Um só lugar para os dois: a tela filtra,
 * e os relatórios de um não poluem os do outro.
 */
export const despesas = pgTable(
  "despesas",
  {
    id: serial("id").primaryKey(),
    contaId: integer("conta_id")
      .notNull()
      .references(() => contas.id, { onDelete: "cascade" }),
    clienteId: integer("cliente_id").references(() => clientes.id, {
      onDelete: "cascade",
    }),
    /** Data do gasto — é por ela que a tela agrupa o mês. */
    data: date("data").notNull(),
    /** Texto livre ("Aluguel", "Energia", "Pró-labore"): cada escritório tem os seus. */
    categoria: text("categoria").notNull(),
    descricao: text("descricao").notNull(),
    valor: numeric("valor", { precision: 12, scale: 2 }).notNull(),
    vencimento: date("vencimento"),
    formaPagamento: text("forma_pagamento"),
    pago: boolean("pago").notNull().default(false),
    observacao: text("observacao"),
    criadoEm: timestamp("criado_em", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    porData: index("ix_despesas_conta_data").on(t.contaId, t.data),
  }),
);

/**
 * Funcionário do escritório (`clienteId` nulo) ou de um cliente. Mesma tabela
 * pelo mesmo motivo das despesas: a folha, as férias e o 13º funcionam igual
 * para os dois, e duplicar a estrutura dobraria o código sem ganho nenhum.
 */
export const funcionarios = pgTable(
  "funcionarios",
  {
    id: serial("id").primaryKey(),
    contaId: integer("conta_id")
      .notNull()
      .references(() => contas.id, { onDelete: "cascade" }),
    clienteId: integer("cliente_id").references(() => clientes.id, {
      onDelete: "cascade",
    }),
    nome: text("nome").notNull(),
    cpf: text("cpf"),
    rg: text("rg"),
    pis: text("pis"),
    ctps: text("ctps"),
    nascimento: date("nascimento"),
    cargo: text("cargo"),
    admissao: date("admissao"),
    demissao: date("demissao"),
    salario: numeric("salario", { precision: 12, scale: 2 }),
    situacao: situacaoFuncionarioEnum("situacao").notNull().default("ativo"),
    telefone: text("telefone"),
    email: text("email"),
    endereco: text("endereco"),
    observacao: text("observacao"),
    criadoEm: timestamp("criado_em", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    porCliente: index("ix_funcionarios_conta_cliente").on(t.contaId, t.clienteId),
  }),
);

/**
 * Período de férias. Guarda o **aquisitivo** (os 12 meses trabalhados que dão
 * direito) separado do **gozo** (quando saiu de fato): é a diferença entre os
 * dois que diz quem está com férias vencendo — o prazo legal para conceder é
 * até 12 meses depois do fim do aquisitivo.
 */
export const ferias = pgTable(
  "ferias",
  {
    id: serial("id").primaryKey(),
    contaId: integer("conta_id")
      .notNull()
      .references(() => contas.id, { onDelete: "cascade" }),
    funcionarioId: integer("funcionario_id")
      .notNull()
      .references(() => funcionarios.id, { onDelete: "cascade" }),
    aquisitivoInicio: date("aquisitivo_inicio").notNull(),
    aquisitivoFim: date("aquisitivo_fim").notNull(),
    gozoInicio: date("gozo_inicio"),
    gozoFim: date("gozo_fim"),
    /** Abono pecuniário: até 10 dias vendidos. */
    diasVendidos: integer("dias_vendidos").notNull().default(0),
    valor: numeric("valor", { precision: 12, scale: 2 }),
    observacao: text("observacao"),
  },
  (t) => ({
    porFuncionario: index("ix_ferias_funcionario").on(t.funcionarioId),
  }),
);

/**
 * Um lançamento de folha por funcionário, por mês, por tipo. O único índice é
 * `(funcionario, ano, mes, tipo)`: repetir o mês do mesmo tipo é sempre erro de
 * digitação, mas o 13º cabe no mesmo mês do salário porque o tipo difere.
 *
 * Os valores ficam gravados em vez de calculados: as alíquotas mudam de ano
 * para ano, e a folha do ano passado tem que continuar mostrando o que foi pago
 * de fato.
 */
export const folhaLancamentos = pgTable(
  "folha_lancamentos",
  {
    id: serial("id").primaryKey(),
    contaId: integer("conta_id")
      .notNull()
      .references(() => contas.id, { onDelete: "cascade" }),
    funcionarioId: integer("funcionario_id")
      .notNull()
      .references(() => funcionarios.id, { onDelete: "cascade" }),
    ano: integer("ano").notNull(),
    mes: integer("mes").notNull(),
    tipo: tipoFolhaEnum("tipo").notNull().default("mensal"),
    salarioBase: numeric("salario_base", { precision: 12, scale: 2 }),
    proventos: numeric("proventos", { precision: 12, scale: 2 }),
    descontos: numeric("descontos", { precision: 12, scale: 2 }),
    inss: numeric("inss", { precision: 12, scale: 2 }),
    fgts: numeric("fgts", { precision: 12, scale: 2 }),
    irrf: numeric("irrf", { precision: 12, scale: 2 }),
    liquido: numeric("liquido", { precision: 12, scale: 2 }),
    pago: boolean("pago").notNull().default(false),
    pagoEm: date("pago_em"),
    observacao: text("observacao"),
  },
  (t) => ({
    unico: uniqueIndex("ux_folha_funcionario_mes_tipo").on(
      t.funcionarioId,
      t.ano,
      t.mes,
      t.tipo,
    ),
  }),
);
