import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import {
  arquivos,
  checklistItens,
  clientes,
  db,
  pagamentos,
  processos,
  solicitacoes,
} from "@workspace/db";
import { HttpError } from "../lib/http";
import { armazenamento } from "./externos";

export const TAMANHO_MAXIMO = 20 * 1024 * 1024;

/** O que o escritório e o portal podem anexar: guias, comprovantes, planilhas. */
export const MIMES_PERMITIDOS = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
  "application/xml",
  "text/xml",
  "text/csv",
  "text/plain",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
  "application/zip",
]);

export type EntidadeArquivo =
  | "checklist_item"
  | "processo"
  | "pagamento"
  | "cliente"
  | "solicitacao";

export function validarArquivo(dados: { nome: string; mime: string; tamanho: number }): void {
  if (!MIMES_PERMITIDOS.has(dados.mime)) {
    throw new HttpError(
      400,
      `Tipo de arquivo não permitido: ${dados.mime}.`,
      undefined,
      "tipo_arquivo",
    );
  }
  if (dados.tamanho > TAMANHO_MAXIMO) {
    throw new HttpError(400, "Arquivo maior que 20 MB.", undefined, "arquivo_grande");
  }
  if (/[\\/\0]/.test(dados.nome)) {
    throw new HttpError(400, "Nome de arquivo inválido.");
  }
}

/**
 * Confere que a entidade é da conta e descobre o cliente dela — é o que
 * impede anexar um arquivo ao item de outro escritório.
 */
export async function clienteDaEntidade(
  contaId: number,
  entidade: EntidadeArquivo,
  entidadeId: number,
): Promise<number | null> {
  switch (entidade) {
    case "checklist_item": {
      const [r] = await db
        .select({ clienteId: checklistItens.clienteId })
        .from(checklistItens)
        .where(and(eq(checklistItens.id, entidadeId), eq(checklistItens.contaId, contaId)));
      if (!r) throw new HttpError(404, "Item do checklist não encontrado.");
      return r.clienteId;
    }
    case "processo": {
      const [r] = await db
        .select({ clienteId: processos.clienteId })
        .from(processos)
        .where(and(eq(processos.id, entidadeId), eq(processos.contaId, contaId)));
      if (!r) throw new HttpError(404, "Processo não encontrado.");
      return r.clienteId;
    }
    case "pagamento": {
      const [r] = await db
        .select({ clienteId: pagamentos.clienteId })
        .from(pagamentos)
        .where(and(eq(pagamentos.id, entidadeId), eq(pagamentos.contaId, contaId)));
      if (!r) throw new HttpError(404, "Pagamento não encontrado.");
      return r.clienteId;
    }
    case "cliente": {
      const [r] = await db
        .select({ id: clientes.id })
        .from(clientes)
        .where(and(eq(clientes.id, entidadeId), eq(clientes.contaId, contaId)));
      if (!r) throw new HttpError(404, "Cliente não encontrado.");
      return r.id;
    }
    case "solicitacao": {
      const [r] = await db
        .select({ clienteId: solicitacoes.clienteId })
        .from(solicitacoes)
        .where(and(eq(solicitacoes.id, entidadeId), eq(solicitacoes.contaId, contaId)));
      if (!r) throw new HttpError(404, "Solicitação não encontrada.");
      return r.clienteId;
    }
  }
}

export const projecaoArquivo = {
  id: arquivos.id,
  clienteId: arquivos.clienteId,
  entidade: arquivos.entidade,
  entidadeId: arquivos.entidadeId,
  nome: arquivos.nome,
  mime: arquivos.mime,
  tamanho: arquivos.tamanho,
  sha256: arquivos.sha256,
  origem: arquivos.origem,
  confirmado: arquivos.confirmado,
  criadoEm: arquivos.criadoEm,
};

export async function registrarArquivo(dados: {
  contaId: number;
  entidade: EntidadeArquivo;
  entidadeId: number;
  nome: string;
  mime: string;
  tamanho: number;
  enviadoPor: number | null;
  origem?: "escritorio" | "portal" | "robo";
}) {
  validarArquivo(dados);
  const clienteId = await clienteDaEntidade(dados.contaId, dados.entidade, dados.entidadeId);
  const chave = `conta/${dados.contaId}/${randomUUID()}`;
  const [arquivo] = await db
    .insert(arquivos)
    .values({
      contaId: dados.contaId,
      clienteId,
      entidade: dados.entidade,
      entidadeId: dados.entidadeId,
      nome: dados.nome,
      mime: dados.mime,
      tamanho: dados.tamanho,
      chave,
      origem: dados.origem ?? "escritorio",
      enviadoPor: dados.enviadoPor,
    })
    .returning(projecaoArquivo);
  const upload = await armazenamento.urlUpload(chave, dados.mime, dados.tamanho);
  return { arquivo, upload, urlConteudo: `/api/arquivos/${arquivo.id}/conteudo` };
}

export async function buscarArquivo(contaId: number, id: number) {
  const [a] = await db
    .select({ ...projecaoArquivo, chave: arquivos.chave })
    .from(arquivos)
    .where(and(eq(arquivos.id, id), eq(arquivos.contaId, contaId)));
  if (!a) throw new HttpError(404, "Arquivo não encontrado.");
  return a;
}

export async function urlDeDownload(contaId: number, id: number) {
  const a = await buscarArquivo(contaId, id);
  if (!a.confirmado) throw new HttpError(400, "O upload deste arquivo não foi concluído.");
  const assinada = await armazenamento.urlDownload(a.chave, a.nome, a.mime);
  return assinada
    ? { url: assinada.url, expiraEm: assinada.expiraEm }
    : { url: `/api/arquivos/${a.id}/conteudo`, expiraEm: null };
}

export async function removerArquivo(contaId: number, id: number): Promise<boolean> {
  const [a] = await db
    .delete(arquivos)
    .where(and(eq(arquivos.id, id), eq(arquivos.contaId, contaId)))
    .returning({ chave: arquivos.chave });
  if (!a) return false;
  await armazenamento.remover(a.chave);
  return true;
}
