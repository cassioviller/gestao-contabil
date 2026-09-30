import type { MensagemWhatsapp } from "./tipos";

/**
 * WhatsApp Cloud API (Meta). Fora da janela de 24 h só passa mensagem de
 * modelo aprovado; por isso a interface pede `modelo` + `variaveis`.
 */
export class WhatsappCloud {
  readonly nome = "whatsapp-cloud";

  constructor(
    private readonly token: string,
    private readonly numeroId: string,
    private readonly versao = process.env.WHATSAPP_API_VERSAO ?? "v21.0",
  ) {}

  async enviarWhatsapp(m: MensagemWhatsapp): Promise<{ id: string }> {
    const para = m.para.replace(/\D/g, "");
    const resposta = await fetch(
      `https://graph.facebook.com/${this.versao}/${this.numeroId}/messages`,
      {
        method: "POST",
        headers: { authorization: `Bearer ${this.token}`, "content-type": "application/json" },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to: para,
          type: "template",
          template: {
            name: m.modelo,
            language: { code: "pt_BR" },
            components: [
              { type: "body", parameters: m.variaveis.map((v) => ({ type: "text", text: v })) },
            ],
          },
        }),
        signal: AbortSignal.timeout(15_000),
      },
    );
    const corpo = (await resposta.json().catch(() => ({}))) as {
      messages?: { id: string }[];
      error?: { message?: string };
    };
    if (!resposta.ok) {
      throw new Error(`WhatsApp ${resposta.status}: ${corpo.error?.message ?? "falha ao enviar"}`);
    }
    return { id: corpo.messages?.[0]?.id ?? "whatsapp-sem-id" };
  }
}
