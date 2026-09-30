import { Router } from "express";
import { eq } from "drizzle-orm";
import { arquivos, db, hashToken, protocolos } from "@workspace/db";
import { HttpError } from "../lib/http";
import { armazenamento } from "../servicos/externos";
import { disposicaoAnexo } from "../servicos/externos/armazenamento-r2";

const router = Router();

/**
 * Link público da guia: `URL_PUBLICA/api/protocolo/<token>`. Sem sessão — quem
 * tem o token é o cliente que recebeu o aviso. O banco guarda só o hash, e o
 * token tem 256 bits: não dá para adivinhar nem para ler de um dump.
 */
router.get("/:token", async (req, res) => {
  const token = String(req.params.token ?? "");
  if (!/^[A-Za-z0-9_-]{20,100}$/.test(token)) throw new HttpError(404, "Protocolo inválido.");

  const [p] = await db
    .select({
      id: protocolos.id,
      expiraEm: protocolos.expiraEm,
      visualizadoEm: protocolos.visualizadoEm,
      chave: arquivos.chave,
      nome: arquivos.nome,
      mime: arquivos.mime,
      tamanho: arquivos.tamanho,
      confirmado: arquivos.confirmado,
    })
    .from(protocolos)
    .leftJoin(arquivos, eq(arquivos.id, protocolos.arquivoId))
    .where(eq(protocolos.token, hashToken(token)));
  if (!p) throw new HttpError(404, "Protocolo inválido.");
  if (p.expiraEm < new Date()) {
    throw new HttpError(
      410,
      "Este link expirou. Peça um novo envio ao escritório.",
      undefined,
      "expirado",
    );
  }
  if (!p.chave || !p.confirmado || !p.nome || !p.mime) {
    throw new HttpError(404, "O arquivo deste protocolo não está mais disponível.");
  }

  // A primeira abertura é o que vale como "visualizado"; as seguintes não
  // sobrescrevem a data.
  if (!p.visualizadoEm) {
    await db
      .update(protocolos)
      .set({ visualizadoEm: new Date(), ipVisualizacao: req.ip ?? null })
      .where(eq(protocolos.id, p.id));
  }

  const assinada = await armazenamento.urlDownload(p.chave, p.nome, p.mime);
  if (assinada) {
    res.redirect(302, assinada.url);
    return;
  }
  const fluxo = await armazenamento.abrir(p.chave);
  res.setHeader("content-type", p.mime);
  res.setHeader("content-length", String(p.tamanho ?? 0));
  res.setHeader("content-disposition", disposicaoAnexo(p.nome));
  res.setHeader("x-content-type-options", "nosniff");
  res.setHeader("cache-control", "private, no-store");
  fluxo.on("error", (err) => {
    req.log?.error({ err }, "falha ao ler o arquivo do protocolo");
    if (!res.headersSent) res.status(500).end();
    else res.destroy(err);
  });
  fluxo.pipe(res);
});

export default router;
