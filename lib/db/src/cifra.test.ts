import { afterEach, describe, expect, test } from "vitest";
import { _limparChaveCache, cifrar, decifrar, estaCifrado, gerarToken, hashToken } from "./cifra";

describe("cifra", () => {
  afterEach(() => {
    delete process.env.CHAVE_CIFRA;
    _limparChaveCache();
  });

  test("ida e volta com a chave de desenvolvimento", () => {
    const c = cifrar("segredo-gov");
    expect(c).toMatch(/^v1\$/);
    expect(estaCifrado(c)).toBe(true);
    expect(decifrar(c)).toBe("segredo-gov");
  });

  test("cada cifra usa um IV diferente", () => {
    expect(cifrar("x")).not.toBe(cifrar("x"));
  });

  test("texto em claro (legado) é devolvido como está", () => {
    expect(decifrar("senha-antiga")).toBe("senha-antiga");
    expect(estaCifrado("senha-antiga")).toBe(false);
  });

  test("vazio e nulo viram null", () => {
    expect(cifrar("")).toBeNull();
    expect(cifrar(null)).toBeNull();
    expect(decifrar(null)).toBeNull();
  });

  test("já cifrado não é cifrado de novo", () => {
    const c = cifrar("a")!;
    expect(cifrar(c)).toBe(c);
  });

  test("chave errada não decifra (tag de autenticação)", () => {
    process.env.CHAVE_CIFRA = "a".repeat(64);
    _limparChaveCache();
    const c = cifrar("x")!;
    process.env.CHAVE_CIFRA = "b".repeat(64);
    _limparChaveCache();
    expect(() => decifrar(c)).toThrow();
  });

  test("aceita chave em hex, base64url de 32 bytes e texto livre", () => {
    for (const chave of ["c".repeat(64), Buffer.alloc(32, 7).toString("base64url"), "frase humana"]) {
      process.env.CHAVE_CIFRA = chave;
      _limparChaveCache();
      expect(decifrar(cifrar("ok"))).toBe("ok");
    }
  });

  test("hashToken é determinístico e gerarToken tem 256 bits", () => {
    expect(hashToken("abc")).toBe(hashToken("abc"));
    expect(hashToken("abc")).toHaveLength(64);
    expect(Buffer.from(gerarToken(), "base64url")).toHaveLength(32);
    expect(gerarToken()).not.toBe(gerarToken());
  });
});
