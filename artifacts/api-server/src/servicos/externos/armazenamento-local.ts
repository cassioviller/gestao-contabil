import { createReadStream } from "node:fs";
import { mkdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Readable } from "node:stream";
import type { Armazenamento } from "./tipos";

/**
 * Arquivos no disco local, para desenvolvimento e testes. Não serve para o
 * autoscale (cada instância tem o seu disco, e ele some no deploy): em
 * produção use o R2.
 */
export class ArmazenamentoLocal implements Armazenamento {
  readonly nome = "local";
  readonly pasta: string;

  constructor(pasta = process.env.DADOS_LOCAIS_DIR || path.resolve("dados-locais")) {
    this.pasta = pasta;
  }

  private caminho(chave: string): string {
    // A chave é sempre `conta/<id>/<uuid>`: nada de `..` nem barra invertida.
    if (!/^conta\/\d+\/[0-9a-f-]{36}$/.test(chave)) {
      throw new Error(`Chave de arquivo inválida: ${chave}`);
    }
    return path.join(this.pasta, chave);
  }

  async urlUpload(): Promise<null> {
    return null;
  }

  async urlDownload(): Promise<null> {
    return null;
  }

  async gravar(chave: string, dados: Buffer): Promise<void> {
    const destino = this.caminho(chave);
    await mkdir(path.dirname(destino), { recursive: true });
    await writeFile(destino, dados);
  }

  async abrir(chave: string): Promise<Readable> {
    const origem = this.caminho(chave);
    await stat(origem); // ENOENT vira erro aqui, não no meio do stream
    return createReadStream(origem);
  }

  async tamanho(chave: string): Promise<number | null> {
    try {
      return (await stat(this.caminho(chave))).size;
    } catch (erro) {
      if ((erro as { code?: string }).code === "ENOENT") return null;
      throw erro;
    }
  }

  async remover(chave: string): Promise<void> {
    await rm(this.caminho(chave), { force: true });
  }
}
