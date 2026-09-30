import type { Readable } from "node:stream";

/**
 * Cada serviço externo entra atrás de uma interface, com uma implementação
 * real e uma local/de memória para desenvolvimento e testes. A escolha é por
 * variável de ambiente em `./index.ts`; sem credencial, cai na local com aviso.
 */

export type UrlAssinada = {
  url: string;
  metodo: "PUT" | "GET";
  cabecalhos?: Record<string, string>;
  expiraEm: Date;
};

export interface Armazenamento {
  readonly nome: string;
  /** URL para o navegador subir direto; `null` = o upload passa pela API. */
  urlUpload(chave: string, mime: string, tamanho: number): Promise<UrlAssinada | null>;
  /** URL para baixar direto; `null` = o download passa pela API. */
  urlDownload(chave: string, nomeArquivo: string, mime: string): Promise<UrlAssinada | null>;
  gravar(chave: string, dados: Buffer, mime: string): Promise<void>;
  abrir(chave: string): Promise<Readable>;
  /** Tamanho em bytes; `null` quando o objeto não existe. */
  tamanho(chave: string): Promise<number | null>;
  remover(chave: string): Promise<void>;
}

export type Email = { para: string; assunto: string; html: string; texto: string };

export type MensagemWhatsapp = {
  para: string;
  /** Nome do modelo aprovado na Cloud API. */
  modelo: string;
  variaveis: string[];
  /** Texto completo, para provedores sem modelos (e para o registro em `avisos`). */
  texto: string;
  arquivoUrl?: string;
};

export interface Mensageiro {
  readonly nome: string;
  enviarEmail(m: Email): Promise<{ id: string }>;
  enviarWhatsapp(m: MensagemWhatsapp): Promise<{ id: string }>;
}
