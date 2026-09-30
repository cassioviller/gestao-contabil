CREATE TYPE "public"."categoria_processo" AS ENUM('processo', 'pedido');--> statement-breakpoint
CREATE TYPE "public"."periodicidade" AS ENUM('mensal', 'bimestral', 'trimestral', 'semestral', 'anual');--> statement-breakpoint
CREATE TYPE "public"."regime_tributario" AS ENUM('simples_nacional', 'mei', 'lucro_presumido', 'lucro_real');--> statement-breakpoint
CREATE TYPE "public"."situacao_funcionario" AS ENUM('ativo', 'ferias', 'afastado', 'demitido');--> statement-breakpoint
CREATE TYPE "public"."status_debito" AS ENUM('em_aberto', 'parcelado', 'pago');--> statement-breakpoint
CREATE TYPE "public"."status_item" AS ENUM('pendente', 'emitido', 'enviado', 'nao_aplica');--> statement-breakpoint
CREATE TYPE "public"."status_pagamento" AS ENUM('pendente', 'pago', 'isento');--> statement-breakpoint
CREATE TYPE "public"."status_processo" AS ENUM('aberto', 'em_andamento', 'concluido', 'cancelado');--> statement-breakpoint
CREATE TYPE "public"."tipo_folha" AS ENUM('mensal', 'ferias', 'decimo_terceiro');--> statement-breakpoint
CREATE TABLE "checklist_itens" (
	"id" serial PRIMARY KEY NOT NULL,
	"conta_id" integer NOT NULL,
	"competencia_id" integer NOT NULL,
	"cliente_id" integer NOT NULL,
	"tipo_obrigacao_id" integer NOT NULL,
	"status" "status_item" DEFAULT 'pendente' NOT NULL,
	"vencimento" date,
	"observacao" text,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cliente_obrigacoes" (
	"id" serial PRIMARY KEY NOT NULL,
	"cliente_id" integer NOT NULL,
	"tipo_obrigacao_id" integer NOT NULL,
	"detalhe" text
);
--> statement-breakpoint
CREATE TABLE "clientes" (
	"id" serial PRIMARY KEY NOT NULL,
	"conta_id" integer NOT NULL,
	"codigo" integer,
	"razao_social" text NOT NULL,
	"cnpj" text,
	"cnae_principal" text,
	"regime" "regime_tributario",
	"inscricao_estadual" text,
	"inscricao_municipal" text,
	"forma_envio" text,
	"procuracao" text,
	"procuracao_vencimento" date,
	"socio_nome" text,
	"socio_cpf" text,
	"senha_gov" text,
	"senha_nfse" text,
	"observacao" text,
	"valor_honorario" numeric(10, 2),
	"dia_vencimento_honorario" integer,
	"contato_nome" text,
	"whatsapp" text,
	"email" text,
	"ativo" boolean DEFAULT true NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cobrancas" (
	"id" serial PRIMARY KEY NOT NULL,
	"pagamento_id" integer NOT NULL,
	"canal" text DEFAULT 'whatsapp' NOT NULL,
	"enviado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "competencias" (
	"id" serial PRIMARY KEY NOT NULL,
	"conta_id" integer NOT NULL,
	"ano" integer NOT NULL,
	"mes" integer NOT NULL,
	"rotulo" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "configuracoes" (
	"conta_id" integer NOT NULL,
	"chave" text NOT NULL,
	"valor" text NOT NULL,
	CONSTRAINT "configuracoes_conta_id_chave_pk" PRIMARY KEY("conta_id","chave")
);
--> statement-breakpoint
CREATE TABLE "contas" (
	"id" serial PRIMARY KEY NOT NULL,
	"nome" text NOT NULL,
	"cnpj" text,
	"responsavel" text,
	"crc" text,
	"telefone" text,
	"email" text,
	"endereco" text,
	"ativo" boolean DEFAULT true NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "credenciais" (
	"id" serial PRIMARY KEY NOT NULL,
	"conta_id" integer NOT NULL,
	"cliente_id" integer NOT NULL,
	"tipo_obrigacao_id" integer,
	"rotulo" text NOT NULL,
	"login" text,
	"senha" text,
	"observacao" text
);
--> statement-breakpoint
CREATE TABLE "debitos" (
	"id" serial PRIMARY KEY NOT NULL,
	"conta_id" integer NOT NULL,
	"cliente_id" integer NOT NULL,
	"tipo_obrigacao_id" integer,
	"rotulo" text NOT NULL,
	"competencia_ref" text,
	"vencimento" date,
	"valor" numeric(12, 2),
	"status" "status_debito" DEFAULT 'em_aberto' NOT NULL,
	"observacao" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "despesas" (
	"id" serial PRIMARY KEY NOT NULL,
	"conta_id" integer NOT NULL,
	"cliente_id" integer,
	"data" date NOT NULL,
	"categoria" text NOT NULL,
	"descricao" text NOT NULL,
	"valor" numeric(12, 2) NOT NULL,
	"vencimento" date,
	"forma_pagamento" text,
	"pago" boolean DEFAULT false NOT NULL,
	"observacao" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ferias" (
	"id" serial PRIMARY KEY NOT NULL,
	"conta_id" integer NOT NULL,
	"funcionario_id" integer NOT NULL,
	"aquisitivo_inicio" date NOT NULL,
	"aquisitivo_fim" date NOT NULL,
	"gozo_inicio" date,
	"gozo_fim" date,
	"dias_vendidos" integer DEFAULT 0 NOT NULL,
	"valor" numeric(12, 2),
	"observacao" text
);
--> statement-breakpoint
CREATE TABLE "folha_lancamentos" (
	"id" serial PRIMARY KEY NOT NULL,
	"conta_id" integer NOT NULL,
	"funcionario_id" integer NOT NULL,
	"ano" integer NOT NULL,
	"mes" integer NOT NULL,
	"tipo" "tipo_folha" DEFAULT 'mensal' NOT NULL,
	"salario_base" numeric(12, 2),
	"proventos" numeric(12, 2),
	"descontos" numeric(12, 2),
	"inss" numeric(12, 2),
	"fgts" numeric(12, 2),
	"irrf" numeric(12, 2),
	"liquido" numeric(12, 2),
	"pago" boolean DEFAULT false NOT NULL,
	"pago_em" date,
	"observacao" text
);
--> statement-breakpoint
CREATE TABLE "funcionarios" (
	"id" serial PRIMARY KEY NOT NULL,
	"conta_id" integer NOT NULL,
	"cliente_id" integer,
	"nome" text NOT NULL,
	"cpf" text,
	"rg" text,
	"pis" text,
	"ctps" text,
	"nascimento" date,
	"cargo" text,
	"admissao" date,
	"demissao" date,
	"salario" numeric(12, 2),
	"situacao" "situacao_funcionario" DEFAULT 'ativo' NOT NULL,
	"telefone" text,
	"email" text,
	"endereco" text,
	"observacao" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pagamentos" (
	"id" serial PRIMARY KEY NOT NULL,
	"conta_id" integer NOT NULL,
	"competencia_id" integer NOT NULL,
	"cliente_id" integer NOT NULL,
	"status" "status_pagamento" DEFAULT 'pendente' NOT NULL,
	"valor" numeric(10, 2),
	"data_pagamento" date,
	"vencimento" date,
	"forma" text,
	"observacao" text,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "processo_etapas" (
	"id" serial PRIMARY KEY NOT NULL,
	"processo_id" integer NOT NULL,
	"descricao" text NOT NULL,
	"feito" boolean DEFAULT false NOT NULL,
	"ordem" integer DEFAULT 0 NOT NULL,
	"concluido_em" timestamp with time zone,
	"observacao" text
);
--> statement-breakpoint
CREATE TABLE "processos" (
	"id" serial PRIMARY KEY NOT NULL,
	"conta_id" integer NOT NULL,
	"cliente_id" integer NOT NULL,
	"categoria" "categoria_processo" DEFAULT 'processo' NOT NULL,
	"tipo" text NOT NULL,
	"titulo" text,
	"status" "status_processo" DEFAULT 'aberto' NOT NULL,
	"orgao" text,
	"protocolo" text,
	"aberto_em" date,
	"prazo" date,
	"concluido_em" date,
	"observacao" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessoes" (
	"token" text PRIMARY KEY NOT NULL,
	"usuario_id" integer NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"expira_em" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tipos_obrigacao" (
	"id" serial PRIMARY KEY NOT NULL,
	"conta_id" integer NOT NULL,
	"nome" text NOT NULL,
	"ordem" integer DEFAULT 0 NOT NULL,
	"dia_vencimento" integer,
	"offset_mes" integer DEFAULT 1 NOT NULL,
	"periodicidade" "periodicidade" DEFAULT 'mensal' NOT NULL,
	"mes_referencia" integer,
	"regimes" "regime_tributario"[],
	"ativo" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "usuarios" (
	"id" serial PRIMARY KEY NOT NULL,
	"conta_id" integer NOT NULL,
	"login" text NOT NULL,
	"senha_hash" text NOT NULL,
	"nome" text,
	"ativo" boolean DEFAULT true NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "usuarios_login_unique" UNIQUE("login")
);
--> statement-breakpoint
ALTER TABLE "checklist_itens" ADD CONSTRAINT "checklist_itens_conta_id_contas_id_fk" FOREIGN KEY ("conta_id") REFERENCES "public"."contas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checklist_itens" ADD CONSTRAINT "checklist_itens_competencia_id_competencias_id_fk" FOREIGN KEY ("competencia_id") REFERENCES "public"."competencias"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checklist_itens" ADD CONSTRAINT "checklist_itens_cliente_id_clientes_id_fk" FOREIGN KEY ("cliente_id") REFERENCES "public"."clientes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checklist_itens" ADD CONSTRAINT "checklist_itens_tipo_obrigacao_id_tipos_obrigacao_id_fk" FOREIGN KEY ("tipo_obrigacao_id") REFERENCES "public"."tipos_obrigacao"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cliente_obrigacoes" ADD CONSTRAINT "cliente_obrigacoes_cliente_id_clientes_id_fk" FOREIGN KEY ("cliente_id") REFERENCES "public"."clientes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cliente_obrigacoes" ADD CONSTRAINT "cliente_obrigacoes_tipo_obrigacao_id_tipos_obrigacao_id_fk" FOREIGN KEY ("tipo_obrigacao_id") REFERENCES "public"."tipos_obrigacao"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clientes" ADD CONSTRAINT "clientes_conta_id_contas_id_fk" FOREIGN KEY ("conta_id") REFERENCES "public"."contas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cobrancas" ADD CONSTRAINT "cobrancas_pagamento_id_pagamentos_id_fk" FOREIGN KEY ("pagamento_id") REFERENCES "public"."pagamentos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competencias" ADD CONSTRAINT "competencias_conta_id_contas_id_fk" FOREIGN KEY ("conta_id") REFERENCES "public"."contas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "configuracoes" ADD CONSTRAINT "configuracoes_conta_id_contas_id_fk" FOREIGN KEY ("conta_id") REFERENCES "public"."contas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credenciais" ADD CONSTRAINT "credenciais_conta_id_contas_id_fk" FOREIGN KEY ("conta_id") REFERENCES "public"."contas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credenciais" ADD CONSTRAINT "credenciais_cliente_id_clientes_id_fk" FOREIGN KEY ("cliente_id") REFERENCES "public"."clientes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credenciais" ADD CONSTRAINT "credenciais_tipo_obrigacao_id_tipos_obrigacao_id_fk" FOREIGN KEY ("tipo_obrigacao_id") REFERENCES "public"."tipos_obrigacao"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "debitos" ADD CONSTRAINT "debitos_conta_id_contas_id_fk" FOREIGN KEY ("conta_id") REFERENCES "public"."contas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "debitos" ADD CONSTRAINT "debitos_cliente_id_clientes_id_fk" FOREIGN KEY ("cliente_id") REFERENCES "public"."clientes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "debitos" ADD CONSTRAINT "debitos_tipo_obrigacao_id_tipos_obrigacao_id_fk" FOREIGN KEY ("tipo_obrigacao_id") REFERENCES "public"."tipos_obrigacao"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "despesas" ADD CONSTRAINT "despesas_conta_id_contas_id_fk" FOREIGN KEY ("conta_id") REFERENCES "public"."contas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "despesas" ADD CONSTRAINT "despesas_cliente_id_clientes_id_fk" FOREIGN KEY ("cliente_id") REFERENCES "public"."clientes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ferias" ADD CONSTRAINT "ferias_conta_id_contas_id_fk" FOREIGN KEY ("conta_id") REFERENCES "public"."contas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ferias" ADD CONSTRAINT "ferias_funcionario_id_funcionarios_id_fk" FOREIGN KEY ("funcionario_id") REFERENCES "public"."funcionarios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "folha_lancamentos" ADD CONSTRAINT "folha_lancamentos_conta_id_contas_id_fk" FOREIGN KEY ("conta_id") REFERENCES "public"."contas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "folha_lancamentos" ADD CONSTRAINT "folha_lancamentos_funcionario_id_funcionarios_id_fk" FOREIGN KEY ("funcionario_id") REFERENCES "public"."funcionarios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "funcionarios" ADD CONSTRAINT "funcionarios_conta_id_contas_id_fk" FOREIGN KEY ("conta_id") REFERENCES "public"."contas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "funcionarios" ADD CONSTRAINT "funcionarios_cliente_id_clientes_id_fk" FOREIGN KEY ("cliente_id") REFERENCES "public"."clientes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pagamentos" ADD CONSTRAINT "pagamentos_conta_id_contas_id_fk" FOREIGN KEY ("conta_id") REFERENCES "public"."contas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pagamentos" ADD CONSTRAINT "pagamentos_competencia_id_competencias_id_fk" FOREIGN KEY ("competencia_id") REFERENCES "public"."competencias"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pagamentos" ADD CONSTRAINT "pagamentos_cliente_id_clientes_id_fk" FOREIGN KEY ("cliente_id") REFERENCES "public"."clientes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "processo_etapas" ADD CONSTRAINT "processo_etapas_processo_id_processos_id_fk" FOREIGN KEY ("processo_id") REFERENCES "public"."processos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "processos" ADD CONSTRAINT "processos_conta_id_contas_id_fk" FOREIGN KEY ("conta_id") REFERENCES "public"."contas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "processos" ADD CONSTRAINT "processos_cliente_id_clientes_id_fk" FOREIGN KEY ("cliente_id") REFERENCES "public"."clientes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessoes" ADD CONSTRAINT "sessoes_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tipos_obrigacao" ADD CONSTRAINT "tipos_obrigacao_conta_id_contas_id_fk" FOREIGN KEY ("conta_id") REFERENCES "public"."contas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usuarios" ADD CONSTRAINT "usuarios_conta_id_contas_id_fk" FOREIGN KEY ("conta_id") REFERENCES "public"."contas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ux_checklist_item" ON "checklist_itens" USING btree ("competencia_id","cliente_id","tipo_obrigacao_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ux_cliente_obrigacao" ON "cliente_obrigacoes" USING btree ("cliente_id","tipo_obrigacao_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ux_competencia_ano_mes" ON "competencias" USING btree ("conta_id","ano","mes");--> statement-breakpoint
CREATE INDEX "ix_despesas_conta_data" ON "despesas" USING btree ("conta_id","data");--> statement-breakpoint
CREATE INDEX "ix_ferias_funcionario" ON "ferias" USING btree ("funcionario_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ux_folha_funcionario_mes_tipo" ON "folha_lancamentos" USING btree ("funcionario_id","ano","mes","tipo");--> statement-breakpoint
CREATE INDEX "ix_funcionarios_conta_cliente" ON "funcionarios" USING btree ("conta_id","cliente_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ux_pagamento" ON "pagamentos" USING btree ("competencia_id","cliente_id");--> statement-breakpoint
CREATE INDEX "ix_sessoes_usuario" ON "sessoes" USING btree ("usuario_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ux_tipo_obrigacao_nome" ON "tipos_obrigacao" USING btree ("conta_id","nome");