import { createHash } from "node:crypto";
import express, { Router } from "express";
import { and, asc, eq } from "drizzle-orm";
import { arquivos, db } from "@workspace/db";
import {
  BaixarConteudoArquivoParams,
  ConfirmarArquivoParams,
  CriarArquivoBody,
  EnviarConteudoArquivoParams,
  GetUrlDownloadArquivoParams,
  ListarArquivosQueryParams,
  RemoverArquivoParams,
} from "@workspace/api-zod";
import { HttpError } from "../lib/http";
import { auditar } from "../lib/auditoria";
import { contaDaRequisicao, sessaoDaRequisicao } from "../middlewares/autenticacao";
import { armazenamento } from "../servicos/externos";
import { disposicaoAnexo } from "../servicos/externos/armazenamento-r2";
import {
  TAMANHO_MAXIMO,
  buscarArquivo,
  projecaoArquivo,
  registrarArquivo,
  removerArquivo,
  urlDeDownload,
} from "../servicos/arquivos";

const router = Router();

// GET /api/arquivos?entidade=&entidadeId=
router.get("/", async (req, res) => {
  const contaId = contaDaRequisicao(req);
  const { entidade, entidadeId } = ListarArquivosQueryParams.parse(req.query);
  const lista = await db
    .select(projecaoArquivo)
    .from(arquivos)
    .where(
      and(
        eq(arquivos.contaId, contaId),
        eq(arquivos.entidade, entidade),
        eq(arquivos.entidadeId, entidadeId),
        eq(arquivos.confirmado, true),
      ),
    )
    .orderBy(asc(arquivos.criadoEm));
  res.json(lista);
});

// POST /api/arquivos — registra e diz para onde subir o conteúdo.
router.post("/", async (req, res) => {
  const contaId = contaDaRequisicao(req);
  const sessao = sessaoDaRequisicao(req);
  const dados = CriarArquivoBody.parse(req.body);
  const criado = await registrarArquivo({ ...dados, contaId, enviadoPor: sessao.usuarioId });
  res.json(criado);
});

// PUT /api/arquivos/:id/conteudo — upload pela API (armazenamento local, ou
// quando o navegador não consegue usar a URL assinada).
router.put(
  "/:id/conteudo",
  express.raw({ type: () => true, limit: TAMANHO_MAXIMO }),
  async (req, res) => {
    const contaId = contaDaRequisicao(req);
    const { id } = EnviarConteudoArquivoParams.parse(req.params);
    const a = await buscarArquivo(contaId, id);
    const corpo = req.body as unknown;
    if (!Buffer.isBuffer(corpo) || corpo.length === 0) {
      throw new HttpError(400, "Envie o conteúdo do arquivo no corpo da requisição.");
    }
    if (corpo.length > TAMANHO_MAXIMO) throw new HttpError(413, "Arquivo maior que 20 MB.");

    await armazenamento.gravar(a.chave, corpo, a.mime);
    const sha256 = createHash("sha256").update(corpo).digest("hex");
    const [atualizado] = await db
      .update(arquivos)
      .set({ tamanho: corpo.length, sha256, confirmado: true })
      .where(eq(arquivos.id, id))
      .returning(projecaoArquivo);
    await auditar(req, { acao: "anexar_arquivo", entidade: a.entidade, entidadeId: a.entidadeId, para: a.nome });
    res.json(atualizado);
  },
);

// POST /api/arquivos/:id/confirmar — depois do upload direto (URL assinada).
router.post("/:id/confirmar", async (req, res) => {
  const contaId = contaDaRequisicao(req);
  const { id } = ConfirmarArquivoParams.parse(req.params);
  const a = await buscarArquivo(contaId, id);
  const tamanho = await armazenamento.tamanho(a.chave);
  if (tamanho === null) {
    throw new HttpError(400, "O conteúdo ainda não chegou ao armazenamento.", undefined, "upload_incompleto");
  }
  const [atualizado] = await db
    .update(arquivos)
    .set({ tamanho, confirmado: true })
    .where(eq(arquivos.id, id))
    .returning(projecaoArquivo);
  await auditar(req, { acao: "anexar_arquivo", entidade: a.entidade, entidadeId: a.entidadeId, para: a.nome });
  res.json(atualizado);
});

// GET /api/arquivos/:id/download-url
router.get("/:id/download-url", async (req, res) => {
  const contaId = contaDaRequisicao(req);
  const { id } = GetUrlDownloadArquivoParams.parse(req.params);
  res.json(await urlDeDownload(contaId, id));
});

// GET /api/arquivos/:id/conteudo — download pela API, sempre como anexo.
router.get("/:id/conteudo", async (req, res) => {
  const contaId = contaDaRequisicao(req);
  const { id } = BaixarConteudoArquivoParams.parse(req.params);
  const a = await buscarArquivo(contaId, id);
  if (!a.confirmado) throw new HttpError(404, "Arquivo sem conteúdo.");
  const fluxo = await armazenamento.abrir(a.chave);
  res.setHeader("content-type", a.mime);
  res.setHeader("content-length", String(a.tamanho));
  res.setHeader("content-disposition", disposicaoAnexo(a.nome));
  res.setHeader("x-content-type-options", "nosniff");
  res.setHeader("cache-control", "private, no-store");
  fluxo.on("error", (err) => {
    req.log?.error({ err }, "falha ao ler o arquivo");
    if (!res.headersSent) res.status(500).end();
    else res.destroy(err);
  });
  fluxo.pipe(res);
});

// DELETE /api/arquivos/:id
router.delete("/:id", async (req, res) => {
  const contaId = contaDaRequisicao(req);
  const { id } = RemoverArquivoParams.parse(req.params);
  const a = await buscarArquivo(contaId, id);
  if (await removerArquivo(contaId, id)) {
    await auditar(req, { acao: "remover_arquivo", entidade: a.entidade, entidadeId: a.entidadeId, de: a.nome });
  }
  res.status(204).send();
});

export default router;
