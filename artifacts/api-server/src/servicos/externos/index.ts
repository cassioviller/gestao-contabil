import { logger } from "../../lib/logger";
import { ArmazenamentoLocal } from "./armazenamento-local";
import { ArmazenamentoR2 } from "./armazenamento-r2";
import { MensageiroMemoria } from "./mensageiro-memoria";
import { EmailResend } from "./mensageiro-resend";
import { WhatsappCloud } from "./mensageiro-whatsapp";
import type { Armazenamento, Mensageiro } from "./tipos";

export type { Armazenamento, Mensageiro, Email, MensagemWhatsapp, UrlAssinada } from "./tipos";

const emTeste = process.env.NODE_ENV === "test";

function avisar(mensagem: string): void {
  if (!emTeste) logger.warn(mensagem);
}

function escolherArmazenamento(): Armazenamento {
  const { R2_ENDPOINT, R2_BUCKET, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY } = process.env;
  if (R2_ENDPOINT && R2_BUCKET && R2_ACCESS_KEY_ID && R2_SECRET_ACCESS_KEY) {
    return new ArmazenamentoR2({
      endpoint: R2_ENDPOINT,
      bucket: R2_BUCKET,
      accessKeyId: R2_ACCESS_KEY_ID,
      secretAccessKey: R2_SECRET_ACCESS_KEY,
    });
  }
  const local = new ArmazenamentoLocal();
  avisar(
    `[externos] R2_* ausentes: arquivos vão para o disco local (${local.pasta}). Não use em produção.`,
  );
  return local;
}

/** Guardado para os testes de integração inspecionarem o que "saiu". */
export const mensageiroMemoria = new MensageiroMemoria();

function escolherMensageiro(): Mensageiro {
  const { RESEND_API_KEY, EMAIL_REMETENTE, WHATSAPP_TOKEN, WHATSAPP_NUMERO_ID } = process.env;
  const email = RESEND_API_KEY
    ? new EmailResend(RESEND_API_KEY, EMAIL_REMETENTE || "ContaFácil <avisos@exemplo.com.br>")
    : null;
  const whatsapp =
    WHATSAPP_TOKEN && WHATSAPP_NUMERO_ID
      ? new WhatsappCloud(WHATSAPP_TOKEN, WHATSAPP_NUMERO_ID)
      : null;
  if (!email) avisar("[externos] RESEND_API_KEY ausente: e-mails ficam só na tabela `avisos`.");
  if (!whatsapp) avisar("[externos] WHATSAPP_* ausentes: WhatsApp fica só na tabela `avisos`.");
  return {
    nome: `${email?.nome ?? "memoria"}+${whatsapp?.nome ?? "memoria"}`,
    enviarEmail: (m) => (email ?? mensageiroMemoria).enviarEmail(m),
    enviarWhatsapp: (m) => (whatsapp ?? mensageiroMemoria).enviarWhatsapp(m),
  };
}

export const armazenamento: Armazenamento = escolherArmazenamento();
export const mensageiro: Mensageiro = escolherMensageiro();
