import type { Email } from "./tipos";

/** E-mail transacional pela API HTTP do Resend (sem SDK: é um POST). */
export class EmailResend {
  readonly nome = "resend";

  constructor(
    private readonly apiKey: string,
    private readonly remetente: string,
  ) {}

  async enviarEmail(m: Email): Promise<{ id: string }> {
    const resposta = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${this.apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({
        from: this.remetente,
        to: [m.para],
        subject: m.assunto,
        html: m.html,
        text: m.texto,
      }),
      signal: AbortSignal.timeout(15_000),
    });
    const corpo = (await resposta.json().catch(() => ({}))) as { id?: string; message?: string };
    if (!resposta.ok) {
      throw new Error(`Resend ${resposta.status}: ${corpo.message ?? "falha ao enviar"}`);
    }
    return { id: corpo.id ?? "resend-sem-id" };
  }
}
