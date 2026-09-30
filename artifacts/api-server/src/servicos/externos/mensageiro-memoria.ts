import type { Email, MensagemWhatsapp, Mensageiro } from "./tipos";

/**
 * Não envia nada: guarda em memória e devolve um id. É o que roda no dev sem
 * credenciais e no e2e; o registro que importa fica na tabela `avisos`.
 */
export class MensageiroMemoria implements Mensageiro {
  readonly nome = "memoria";
  readonly emails: Email[] = [];
  readonly whatsapps: MensagemWhatsapp[] = [];

  async enviarEmail(m: Email): Promise<{ id: string }> {
    if (!m.para) throw new Error("E-mail sem destinatário.");
    this.emails.push(m);
    return { id: `memoria-email-${this.emails.length}` };
  }

  async enviarWhatsapp(m: MensagemWhatsapp): Promise<{ id: string }> {
    if (!m.para) throw new Error("WhatsApp sem número.");
    this.whatsapps.push(m);
    return { id: `memoria-whatsapp-${this.whatsapps.length}` };
  }
}
