import type { Readable } from "node:stream";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { Armazenamento, UrlAssinada } from "./tipos";

/** Validade das URLs assinadas: o suficiente para um upload/download, não mais. */
const VALIDADE_S = 15 * 60;

export type ConfigR2 = {
  endpoint: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
};

/**
 * Cloudflare R2 pela API S3. O navegador sobe e baixa direto no bucket com
 * URLs assinadas; a API só emite as URLs e confere o tamanho na confirmação.
 */
export class ArmazenamentoR2 implements Armazenamento {
  readonly nome = "r2";
  private readonly s3: S3Client;
  private readonly bucket: string;

  constructor(config: ConfigR2) {
    this.bucket = config.bucket;
    this.s3 = new S3Client({
      region: "auto",
      endpoint: config.endpoint,
      credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
      forcePathStyle: true,
    });
  }

  async urlUpload(chave: string, mime: string, tamanho: number): Promise<UrlAssinada> {
    const url = await getSignedUrl(
      this.s3,
      new PutObjectCommand({ Bucket: this.bucket, Key: chave, ContentType: mime, ContentLength: tamanho }),
      { expiresIn: VALIDADE_S },
    );
    return { url, metodo: "PUT", cabecalhos: { "content-type": mime }, expiraEm: expira() };
  }

  async urlDownload(chave: string, nomeArquivo: string, mime: string): Promise<UrlAssinada> {
    const url = await getSignedUrl(
      this.s3,
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: chave,
        ResponseContentType: mime,
        ResponseContentDisposition: disposicaoAnexo(nomeArquivo),
      }),
      { expiresIn: VALIDADE_S },
    );
    return { url, metodo: "GET", expiraEm: expira() };
  }

  async gravar(chave: string, dados: Buffer, mime: string): Promise<void> {
    await this.s3.send(
      new PutObjectCommand({ Bucket: this.bucket, Key: chave, Body: dados, ContentType: mime }),
    );
  }

  async abrir(chave: string): Promise<Readable> {
    const { Body } = await this.s3.send(new GetObjectCommand({ Bucket: this.bucket, Key: chave }));
    if (!Body) throw new Error("Objeto sem conteúdo.");
    return Body as Readable;
  }

  async tamanho(chave: string): Promise<number | null> {
    try {
      const r = await this.s3.send(new HeadObjectCommand({ Bucket: this.bucket, Key: chave }));
      return r.ContentLength ?? null;
    } catch (erro) {
      const nome = (erro as { name?: string }).name;
      if (nome === "NotFound" || nome === "NoSuchKey") return null;
      throw erro;
    }
  }

  async remover(chave: string): Promise<void> {
    await this.s3.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: chave }));
  }
}

function expira(): Date {
  return new Date(Date.now() + VALIDADE_S * 1000);
}

/** `Content-Disposition` com o nome em UTF-8 (RFC 5987) e um ASCII de reserva. */
export function disposicaoAnexo(nome: string): string {
  const ascii = nome.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(nome)}`;
}
