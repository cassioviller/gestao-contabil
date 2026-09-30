import type { Cobrador, NovaCobranca } from "./tipos";

/** Cobrador de mentira para dev e testes: ids previsíveis, nada sai daqui. */
export class CobradorMemoria implements Cobrador {
  readonly nome = "memoria";
  readonly cobrancas: (NovaCobranca & { id: string })[] = [];

  async garantirCliente(c: { cnpj: string }) {
    return { id: `cli-${c.cnpj.replace(/\D/g, "")}` };
  }

  async criarCobranca(c: NovaCobranca) {
    const id = `cob-memoria-${this.cobrancas.length + 1}`;
    this.cobrancas.push({ ...c, id });
    return {
      id,
      link: `https://cobranca.exemplo.com.br/${id}`,
      qrPix: `00020126580014BR.GOV.BCB.PIX-memoria-${id}`,
    };
  }

  async cancelar(): Promise<void> {}
}
