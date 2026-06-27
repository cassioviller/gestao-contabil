CREATE TABLE "cobrancas" (
	"id" serial PRIMARY KEY NOT NULL,
	"pagamento_id" integer NOT NULL,
	"canal" text DEFAULT 'whatsapp' NOT NULL,
	"enviado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "configuracoes" (
	"chave" text PRIMARY KEY NOT NULL,
	"valor" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "checklist_itens" ADD COLUMN "vencimento" date;--> statement-breakpoint
ALTER TABLE "clientes" ADD COLUMN "dia_vencimento_honorario" integer;--> statement-breakpoint
ALTER TABLE "clientes" ADD COLUMN "whatsapp" text;--> statement-breakpoint
ALTER TABLE "pagamentos" ADD COLUMN "vencimento" date;--> statement-breakpoint
ALTER TABLE "tipos_obrigacao" ADD COLUMN "dia_vencimento" integer;--> statement-breakpoint
ALTER TABLE "tipos_obrigacao" ADD COLUMN "offset_mes" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "cobrancas" ADD CONSTRAINT "cobrancas_pagamento_id_pagamentos_id_fk" FOREIGN KEY ("pagamento_id") REFERENCES "public"."pagamentos"("id") ON DELETE cascade ON UPDATE no action;