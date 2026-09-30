import { randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCb) as (
  senha: string | Buffer,
  sal: string | Buffer,
  tamanho: number,
  opcoes: { N: number; r: number; p: number; maxmem: number },
) => Promise<Buffer>;

// Parâmetros gravados dentro do hash, não fixos no código: assim dá para
// endurecê-los depois sem invalidar as senhas já cadastradas.
const N = 16384;
const R = 8;
const P = 1;
const TAMANHO = 32;
// scrypt precisa de ~128 * N * r bytes; o default do Node (32 MB) não cobre
// N=16384 e o hash falharia com "memory limit exceeded".
const MAXMEM = 64 * 1024 * 1024;

/**
 * Gera o hash de uma senha no formato `scrypt$N$r$p$sal$hash` (partes em
 * base64). scrypt vem do próprio Node — nada de dependência extra.
 */
export async function gerarHashSenha(senha: string): Promise<string> {
  const sal = randomBytes(16);
  const hash = await scrypt(senha.normalize("NFKC"), sal, TAMANHO, {
    N,
    r: R,
    p: P,
    maxmem: MAXMEM,
  });
  return [
    "scrypt",
    N,
    R,
    P,
    sal.toString("base64"),
    hash.toString("base64"),
  ].join("$");
}

/**
 * Confere a senha contra o hash. Devolve `false` — nunca lança — para hash
 * malformado, para que uma linha corrompida no banco vire "senha inválida" em
 * vez de erro 500 na tela de login.
 */
export async function conferirSenha(
  senha: string,
  hashArmazenado: string,
): Promise<boolean> {
  const partes = hashArmazenado.split("$");
  if (partes.length !== 6 || partes[0] !== "scrypt") return false;

  const [, nTexto, rTexto, pTexto, salBase64, hashBase64] = partes;
  const n = Number(nTexto);
  const r = Number(rTexto);
  const p = Number(pTexto);
  if (!Number.isInteger(n) || !Number.isInteger(r) || !Number.isInteger(p)) {
    return false;
  }

  const esperado = Buffer.from(hashBase64, "base64");
  if (esperado.length === 0) return false;

  try {
    const calculado = await scrypt(
      senha.normalize("NFKC"),
      Buffer.from(salBase64, "base64"),
      esperado.length,
      { N: n, r, p, maxmem: MAXMEM },
    );
    return timingSafeEqual(calculado, esperado);
  } catch {
    return false;
  }
}
