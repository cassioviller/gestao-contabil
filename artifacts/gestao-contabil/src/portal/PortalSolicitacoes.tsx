import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  criarArquivoPortal,
  getListarPortalSolicitacoesQueryKey,
  useListarPortalSolicitacoes,
  useResponderSolicitacaoPortal,
} from "@workspace/api-client-react";
import { formatarData } from "@/lib/formato";
import { mensagemDeErro } from "@/lib/erros";
import Consulta from "@/components/Consulta";

const ROTULO = {
  aberta: "Aguardando você",
  respondida: "Respondida",
  concluida: "Concluída",
} as const;

export default function PortalSolicitacoes() {
  const qc = useQueryClient();
  const { data: lista = [], isLoading, error, refetch } = useListarPortalSolicitacoes();
  const responder = useResponderSolicitacaoPortal();
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState<number | null>(null);
  const [respostas, setRespostas] = useState<Record<number, string>>({});

  function invalidar() {
    qc.invalidateQueries({ queryKey: getListarPortalSolicitacoesQueryKey() });
  }

  async function subir(id: number, lista: FileList | null) {
    if (!lista?.length) return;
    setErro(null);
    setOcupado(id);
    try {
      for (const arquivo of Array.from(lista)) {
        const {
          upload,
          urlConteudo,
          arquivo: registro,
        } = await criarArquivoPortal(id, {
          nome: arquivo.name,
          mime: arquivo.type || "application/octet-stream",
          tamanho: arquivo.size,
        });
        if (upload) {
          const r = await fetch(upload.url, {
            method: upload.metodo,
            headers: upload.cabecalhos ?? {},
            body: arquivo,
          });
          if (!r.ok) throw new Error(`O armazenamento recusou o arquivo (${r.status}).`);
          // Confirmação pelo próprio upload via API não existe no portal com URL
          // assinada: o registro é confirmado ao subir pela API local.
          await fetch(`/api/portal/arquivos/${registro.id}/conteudo`, {
            method: "PUT",
            body: arquivo,
            credentials: "same-origin",
          });
        } else {
          const r = await fetch(urlConteudo, {
            method: "PUT",
            headers: { "content-type": arquivo.type || "application/octet-stream" },
            body: arquivo,
            credentials: "same-origin",
          });
          if (!r.ok) throw new Error(`Falha ao enviar (${r.status}).`);
        }
      }
      invalidar();
    } catch (e) {
      setErro(mensagemDeErro(e, "Não foi possível enviar o arquivo."));
    } finally {
      setOcupado(null);
    }
  }

  async function enviarResposta(id: number) {
    const texto = (respostas[id] ?? "").trim();
    if (!texto) return;
    setErro(null);
    try {
      await responder.mutateAsync({ id, data: { resposta: texto } });
      setRespostas((r) => ({ ...r, [id]: "" }));
      invalidar();
    } catch (e) {
      setErro(mensagemDeErro(e));
    }
  }

  return (
    <div>
      <h1 className="mb-1 text-xl font-bold">Solicitações</h1>
      <p className="mb-4 text-sm text-neutral-500">
        Documentos e informações que o escritório pediu a você.
      </p>
      {erro && (
        <p
          role="alert"
          className="mb-3 rounded-lg bg-red-600/10 px-3 py-2 text-sm text-red-700 dark:text-red-400"
        >
          {erro}
        </p>
      )}
      <Consulta
        isLoading={isLoading}
        error={error}
        vazio={lista.length === 0}
        aoTentar={() => refetch()}
        mensagemVazio="Nenhuma solicitação pendente."
      >
        <ul className="space-y-3">
          {lista.map((s) => (
            <li
              key={s.id}
              className="rounded-xl border border-black/10 bg-white p-4 dark:border-white/10 dark:bg-neutral-950"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-medium">{s.descricao}</p>
                  <p className="text-xs text-neutral-500">
                    {s.prazo ? `prazo ${formatarData(s.prazo)} · ` : ""}
                    {ROTULO[s.status]}
                    {s.arquivos ? ` · ${s.arquivos} arquivo(s) enviado(s)` : ""}
                  </p>
                  {s.resposta && <p className="mt-1 text-sm">Sua resposta: {s.resposta}</p>}
                </div>
                {s.status !== "concluida" && (
                  <label className="cursor-pointer rounded-lg border border-black/15 px-3 py-1.5 text-sm dark:border-white/15">
                    {ocupado === s.id ? "Enviando…" : "📎 Enviar arquivo"}
                    <input
                      type="file"
                      multiple
                      className="hidden"
                      onChange={(e) => subir(s.id, e.target.files)}
                    />
                  </label>
                )}
              </div>
              {s.status !== "concluida" && (
                <div className="mt-3 flex gap-2">
                  <input
                    value={respostas[s.id] ?? ""}
                    onChange={(e) => setRespostas((r) => ({ ...r, [s.id]: e.target.value }))}
                    placeholder="Responder por texto (opcional)"
                    aria-label={`Resposta à solicitação ${s.id}`}
                    className="flex-1 rounded-lg border border-black/15 bg-transparent px-3 py-1.5 text-sm dark:border-white/15"
                  />
                  <button
                    type="button"
                    onClick={() => enviarResposta(s.id)}
                    disabled={!(respostas[s.id] ?? "").trim()}
                    className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm text-white disabled:opacity-50"
                  >
                    Responder
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      </Consulta>
    </div>
  );
}
