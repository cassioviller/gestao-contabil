import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

/**
 * Cifra em repouso dos segredos que o escritório guarda de terceiros (senhas
 * gov.br e NFS-e dos clientes, credenciais por sistema, tokens de provedores).
 *
 * AES-256-GCM com IV aleatório de 12 bytes. Formato gravado:
 * `v1$<iv>$<tag>$<dados>`, tudo em base64url. O `v1` permite trocar de
 * algoritmo ou de chave no futuro sem adivinhar o formato de cada linha.
 *
 * A chave vem de `CHAVE_CIFRA` (32 bytes em base64url ou hex). Sem ela, em
 * produção o processo não sobe; fora de produção usa uma chave fixa de
 * desenvolvimento e avisa no log.
 */

const PREFIXO = "v1";
const CHAVE_DEV = "chave-de-desenvolvimento-nao-use-em-producao";

let chaveCache: Buffer | null = null;

function carregarChave(): Buffer {
  if (chaveCache) return chaveCache;
  const bruta = process.env.CHAVE_CIFRA?.trim();
  if (!bruta) {
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "CHAVE_CIFRA não definida. Gere 32 bytes (base64url) e guarde como secret; " +
          "sem ela as senhas cifradas não podem ser lidas.",
      );
    }
    console.warn("[cifra] CHAVE_CIFRA ausente: usando a chave de desenvolvimento.");
    chaveCache = createHash("sha256").update(CHAVE_DEV).digest();
    return chaveCache;
  }
  // Aceita base64url/base64 de 32 bytes, hex de 64 caracteres, ou qualquer
  // texto (derivado por SHA-256, para não recusar uma chave "humana").
  let chave: Buffer | null = null;
  if (/^[0-9a-fA-F]{64}$/.test(bruta)) chave = Buffer.from(bruta, "hex");
  else {
    const b64 = Buffer.from(bruta, "base64url");
    if (b64.length === 32) chave = b64;
  }
  chaveCache = chave ?? createHash("sha256").update(bruta).digest();
  return chaveCache;
}

/** `true` quando o texto já está no formato cifrado. */
export function estaCifrado(texto: string | null | undefined): boolean {
  return typeof texto === "string" && texto.startsWith(`${PREFIXO}$`);
}

/** Cifra um segredo. `null`/vazio passa direto (não há o que proteger). */
export function cifrar(texto: string | null | undefined): string | null {
  if (texto === null || texto === undefined || texto === "") return null;
  if (estaCifrado(texto)) return texto;
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", carregarChave(), iv);
  const dados = Buffer.concat([cipher.update(texto, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [PREFIXO, b64(iv), b64(tag), b64(dados)].join("$");
}

/**
 * Decifra. Texto sem o prefixo é devolvido como está: é o valor gravado antes
 * da cifra existir (o script `cifrar-segredos` converte esses).
 */
export function decifrar(texto: string | null | undefined): string | null {
  if (texto === null || texto === undefined || texto === "") return null;
  if (!estaCifrado(texto)) return texto;
  const [, iv, tag, dados] = texto.split("$");
  if (!iv || !tag || !dados) throw new Error("Segredo cifrado em formato inválido.");
  const decipher = createDecipheriv("aes-256-gcm", carregarChave(), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(dados, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

/** SHA-256 em hex — para guardar tokens de sessão e de acesso sem o valor em claro. */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Token aleatório de 32 bytes em base64url (256 bits). */
export function gerarToken(): string {
  return randomBytes(32).toString("base64url");
}

function b64(buf: Buffer): string {
  return buf.toString("base64url");
}

/** Para testes: esquece a chave carregada. */
export function _limparChaveCache(): void {
  chaveCache = null;
}
