import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  confirmarArquivo,
  criarArquivo,
  enviarGuia,
  getListarArquivosQueryKey,
  getListarProtocolosItemQueryKey,
  getUrlDownloadArquivo,
  removerArquivo,
  useListarArquivos,
  useListarProtocolosItem,
} from "@workspace/api-client-react";
import { formatarData } from "@/lib/formato";
import { mensagemDeErro } from "@/lib/erros";

type Item = {
  id: number;
  status: "pendente" | "emitido" | "enviado" | "nao_aplica";
  vencimento: string | null;
  enviadoEm: string | null;
  visualizadoEm: string | null;
};

const CANAIS = [
  { valor: "email", rotulo: "E-mail" },
  { valor: "whatsapp", rotulo: "WhatsApp" },
  { valor: "portal", rotulo: "Só o portal (sem mensagem)" },
] as const;

function dataHora(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  return `${formatarData(iso.slice(0, 10))} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/**
 * Anexos e envio de uma guia do checklist. O upload vai direto ao
 * armazenamento quando há URL assinada (R2) ou pela API (disco local); o
 * envio gera o protocolo e avança o item para "enviado".
 */
export default function ItemChecklistModal({
  item,
  cliente,
  obrigacao,
  aoFechar,
  aoMudar,
}: {
  item: Item;
  cliente: string;
  obrigacao: string;
  aoFechar: () => void;
  aoMudar: () => void;
}) {
  const qc = useQueryClient();
  const consulta = { entidade: "checklist_item" as const, entidadeId: item.id };
  const { data: arquivos = [] } = useListarArquivos(consulta);
  const { data: protocolos = [] } = useListarProtocolosItem(item.id);

  const [canal, setCanal] = useState<(typeof CANAIS)[number]["valor"]>("email");
  const [mensagem, setMensagem] = useState("");
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [resultado, setResultado] = useState<{
    link: string | null;
    linkWhatsapp: string | null;
  } | null>(null);

  useEffect(() => {
    function tecla(e: KeyboardEvent) {
      if (e.key === "Escape") aoFechar();
    }
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, [aoFechar]);

  function invalidar() {
    qc.invalidateQueries({ queryKey: getListarArquivosQueryKey(consulta) });
    qc.invalidateQueries({ queryKey: getListarProtocolosItemQueryKey(item.id) });
    aoMudar();
  }

  async function subir(lista: FileList | null) {
    if (!lista?.length) return;
    setErro(null);
    for (const arquivo of Array.from(lista)) {
      setOcupado(`Subindo ${arquivo.name}…`);
      try {
        const {
          arquivo: registro,
          upload,
          urlConteudo,
        } = await criarArquivo({
          ...consulta,
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
          await confirmarArquivo(registro.id);
        } else {
          const r = await fetch(urlConteudo, {
            method: "PUT",
            headers: { "content-type": arquivo.type || "application/octet-stream" },
            body: arquivo,
            credentials: "same-origin",
          });
          if (!r.ok) {
            const corpo = (await r.json().catch(() => ({}))) as { error?: string };
            throw new Error(corpo.error ?? `Falha ao subir (${r.status}).`);
          }
        }
      } catch (e) {
        setErro(mensagemDeErro(e, `Não foi possível anexar ${arquivo.name}.`));
      }
    }
    setOcupado(null);
    invalidar();
  }

  async function baixar(id: number) {
    try {
      const { url } = await getUrlDownloadArquivo(id);
      window.open(url, "_blank", "noopener");
    } catch (e) {
      setErro(mensagemDeErro(e));
    }
  }

  async function remover(id: number, nome: string) {
    if (!confirm(`Remover o anexo "${nome}"?`)) return;
    try {
      await removerArquivo(id);
      invalidar();
    } catch (e) {
      setErro(mensagemDeErro(e));
    }
  }

  async function enviar() {
    setErro(null);
    setResultado(null);
    setOcupado("Enviando…");
    try {
      const r = await enviarGuia(item.id, { canal, mensagem: mensagem.trim() || null });
      setResultado({ link: r.protocolo.link, linkWhatsapp: r.linkWhatsapp });
      setMensagem("");
      invalidar();
    } catch (e) {
      setErro(mensagemDeErro(e, "Não foi possível enviar."));
    } finally {
      setOcupado(null);
    }
  }

  const campo =
    "w-full rounded-lg border border-black/15 bg-transparent px-3 py-2 text-sm dark:border-white/15";

  return (
    <div className="fixed inset-0 z-20 overflow-y-auto">
      {/* Fundo clicável como botão de verdade: fecha por clique e por teclado. */}
      <button
        type="button"
        aria-label="Fechar"
        onClick={aoFechar}
        className="fixed inset-0 h-full w-full cursor-default bg-black/40"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`${cliente} — ${obrigacao}`}
        className="relative mx-auto my-8 w-full max-w-xl rounded-xl border border-black/10 bg-white p-6 shadow-xl dark:border-white/10 dark:bg-neutral-950"
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">{obrigacao}</h2>
            <p className="text-sm text-neutral-500">
              {cliente}
              {item.vencimento ? ` · vence ${formatarData(item.vencimento)}` : ""}
              {item.enviadoEm ? ` · enviada em ${dataHora(item.enviadoEm)}` : ""}
              {item.visualizadoEm ? ` · visualizada em ${dataHora(item.visualizadoEm)}` : ""}
            </p>
          </div>
          <button
            type="button"
            onClick={aoFechar}
            aria-label="Fechar"
            className="text-neutral-500 hover:text-neutral-800"
          >
            ✕
          </button>
        </div>

        {erro && (
          <p
            role="alert"
            className="mb-3 rounded-lg bg-red-600/10 px-3 py-2 text-sm text-red-700 dark:text-red-400"
          >
            {erro}
          </p>
        )}
        {ocupado && <p className="mb-3 text-sm text-neutral-500">{ocupado}</p>}

        <section className="mb-5">
          <h3 className="mb-2 text-sm font-medium">Anexos</h3>
          {arquivos.length === 0 ? (
            <p className="mb-2 text-sm text-neutral-500">Nenhuma guia anexada ainda.</p>
          ) : (
            <ul className="mb-2 divide-y divide-black/10 rounded-lg border border-black/10 text-sm dark:divide-white/10 dark:border-white/10">
              {arquivos.map((a) => (
                <li key={a.id} className="flex items-center justify-between gap-2 px-3 py-2">
                  <button
                    type="button"
                    onClick={() => baixar(a.id)}
                    className="truncate text-left text-blue-600 hover:underline"
                  >
                    📄 {a.nome}
                  </button>
                  <span className="shrink-0 text-xs text-neutral-500">
                    {Math.max(1, Math.round(a.tamanho / 1024))} KB
                    <button
                      type="button"
                      onClick={() => remover(a.id, a.nome)}
                      title="Remover anexo"
                      className="ml-2 text-neutral-400 hover:text-red-600"
                    >
                      ✕
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          )}
          <label className="inline-block cursor-pointer rounded-lg border border-black/15 px-3 py-2 text-sm dark:border-white/15">
            📎 Anexar guia (PDF, imagem, XML…)
            <input
              type="file"
              multiple
              className="hidden"
              onChange={(e) => subir(e.target.files)}
            />
          </label>
        </section>

        <section className="mb-5">
          <h3 className="mb-2 text-sm font-medium">Enviar ao cliente</h3>
          <div className="grid gap-2">
            <select
              value={canal}
              onChange={(e) => setCanal(e.target.value as typeof canal)}
              aria-label="Canal"
              className="rounded-lg border border-black/15 bg-neutral-900 px-3 py-2 text-sm text-white dark:border-white/15"
            >
              {CANAIS.map((c) => (
                <option key={c.valor} value={c.valor} className="bg-neutral-900 text-white">
                  {c.rotulo}
                </option>
              ))}
            </select>
            <textarea
              value={mensagem}
              onChange={(e) => setMensagem(e.target.value)}
              rows={2}
              placeholder="Mensagem extra (opcional) — vai antes do aviso padrão"
              className={campo}
            />
            <button
              type="button"
              onClick={enviar}
              disabled={!!ocupado || arquivos.length === 0}
              title={arquivos.length === 0 ? "Anexe a guia antes de enviar" : undefined}
              className="justify-self-start rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
            >
              Enviar ao cliente
            </button>
          </div>
          {resultado && (
            <div className="mt-3 rounded-lg bg-green-600/10 px-3 py-2 text-sm text-green-800 dark:text-green-300">
              ✓ Guia enviada e item marcado como enviado.
              {resultado.link && (
                <p className="mt-1 break-all text-xs">
                  Link do protocolo: <code>{resultado.link}</code>
                </p>
              )}
              {resultado.linkWhatsapp && (
                <a
                  href={resultado.linkWhatsapp}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-1 inline-block font-medium underline"
                >
                  Abrir no WhatsApp para mandar à mão
                </a>
              )}
            </div>
          )}
        </section>

        <section>
          <h3 className="mb-2 text-sm font-medium">Protocolos</h3>
          {protocolos.length === 0 ? (
            <p className="text-sm text-neutral-500">Ainda não foi enviada.</p>
          ) : (
            <ul className="divide-y divide-black/10 text-sm dark:divide-white/10">
              {protocolos.map((p) => (
                <li key={p.id} className="flex flex-wrap justify-between gap-2 py-2">
                  <span>
                    #{p.id} · {p.canal} · {dataHora(p.enviadoEm)}
                    {p.enviadoPor ? ` · ${p.enviadoPor}` : ""}
                  </span>
                  <span
                    className={
                      p.visualizadoEm ? "text-green-700 dark:text-green-400" : "text-neutral-500"
                    }
                  >
                    {p.visualizadoEm
                      ? `visualizado em ${dataHora(p.visualizadoEm)}`
                      : "não visualizado"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
