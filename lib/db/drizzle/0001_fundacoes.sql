CREATE TYPE "public"."canal_aviso" AS ENUM('email', 'whatsapp', 'portal');--> statement-breakpoint
CREATE TYPE "public"."papel_usuario" AS ENUM('admin', 'contador', 'auxiliar');--> statement-breakpoint
CREATE TYPE "public"."status_aviso" AS ENUM('pendente', 'enviado', 'entregue', 'lido', 'falhou');--> statement-breakpoint
CREATE TYPE "public"."status_job" AS ENUM('pendente', 'executando', 'concluido', 'falhou');--> statement-breakpoint
CREATE TABLE "arquivos" (
	"id" serial PRIMARY KEY NOT NULL,
	"conta_id" integer NOT NULL,
	"cliente_id" integer,
	"entidade" text NOT NULL,
	"entidade_id" integer NOT NULL,
	"nome" text NOT NULL,
	"mime" text NOT NULL,
	"tamanho" integer NOT NULL,
	"chave" text NOT NULL,
	"sha256" text,
	"origem" text DEFAULT 'escritorio' NOT NULL,
	"enviado_por" integer,
	"confirmado" boolean DEFAULT false NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "arquivos_chave_unique" UNIQUE("chave")
);
--> statement-breakpoint
CREATE TABLE "auditoria" (
	"id" serial PRIMARY KEY NOT NULL,
	"conta_id" integer NOT NULL,
	"usuario_id" integer,
	"ator" text,
	"acao" text NOT NULL,
	"entidade" text,
	"entidade_id" integer,
	"campo" text,
	"de" text,
	"para" text,
	"ip" text,
	"quando" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "avisos" (
	"id" serial PRIMARY KEY NOT NULL,
	"conta_id" integer NOT NULL,
	"cliente_id" integer,
	"canal" "canal_aviso" NOT NULL,
	"destino" text,
	"modelo" text NOT NULL,
	"assunto" text,
	"corpo" text NOT NULL,
	"status" "status_aviso" DEFAULT 'pendente' NOT NULL,
	"tentativas" integer DEFAULT 0 NOT NULL,
	"provedor_id" text,
	"erro" text,
	"referencia_entidade" text,
	"referencia_id" integer,
	"enviado_em" timestamp with time zone,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "eventos_webhook" (
	"id" serial PRIMARY KEY NOT NULL,
	"provedor" text NOT NULL,
	"evento_id" text NOT NULL,
	"tipo" text,
	"payload" jsonb,
	"processado_em" timestamp with time zone,
	"recebido_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "jobs" (
	"id" serial PRIMARY KEY NOT NULL,
	"conta_id" integer,
	"tipo" text NOT NULL,
	"chave" text,
	"dados" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" "status_job" DEFAULT 'pendente' NOT NULL,
	"tentativas" integer DEFAULT 0 NOT NULL,
	"max_tentativas" integer DEFAULT 5 NOT NULL,
	"executar_em" timestamp with time zone DEFAULT now() NOT NULL,
	"iniciado_em" timestamp with time zone,
	"concluido_em" timestamp with time zone,
	"erro" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "jobs_chave_unique" UNIQUE("chave")
);
--> statement-breakpoint
CREATE TABLE "protocolos" (
	"id" serial PRIMARY KEY NOT NULL,
	"conta_id" integer NOT NULL,
	"cliente_id" integer NOT NULL,
	"checklist_item_id" integer,
	"arquivo_id" integer,
	"canal" "canal_aviso" NOT NULL,
	"token" text NOT NULL,
	"expira_em" timestamp with time zone NOT NULL,
	"enviado_por" integer,
	"enviado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"visualizado_em" timestamp with time zone,
	"ip_visualizacao" text,
	"ciente_em" timestamp with time zone,
	CONSTRAINT "protocolos_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "sessoes_cliente" (
	"token" text PRIMARY KEY NOT NULL,
	"conta_id" integer NOT NULL,
	"cliente_id" integer NOT NULL,
	"email" text NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"ultimo_uso_em" timestamp with time zone DEFAULT now() NOT NULL,
	"expira_em" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "solicitacoes" (
	"id" serial PRIMARY KEY NOT NULL,
	"conta_id" integer NOT NULL,
	"cliente_id" integer NOT NULL,
	"tipo" text DEFAULT 'documento' NOT NULL,
	"descricao" text NOT NULL,
	"prazo" date,
	"status" text DEFAULT 'aberta' NOT NULL,
	"origem" text DEFAULT 'escritorio' NOT NULL,
	"criada_por" integer,
	"respondida_em" timestamp with time zone,
	"resposta" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tentativas_login" (
	"id" serial PRIMARY KEY NOT NULL,
	"login" text NOT NULL,
	"ip" text,
	"sucesso" boolean NOT NULL,
	"quando" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tokens_acesso" (
	"id" serial PRIMARY KEY NOT NULL,
	"conta_id" integer NOT NULL,
	"finalidade" text NOT NULL,
	"usuario_id" integer,
	"cliente_id" integer,
	"token" text NOT NULL,
	"expira_em" timestamp with time zone NOT NULL,
	"usado_em" timestamp with time zone,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tokens_acesso_token_unique" UNIQUE("token")
);
--> statement-breakpoint
ALTER TABLE "checklist_itens" ADD COLUMN "enviado_em" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "checklist_itens" ADD COLUMN "atualizado_por" integer;--> statement-breakpoint
ALTER TABLE "clientes" ADD COLUMN "inativado_em" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "contas" ADD COLUMN "chave_pix" text;--> statement-breakpoint
ALTER TABLE "contas" ADD COLUMN "abertura_automatica" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "contas" ADD COLUMN "dias_para_cobrar" integer DEFAULT 5 NOT NULL;--> statement-breakpoint
ALTER TABLE "pagamentos" ADD COLUMN "cobranca_externa_id" text;--> statement-breakpoint
ALTER TABLE "pagamentos" ADD COLUMN "link_pagamento" text;--> statement-breakpoint
ALTER TABLE "pagamentos" ADD COLUMN "qr_pix" text;--> statement-breakpoint
ALTER TABLE "pagamentos" ADD COLUMN "atualizado_por" integer;--> statement-breakpoint
ALTER TABLE "processos" ADD COLUMN "origem" text DEFAULT 'escritorio' NOT NULL;--> statement-breakpoint
ALTER TABLE "sessoes" ADD COLUMN "ultimo_uso_em" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "tipos_obrigacao" ADD COLUMN "descricao" text;--> statement-breakpoint
ALTER TABLE "tipos_obrigacao" ADD COLUMN "vincular_automatico" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "usuarios" ADD COLUMN "email" text;--> statement-breakpoint
ALTER TABLE "usuarios" ADD COLUMN "papel" "papel_usuario" DEFAULT 'contador' NOT NULL;--> statement-breakpoint
ALTER TABLE "usuarios" ADD COLUMN "ultimo_acesso_em" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "usuarios" ADD COLUMN "senha_alterada_em" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "arquivos" ADD CONSTRAINT "arquivos_conta_id_contas_id_fk" FOREIGN KEY ("conta_id") REFERENCES "public"."contas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "arquivos" ADD CONSTRAINT "arquivos_cliente_id_clientes_id_fk" FOREIGN KEY ("cliente_id") REFERENCES "public"."clientes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "arquivos" ADD CONSTRAINT "arquivos_enviado_por_usuarios_id_fk" FOREIGN KEY ("enviado_por") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auditoria" ADD CONSTRAINT "auditoria_conta_id_contas_id_fk" FOREIGN KEY ("conta_id") REFERENCES "public"."contas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auditoria" ADD CONSTRAINT "auditoria_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "avisos" ADD CONSTRAINT "avisos_conta_id_contas_id_fk" FOREIGN KEY ("conta_id") REFERENCES "public"."contas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "avisos" ADD CONSTRAINT "avisos_cliente_id_clientes_id_fk" FOREIGN KEY ("cliente_id") REFERENCES "public"."clientes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_conta_id_contas_id_fk" FOREIGN KEY ("conta_id") REFERENCES "public"."contas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "protocolos" ADD CONSTRAINT "protocolos_conta_id_contas_id_fk" FOREIGN KEY ("conta_id") REFERENCES "public"."contas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "protocolos" ADD CONSTRAINT "protocolos_cliente_id_clientes_id_fk" FOREIGN KEY ("cliente_id") REFERENCES "public"."clientes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "protocolos" ADD CONSTRAINT "protocolos_checklist_item_id_checklist_itens_id_fk" FOREIGN KEY ("checklist_item_id") REFERENCES "public"."checklist_itens"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "protocolos" ADD CONSTRAINT "protocolos_arquivo_id_arquivos_id_fk" FOREIGN KEY ("arquivo_id") REFERENCES "public"."arquivos"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "protocolos" ADD CONSTRAINT "protocolos_enviado_por_usuarios_id_fk" FOREIGN KEY ("enviado_por") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessoes_cliente" ADD CONSTRAINT "sessoes_cliente_conta_id_contas_id_fk" FOREIGN KEY ("conta_id") REFERENCES "public"."contas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessoes_cliente" ADD CONSTRAINT "sessoes_cliente_cliente_id_clientes_id_fk" FOREIGN KEY ("cliente_id") REFERENCES "public"."clientes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "solicitacoes" ADD CONSTRAINT "solicitacoes_conta_id_contas_id_fk" FOREIGN KEY ("conta_id") REFERENCES "public"."contas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "solicitacoes" ADD CONSTRAINT "solicitacoes_cliente_id_clientes_id_fk" FOREIGN KEY ("cliente_id") REFERENCES "public"."clientes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "solicitacoes" ADD CONSTRAINT "solicitacoes_criada_por_usuarios_id_fk" FOREIGN KEY ("criada_por") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tokens_acesso" ADD CONSTRAINT "tokens_acesso_conta_id_contas_id_fk" FOREIGN KEY ("conta_id") REFERENCES "public"."contas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tokens_acesso" ADD CONSTRAINT "tokens_acesso_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tokens_acesso" ADD CONSTRAINT "tokens_acesso_cliente_id_clientes_id_fk" FOREIGN KEY ("cliente_id") REFERENCES "public"."clientes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ix_arquivos_entidade" ON "arquivos" USING btree ("conta_id","entidade","entidade_id");--> statement-breakpoint
CREATE INDEX "ix_arquivos_cliente" ON "arquivos" USING btree ("cliente_id");--> statement-breakpoint
CREATE INDEX "ix_auditoria_conta_quando" ON "auditoria" USING btree ("conta_id","quando");--> statement-breakpoint
CREATE INDEX "ix_auditoria_entidade" ON "auditoria" USING btree ("entidade","entidade_id");--> statement-breakpoint
CREATE INDEX "ix_avisos_conta_status" ON "avisos" USING btree ("conta_id","status");--> statement-breakpoint
CREATE INDEX "ix_avisos_referencia" ON "avisos" USING btree ("referencia_entidade","referencia_id");--> statement-breakpoint
CREATE INDEX "ix_avisos_provedor" ON "avisos" USING btree ("provedor_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ux_evento_webhook" ON "eventos_webhook" USING btree ("provedor","evento_id");--> statement-breakpoint
CREATE INDEX "ix_jobs_status_executar" ON "jobs" USING btree ("status","executar_em");--> statement-breakpoint
CREATE INDEX "ix_protocolos_item" ON "protocolos" USING btree ("checklist_item_id");--> statement-breakpoint
CREATE INDEX "ix_protocolos_cliente" ON "protocolos" USING btree ("cliente_id");--> statement-breakpoint
CREATE INDEX "ix_sessoes_cliente" ON "sessoes_cliente" USING btree ("cliente_id");--> statement-breakpoint
CREATE INDEX "ix_solicitacoes_conta_status" ON "solicitacoes" USING btree ("conta_id","status");--> statement-breakpoint
CREATE INDEX "ix_solicitacoes_cliente" ON "solicitacoes" USING btree ("cliente_id");--> statement-breakpoint
CREATE INDEX "ix_tentativas_login" ON "tentativas_login" USING btree ("login","quando");--> statement-breakpoint
CREATE INDEX "ix_tokens_finalidade" ON "tokens_acesso" USING btree ("finalidade","expira_em");--> statement-breakpoint
ALTER TABLE "checklist_itens" ADD CONSTRAINT "checklist_itens_atualizado_por_usuarios_id_fk" FOREIGN KEY ("atualizado_por") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pagamentos" ADD CONSTRAINT "pagamentos_atualizado_por_usuarios_id_fk" FOREIGN KEY ("atualizado_por") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ix_checklist_conta_status_venc" ON "checklist_itens" USING btree ("conta_id","status","vencimento");--> statement-breakpoint
CREATE INDEX "ix_clientes_conta" ON "clientes" USING btree ("conta_id","ativo");--> statement-breakpoint
CREATE INDEX "ix_cobrancas_pagamento" ON "cobrancas" USING btree ("pagamento_id");--> statement-breakpoint
CREATE INDEX "ix_credenciais_cliente" ON "credenciais" USING btree ("cliente_id");--> statement-breakpoint
CREATE INDEX "ix_debitos_conta_status" ON "debitos" USING btree ("conta_id","status");--> statement-breakpoint
CREATE INDEX "ix_debitos_cliente" ON "debitos" USING btree ("cliente_id");--> statement-breakpoint
CREATE INDEX "ix_pagamentos_conta_status_venc" ON "pagamentos" USING btree ("conta_id","status","vencimento");--> statement-breakpoint
CREATE INDEX "ix_etapas_processo" ON "processo_etapas" USING btree ("processo_id");--> statement-breakpoint
CREATE INDEX "ix_processos_conta_status" ON "processos" USING btree ("conta_id","status");--> statement-breakpoint
CREATE INDEX "ix_processos_cliente" ON "processos" USING btree ("cliente_id");--> statement-breakpoint
CREATE INDEX "ix_usuarios_conta" ON "usuarios" USING btree ("conta_id","ativo");