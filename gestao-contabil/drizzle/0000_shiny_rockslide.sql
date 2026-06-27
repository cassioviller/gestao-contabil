CREATE TYPE "public"."status_item" AS ENUM('pendente', 'feito', 'nao_aplica');--> statement-breakpoint
CREATE TYPE "public"."status_pagamento" AS ENUM('pendente', 'pago', 'isento');--> statement-breakpoint
CREATE TABLE "checklist_itens" (
	"id" serial PRIMARY KEY NOT NULL,
	"competencia_id" integer NOT NULL,
	"cliente_id" integer NOT NULL,
	"tipo_obrigacao_id" integer NOT NULL,
	"status" "status_item" DEFAULT 'pendente' NOT NULL,
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
	"codigo" integer,
	"razao_social" text NOT NULL,
	"cnpj" text,
	"inscricao_estadual" text,
	"forma_envio" text,
	"procuracao" text,
	"senha_nfse" text,
	"observacao" text,
	"valor_honorario" numeric(10, 2),
	"ativo" boolean DEFAULT true NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "competencias" (
	"id" serial PRIMARY KEY NOT NULL,
	"ano" integer NOT NULL,
	"mes" integer NOT NULL,
	"rotulo" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pagamentos" (
	"id" serial PRIMARY KEY NOT NULL,
	"competencia_id" integer NOT NULL,
	"cliente_id" integer NOT NULL,
	"status" "status_pagamento" DEFAULT 'pendente' NOT NULL,
	"valor" numeric(10, 2),
	"data_pagamento" date,
	"forma" text,
	"observacao" text,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tipos_obrigacao" (
	"id" serial PRIMARY KEY NOT NULL,
	"nome" text NOT NULL,
	"ordem" integer DEFAULT 0 NOT NULL,
	"ativo" boolean DEFAULT true NOT NULL,
	CONSTRAINT "tipos_obrigacao_nome_unique" UNIQUE("nome")
);
--> statement-breakpoint
ALTER TABLE "checklist_itens" ADD CONSTRAINT "checklist_itens_competencia_id_competencias_id_fk" FOREIGN KEY ("competencia_id") REFERENCES "public"."competencias"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checklist_itens" ADD CONSTRAINT "checklist_itens_cliente_id_clientes_id_fk" FOREIGN KEY ("cliente_id") REFERENCES "public"."clientes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checklist_itens" ADD CONSTRAINT "checklist_itens_tipo_obrigacao_id_tipos_obrigacao_id_fk" FOREIGN KEY ("tipo_obrigacao_id") REFERENCES "public"."tipos_obrigacao"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cliente_obrigacoes" ADD CONSTRAINT "cliente_obrigacoes_cliente_id_clientes_id_fk" FOREIGN KEY ("cliente_id") REFERENCES "public"."clientes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cliente_obrigacoes" ADD CONSTRAINT "cliente_obrigacoes_tipo_obrigacao_id_tipos_obrigacao_id_fk" FOREIGN KEY ("tipo_obrigacao_id") REFERENCES "public"."tipos_obrigacao"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pagamentos" ADD CONSTRAINT "pagamentos_competencia_id_competencias_id_fk" FOREIGN KEY ("competencia_id") REFERENCES "public"."competencias"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pagamentos" ADD CONSTRAINT "pagamentos_cliente_id_clientes_id_fk" FOREIGN KEY ("cliente_id") REFERENCES "public"."clientes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ux_checklist_item" ON "checklist_itens" USING btree ("competencia_id","cliente_id","tipo_obrigacao_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ux_cliente_obrigacao" ON "cliente_obrigacoes" USING btree ("cliente_id","tipo_obrigacao_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ux_competencia_ano_mes" ON "competencias" USING btree ("ano","mes");--> statement-breakpoint
CREATE UNIQUE INDEX "ux_pagamento" ON "pagamentos" USING btree ("competencia_id","cliente_id");