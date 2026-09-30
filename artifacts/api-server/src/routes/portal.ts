import express, { Router } from "express";
import { createHash } from "node:crypto";
import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { rateLimit, ipKeyGenerator } from "express-rate-limit";
import {
  arquivos,
  checklistItens,
  clientes,
  competencias,
  contas,
  db,
  gerarToken,
  hashToken,
  pagamentos,
  processos,
  protocolos,
  solicitacoes,
  tiposObrigacao,
  tokensAcesso,
} from "@workspace/db";
import { hojeBR } from "@workspace/dominio";
import {
  BaixarConteudoPortalParams,
  CriarArquivoPortalBody,
  CriarArquivoPortalParams,
  CriarPortalPedidoBody,
  DarCientePortalParams,
  EnviarConteudoPortalParams,
  GetUrlDownloadPortalParams,
  PortalAcessoParams,
  PortalEntrarBody,
  ResponderSolicitacaoPortalBody,
  ResponderSolicitacaoPortalParams,
} from "@workspace/api-zod";
import { HttpError } from "../lib/http";
import { registrarAuditoria } from "../lib/auditoria";
import {
  COOKIE_PORTAL,
  clienteDaRequisicao,
  criarSessaoCliente,
  encerrarSessaoCliente,
  exigirSessaoCliente,
  opcoesCookiePortal,
} from "../middlewares/portal";
import { armazenamento } from "../servicos/externos";
import { disposicaoAnexo } from "../servicos/externos/armazenamento-r2";
import { TAMANHO_MAXIMO, projecaoArquivo, registrarArquivo } from "../servicos/arquivos";
import { criarAviso } from "../servicos/avisos";

const router = Router();

const VALIDADE_LINK_MIN = 30;

function urlPublica(): string {
  return (process.env.URL_PUBLICA ?? "http://localhost:5173").replace(/\/+$/, "");
}

const limitePorIp = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  keyGenerator: (req) => ipKeyGenerator(req.ip ?? ""),
  handler: (_req, _res, next) => {
    next(new HttpError(429, "Muitos pedidos de acesso. Aguarde alguns minutos."));
  },
});

/**
 * Gera um link de acesso de 30 minutos para um cliente. Usado pelo portal
 * (a pedido do cliente, por e-mail) e pelo escritório (para entregar à mão).
 */
export async function gerarLinkDeAcesso(
  contaId: number,
  clienteId: number,
): Promise<{ link: string; expiraEm: Date }> {
  const token = gerarToken();
  const expiraEm = new Date(Date.now() + VALIDADE_LINK_MIN * 60 * 1000);
  await db.insert(tokensAcesso).values({
    contaId,
    finalidade: "portal",
    clienteId,
    token: hashToken(token),
    expiraEm,
  });
  return { link: `${urlPublica()}/api/portal/acesso/${token}`, expiraEm };
}

// POST /api/portal/entrar — sempre 204: não se revela quem tem cadastro.
router.post("/entrar", limitePorIp, async (req, res) => {
  const { email } = PortalEntrarBody.parse(req.body);
  const alvo = email.trim().toLowerCase();
  const encontrados = await db
    .select({
      id: clientes.id,
      contaId: clientes.contaId,
      razaoSocial: clientes.razaoSocial,
      escritorio: contas.nome,
    })
    .from(clientes)
    .innerJoin(contas, eq(contas.id, clientes.contaId))
    .where(
      and(
        sql`lower(trim(${clientes.email})) = ${alvo}`,
        eq(clientes.ativo, true),
        eq(contas.ativo, true),
      ),
    )
    .limit(5);

  for (const c of encontrados) {
    const { link } = await gerarLinkDeAcesso(c.contaId, c.id);
    await criarAviso(db, {
      contaId: c.contaId,
      clienteId: c.id,
      canal: "email",
      destino: alvo,
      modelo: "link_portal",
      assunto: `Seu acesso ao portal de ${c.escritorio}`,
      corpo:
        `Olá, ${c.razaoSocial}.\n\n` +
        `Este é o seu link de acesso ao portal de ${c.escritorio}, válido por ${VALIDADE_LINK_MIN} minutos:\n${link}\n\n` +
        "Se não foi você que pediu, ignore esta mensagem.",
    });
  }
  req.log?.info({ encontrados: encontrados.length }, "pedido de acesso ao portal");
  res.status(204).send();
});

// GET /api/portal/acesso/:token — abre a sessão e leva ao portal.
router.get("/acesso/:token", async (req, res) => {
  const { token } = PortalAcessoParams.parse(req.params);
  if (!/^[A-Za-z0-9_-]{20,100}$/.test(token)) throw new HttpError(404, "Link inválido.");
  const [t] = await db
    .select({
      id: tokensAcesso.id,
      contaId: tokensAcesso.contaId,
      clienteId: tokensAcesso.clienteId,
      expiraEm: tokensAcesso.expiraEm,
      usadoEm: tokensAcesso.usadoEm,
    })
    .from(tokensAcesso)
    .where(and(eq(tokensAcesso.token, hashToken(token)), eq(tokensAcesso.finalidade, "portal")));
  if (!t || !t.clienteId) throw new HttpError(404, "Link inválido.");
  if (t.usadoEm || t.expiraEm < new Date()) {
    throw new HttpError(
      410,
      "Este link já foi usado ou expirou. Peça um novo.",
      undefined,
      "expirado",
    );
  }
  const [c] = await db
    .select({ email: clientes.email })
    .from(clientes)
    .where(and(eq(clientes.id, t.clienteId), eq(clientes.ativo, true)));
  if (!c) throw new HttpError(404, "Cliente não encontrado.");

  await db.update(tokensAcesso).set({ usadoEm: new Date() }).where(eq(tokensAcesso.id, t.id));
  const sessao = await criarSessaoCliente(
    t.contaId,
    t.clienteId,
    c.email?.trim().toLowerCase() ?? "",
  );
  await registrarAuditoria({
    contaId: t.contaId,
    ator: "portal",
    acao: "entrar_portal",
    entidade: "cliente",
    entidadeId: t.clienteId,
    ip: req.ip ?? null,
  });
  res.cookie(COOKIE_PORTAL, sessao, opcoesCookiePortal());
  res.redirect(302, `${urlPublica()}/portal`);
});

// Daqui para baixo, só com sessão de cliente.
router.use(exigirSessaoCliente);

// GET /api/portal/eu
router.get("/eu", (req, res) => {
  const c = clienteDaRequisicao(req);
  res.json({
    clienteId: c.clienteId,
    razaoSocial: c.razaoSocial,
    escritorio: c.escritorio,
    email: c.email,
    cnpj: c.cnpj,
  });
});

// POST /api/portal/sair
router.post("/sair", async (req, res) => {
  await encerrarSessaoCliente(req.cookies?.[COOKIE_PORTAL]);
  res.clearCookie(COOKIE_PORTAL, { ...opcoesCookiePortal(), maxAge: undefined });
  res.status(204).send();
});

const camposGuia = {
  id: checklistItens.id,
  obrigacao: tiposObrigacao.nome,
  ano: competencias.ano,
  mes: competencias.mes,
  vencimento: checklistItens.vencimento,
  status: checklistItens.status,
  enviadoEm: checklistItens.enviadoEm,
  cienteEm: sql<Date | null>`(select max(p.ciente_em) from protocolos p where p.checklist_item_id = checklist_itens.id)`,
};

async function guiasDoCliente(clienteId: number, contaId: number, apenasId?: number) {
  const itens = await db
    .select(camposGuia)
    .from(checklistItens)
    .innerJoin(tiposObrigacao, eq(tiposObrigacao.id, checklistItens.tipoObrigacaoId))
    .innerJoin(competencias, eq(competencias.id, checklistItens.competenciaId))
    .where(
      and(
        eq(checklistItens.clienteId, clienteId),
        eq(checklistItens.contaId, contaId),
        inArray(checklistItens.status, ["emitido", "enviado"]),
        apenasId ? eq(checklistItens.id, apenasId) : undefined,
        sql`exists (select 1 from arquivos a where a.entidade = 'checklist_item' and a.entidade_id = checklist_itens.id and a.confirmado)`,
      ),
    )
    .orderBy(desc(competencias.ano), desc(competencias.mes), asc(tiposObrigacao.ordem));
  if (!itens.length) return [];
  const anexos = await db
    .select({
      id: arquivos.id,
      nome: arquivos.nome,
      tamanho: arquivos.tamanho,
      entidadeId: arquivos.entidadeId,
    })
    .from(arquivos)
    .where(
      and(
        eq(arquivos.contaId, contaId),
        eq(arquivos.entidade, "checklist_item"),
        eq(arquivos.confirmado, true),
        inArray(
          arquivos.entidadeId,
          itens.map((i) => i.id),
        ),
      ),
    )
    .orderBy(asc(arquivos.id));
  return itens.map((i) => ({
    ...i,
    arquivos: anexos
      .filter((a) => a.entidadeId === i.id)
      .map(({ id, nome, tamanho }) => ({ id, nome, tamanho })),
  }));
}

// GET /api/portal/guias
router.get("/guias", async (req, res) => {
  const c = clienteDaRequisicao(req);
  res.json(await guiasDoCliente(c.clienteId, c.contaId));
});

// POST /api/portal/guias/:id/ciente — o cliente confirma o recebimento.
router.post("/guias/:id/ciente", async (req, res) => {
  const c = clienteDaRequisicao(req);
  const { id } = DarCientePortalParams.parse(req.params);
  const [guia] = await guiasDoCliente(c.clienteId, c.contaId, id);
  if (!guia) throw new HttpError(404, "Guia não encontrada.");

  if (!guia.cienteEm) {
    const ultimo = guia.arquivos[guia.arquivos.length - 1];
    const agora = new Date();
    await db.transaction(async (tx) => {
      await tx.insert(protocolos).values({
        contaId: c.contaId,
        clienteId: c.clienteId,
        checklistItemId: id,
        arquivoId: ultimo?.id ?? null,
        canal: "portal",
        token: hashToken(gerarToken()),
        expiraEm: new Date(agora.getTime() + 7 * 24 * 60 * 60 * 1000),
        enviadoPor: null,
        visualizadoEm: agora,
        ipVisualizacao: req.ip ?? null,
        cienteEm: agora,
      });
      if (guia.status === "emitido") {
        await tx
          .update(checklistItens)
          .set({ status: "enviado", enviadoEm: agora, atualizadoEm: agora })
          .where(eq(checklistItens.id, id));
      }
      await registrarAuditoria(
        {
          contaId: c.contaId,
          ator: "portal",
          acao: "ciente_guia",
          entidade: "checklist_item",
          entidadeId: id,
          ip: req.ip ?? null,
        },
        tx,
      );
    });
  }
  const [atualizada] = await guiasDoCliente(c.clienteId, c.contaId, id);
  res.json(atualizada);
});

async function arquivoDoCliente(req: express.Request, id: number) {
  const c = clienteDaRequisicao(req);
  const [a] = await db
    .select({ ...projecaoArquivo, chave: arquivos.chave })
    .from(arquivos)
    .where(
      and(
        eq(arquivos.id, id),
        eq(arquivos.contaId, c.contaId),
        eq(arquivos.clienteId, c.clienteId),
      ),
    );
  if (!a) throw new HttpError(404, "Arquivo não encontrado.");
  return a;
}

// GET /api/portal/arquivos/:id/download-url
router.get("/arquivos/:id/download-url", async (req, res) => {
  const { id } = GetUrlDownloadPortalParams.parse(req.params);
  const a = await arquivoDoCliente(req, id);
  if (!a.confirmado) throw new HttpError(404, "Arquivo sem conteúdo.");
  const assinada = await armazenamento.urlDownload(a.chave, a.nome, a.mime);
  res.json(
    assinada
      ? { url: assinada.url, expiraEm: assinada.expiraEm }
      : { url: `/api/portal/arquivos/${a.id}/conteudo`, expiraEm: null },
  );
});

// GET /api/portal/arquivos/:id/conteudo
router.get("/arquivos/:id/conteudo", async (req, res) => {
  const { id } = BaixarConteudoPortalParams.parse(req.params);
  const a = await arquivoDoCliente(req, id);
  if (!a.confirmado) throw new HttpError(404, "Arquivo sem conteúdo.");
  const fluxo = await armazenamento.abrir(a.chave);
  res.setHeader("content-type", a.mime);
  res.setHeader("content-length", String(a.tamanho));
  res.setHeader("content-disposition", disposicaoAnexo(a.nome));
  res.setHeader("x-content-type-options", "nosniff");
  res.setHeader("cache-control", "private, no-store");
  fluxo.on("error", (err) => {
    req.log?.error({ err }, "falha ao ler o arquivo do portal");
    if (!res.headersSent) res.status(500).end();
    else res.destroy(err);
  });
  fluxo.pipe(res);
});

// PUT /api/portal/arquivos/:id/conteudo — upload do cliente (armazenamento local).
router.put(
  "/arquivos/:id/conteudo",
  express.raw({ type: () => true, limit: TAMANHO_MAXIMO }),
  async (req, res) => {
    const { id } = EnviarConteudoPortalParams.parse(req.params);
    const a = await arquivoDoCliente(req, id);
    if (a.origem !== "portal")
      throw new HttpError(403, "Só arquivos enviados pelo portal podem ser sobrescritos aqui.");
    const corpo = req.body as unknown;
    if (!Buffer.isBuffer(corpo) || corpo.length === 0)
      throw new HttpError(400, "Envie o conteúdo do arquivo no corpo da requisição.");
    await armazenamento.gravar(a.chave, corpo, a.mime);
    const sha256 = createHash("sha256").update(corpo).digest("hex");
    const [atualizado] = await db
      .update(arquivos)
      .set({ tamanho: corpo.length, sha256, confirmado: true })
      .where(eq(arquivos.id, id))
      .returning(projecaoArquivo);
    if (a.entidade === "solicitacao") {
      await db
        .update(solicitacoes)
        .set({ status: "respondida", respondidaEm: new Date() })
        .where(and(eq(solicitacoes.id, a.entidadeId), eq(solicitacoes.status, "aberta")));
    }
    res.json(atualizado);
  },
);

// GET /api/portal/honorarios
router.get("/honorarios", async (req, res) => {
  const c = clienteDaRequisicao(req);
  const lista = await db
    .select({
      id: pagamentos.id,
      ano: competencias.ano,
      mes: competencias.mes,
      valor: pagamentos.valor,
      vencimento: pagamentos.vencimento,
      status: pagamentos.status,
      dataPagamento: pagamentos.dataPagamento,
      linkPagamento: pagamentos.linkPagamento,
      qrPix: pagamentos.qrPix,
    })
    .from(pagamentos)
    .innerJoin(competencias, eq(competencias.id, pagamentos.competenciaId))
    .where(
      and(
        eq(pagamentos.clienteId, c.clienteId),
        eq(pagamentos.contaId, c.contaId),
        isNull(competencias.rotulo),
      ),
    )
    .orderBy(desc(competencias.ano), desc(competencias.mes))
    .limit(12);
  res.json(lista);
});

export const camposSolicitacao = {
  id: solicitacoes.id,
  clienteId: solicitacoes.clienteId,
  clienteNome: clientes.razaoSocial,
  tipo: solicitacoes.tipo,
  descricao: solicitacoes.descricao,
  prazo: solicitacoes.prazo,
  status: solicitacoes.status,
  origem: solicitacoes.origem,
  resposta: solicitacoes.resposta,
  respondidaEm: solicitacoes.respondidaEm,
  arquivos: sql<number>`(select count(*) from arquivos a where a.entidade = 'solicitacao' and a.entidade_id = solicitacoes.id and a.confirmado)::int`,
  criadoEm: solicitacoes.criadoEm,
};

// GET /api/portal/solicitacoes
router.get("/solicitacoes", async (req, res) => {
  const c = clienteDaRequisicao(req);
  const lista = await db
    .select(camposSolicitacao)
    .from(solicitacoes)
    .innerJoin(clientes, eq(clientes.id, solicitacoes.clienteId))
    .where(and(eq(solicitacoes.clienteId, c.clienteId), eq(solicitacoes.contaId, c.contaId)))
    .orderBy(desc(solicitacoes.id));
  res.json(lista);
});

async function solicitacaoDoCliente(req: express.Request, id: number) {
  const c = clienteDaRequisicao(req);
  const [s] = await db
    .select(camposSolicitacao)
    .from(solicitacoes)
    .innerJoin(clientes, eq(clientes.id, solicitacoes.clienteId))
    .where(
      and(
        eq(solicitacoes.id, id),
        eq(solicitacoes.clienteId, c.clienteId),
        eq(solicitacoes.contaId, c.contaId),
      ),
    );
  if (!s) throw new HttpError(404, "Solicitação não encontrada.");
  return s;
}

// POST /api/portal/solicitacoes/:id/arquivos
router.post("/solicitacoes/:id/arquivos", async (req, res) => {
  const c = clienteDaRequisicao(req);
  const { id } = CriarArquivoPortalParams.parse(req.params);
  const dados = CriarArquivoPortalBody.parse(req.body);
  await solicitacaoDoCliente(req, id);
  const criado = await registrarArquivo({
    ...dados,
    contaId: c.contaId,
    entidade: "solicitacao",
    entidadeId: id,
    enviadoPor: null,
    origem: "portal",
  });
  res.json({ ...criado, urlConteudo: `/api/portal/arquivos/${criado.arquivo.id}/conteudo` });
});

// POST /api/portal/solicitacoes/:id/responder
router.post("/solicitacoes/:id/responder", async (req, res) => {
  const c = clienteDaRequisicao(req);
  const { id } = ResponderSolicitacaoPortalParams.parse(req.params);
  const { resposta } = ResponderSolicitacaoPortalBody.parse(req.body);
  await solicitacaoDoCliente(req, id);
  await db
    .update(solicitacoes)
    .set({ resposta: resposta.trim(), status: "respondida", respondidaEm: new Date() })
    .where(eq(solicitacoes.id, id));
  await registrarAuditoria({
    contaId: c.contaId,
    ator: "portal",
    acao: "responder_solicitacao",
    entidade: "solicitacao",
    entidadeId: id,
    ip: req.ip ?? null,
  });
  res.json(await solicitacaoDoCliente(req, id));
});

const camposPedido = {
  id: processos.id,
  clienteId: processos.clienteId,
  clienteNome: clientes.razaoSocial,
  categoria: processos.categoria,
  tipo: processos.tipo,
  titulo: processos.titulo,
  status: processos.status,
  orgao: processos.orgao,
  protocolo: processos.protocolo,
  abertoEm: processos.abertoEm,
  prazo: processos.prazo,
  concluidoEm: processos.concluidoEm,
  observacao: processos.observacao,
  origem: processos.origem,
  totalEtapas: sql<number>`(select count(*)::int from processo_etapas e where e.processo_id = processos.id)`,
  etapasFeitas: sql<number>`(select count(*)::int from processo_etapas e where e.processo_id = processos.id and e.feito)`,
};

// GET /api/portal/pedidos
router.get("/pedidos", async (req, res) => {
  const c = clienteDaRequisicao(req);
  const lista = await db
    .select(camposPedido)
    .from(processos)
    .innerJoin(clientes, eq(clientes.id, processos.clienteId))
    .where(
      and(
        eq(processos.clienteId, c.clienteId),
        eq(processos.contaId, c.contaId),
        eq(processos.categoria, "pedido"),
      ),
    )
    .orderBy(desc(processos.id));
  res.json(lista);
});

// POST /api/portal/pedidos
router.post("/pedidos", async (req, res) => {
  const c = clienteDaRequisicao(req);
  const { tipo, observacao } = CriarPortalPedidoBody.parse(req.body);
  const [novo] = await db
    .insert(processos)
    .values({
      contaId: c.contaId,
      clienteId: c.clienteId,
      categoria: "pedido",
      tipo: tipo.trim(),
      observacao: observacao?.trim() || null,
      origem: "portal",
      abertoEm: hojeBR(),
    })
    .returning({ id: processos.id });
  await registrarAuditoria({
    contaId: c.contaId,
    ator: "portal",
    acao: "abrir_pedido",
    entidade: "processo",
    entidadeId: novo.id,
    ip: req.ip ?? null,
  });
  const [pedido] = await db
    .select(camposPedido)
    .from(processos)
    .innerJoin(clientes, eq(clientes.id, processos.clienteId))
    .where(eq(processos.id, novo.id));
  res.json(pedido);
});

export default router;
