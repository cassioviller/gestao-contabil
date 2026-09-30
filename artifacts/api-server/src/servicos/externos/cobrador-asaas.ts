import type { Cobrador, NovaCobranca } from "./tipos";

/**
 * Asaas: cliente por CNPJ, cobrança com Pix/boleto/cartão a escolha do
 * pagador (`billingType: UNDEFINED`) e o QR do Pix quando disponível.
 */
export class CobradorAsaas implements Cobrador {
  readonly nome = "asaas";
  private readonly base: string;

  constructor(
    private readonly apiKey: string,
    ambiente: string = "sandbox",
  ) {
    this.base =
      ambiente === "producao" ? "https://api.asaas.com/v3" : "https://sandbox.asaas.com/api/v3";
  }

  private async chamar<T>(metodo: string, caminho: string, corpo?: unknown): Promise<T> {
    const r = await fetch(`${this.base}${caminho}`, {
      method: metodo,
      headers: {
        access_token: this.apiKey,
        "content-type": "application/json",
        "user-agent": "ContaFacil",
      },
      body: corpo === undefined ? undefined : JSON.stringify(corpo),
      signal: AbortSignal.timeout(20_000),
    });
    const dados = (await r.json().catch(() => ({}))) as T & { errors?: { description?: string }[] };
    if (!r.ok) {
      const motivo = dados.errors?.map((e) => e.description).join("; ") || `HTTP ${r.status}`;
      throw new Error(`Asaas: ${motivo}`);
    }
    return dados;
  }

  async garantirCliente(c: {
    nome: string;
    cnpj: string;
    email?: string | null;
    telefone?: string | null;
  }) {
    const cnpj = c.cnpj.replace(/\D/g, "");
    const busca = await this.chamar<{ data?: { id: string }[] }>(
      "GET",
      `/customers?cpfCnpj=${cnpj}&limit=1`,
    );
    if (busca.data?.[0]) return { id: busca.data[0].id };
    const criado = await this.chamar<{ id: string }>("POST", "/customers", {
      name: c.nome,
      cpfCnpj: cnpj,
      email: c.email || undefined,
      mobilePhone: c.telefone?.replace(/\D/g, "") || undefined,
      notificationDisabled: true,
    });
    return { id: criado.id };
  }

  async criarCobranca(c: NovaCobranca) {
    const cobranca = await this.chamar<{ id: string; invoiceUrl?: string }>("POST", "/payments", {
      customer: c.clienteExternoId,
      billingType: "UNDEFINED",
      value: Number(c.valor),
      dueDate: c.vencimento,
      description: c.descricao,
      externalReference: c.referencia,
    });
    let qrPix: string | null = null;
    try {
      const pix = await this.chamar<{ payload?: string }>(
        "GET",
        `/payments/${cobranca.id}/pixQrCode`,
      );
      qrPix = pix.payload ?? null;
    } catch {
      // Sem Pix habilitado na conta: o link cobre boleto e cartão.
    }
    return { id: cobranca.id, link: cobranca.invoiceUrl ?? "", qrPix };
  }

  async cancelar(id: string): Promise<void> {
    await this.chamar("DELETE", `/payments/${id}`);
  }
}
