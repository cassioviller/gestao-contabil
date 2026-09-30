import { useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  getListarSolicitacoesQueryKey,
  getUrlDownloadArquivo,
  useAtualizarSolicitacao,
  useCriarSolicitacao,
  useListarArquivos,
  useListarClientes,
  useListarSolicitacoes,
} from "@workspace/api-client-react";
import { formatarData } from "@/lib/formato";
import { mensagemDeErro } from "@/lib/erros";
import Consulta from "@/components/Consulta";

const ROTULO = { aberta: "Aberta", respondida: "Respondida", concluida: "Concluída" } as const;

function Anexos({ solicitacaoId }: { solicitacaoId: number }) {
  const { data: arquivos = [] } = useListarArquivos({
    entidade: "solicitacao",
    entidadeId: solicitacaoId,
  });
  async function baixar(id: number) {
    const { url } = await getUrlDownloadArquivo(id);
    window.open(url, "_blank", "noopener");
  }
  if (!arquivos.length) return <span className="text-xs text-neutral-500">sem arquivos</span>;
  return (
    <span className="flex flex-wrap gap-2">
      {arquivos.map((a) => (
        <button
          key={a.id}
          type="button"
          onClick={() => baixar(a.id)}
          className="text-xs text-blue-600 hover:underline"
        >
          📄 {a.nome}
        </button>
      ))}
    </span>
  );
}

export default function Solicitacoes() {
  const qc = useQueryClient();
  const [filtro, setFiltro] = useState<"todas" | "aberta" | "respondida" | "concluida">("todas");
  const consulta = filtro === "todas" ? {} : { status: filtro };
  const { data: lista = [], isLoading, error, refetch } = useListarSolicitacoes(consulta);
  const { data: clientes = [] } = useListarClientes();
  const criar = useCriarSolicitacao();
  const atualizar = useAtualizarSolicitacao();
  const [form, setForm] = useState({ clienteId: "", tipo: "documento", descricao: "", prazo: "" });
  const [erro, setErro] = useState<string | null>(null);
  const [aberta, setAberta] = useState<number | null>(null);

  function invalidar() {
    qc.invalidateQueries({ queryKey: getListarSolicitacoesQueryKey() });
    qc.invalidateQueries({ queryKey: getListarSolicitacoesQueryKey(consulta) });
  }

  async function enviar(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    try {
      await criar.mutateAsync({
        data: {
          clienteId: Number(form.clienteId),
          tipo: form.tipo as "documento" | "informacao",
          descricao: form.descricao.trim(),
          prazo: form.prazo || null,
        },
      });
      setForm({ clienteId: "", tipo: "documento", descricao: "", prazo: "" });
      invalidar();
    } catch (err) {
      setErro(mensagemDeErro(err));
    }
  }

  async function concluir(id: number) {
    try {
      await atualizar.mutateAsync({ id, data: { status: "concluida" } });
      invalidar();
    } catch (err) {
      setErro(mensagemDeErro(err));
    }
  }

  const campo =
    "rounded-lg border border-black/15 bg-transparent px-3 py-2 text-sm dark:border-white/15";
  const selecao =
    "rounded-lg border border-black/15 bg-neutral-900 px-3 py-2 text-sm text-white dark:border-white/15";

  return (
    <div className="max-w-5xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Solicitações</h1>
        <p className="text-sm text-neutral-500">
          O que o escritório pediu aos clientes. Quem tem e-mail recebe um aviso e responde pelo
          portal.
        </p>
      </div>

      {erro && (
        <p
          role="alert"
          className="mb-4 rounded-lg bg-red-600/10 px-3 py-2 text-sm text-red-700 dark:text-red-400"
        >
          {erro}
        </p>
      )}

      <form
        onSubmit={enviar}
        className="mb-6 grid gap-3 rounded-xl border border-black/10 p-4 sm:grid-cols-5 dark:border-white/10"
      >
        <select
          value={form.clienteId}
          onChange={(e) => setForm({ ...form, clienteId: e.target.value })}
          required
          aria-label="Cliente"
          className={selecao}
        >
          <option value="" className="bg-neutral-900 text-white">
            Cliente…
          </option>
          {clientes
            .filter((c) => c.ativo)
            .map((c) => (
              <option key={c.id} value={c.id} className="bg-neutral-900 text-white">
                {c.razaoSocial}
              </option>
            ))}
        </select>
        <select
          value={form.tipo}
          onChange={(e) => setForm({ ...form, tipo: e.target.value })}
          aria-label="Tipo"
          className={selecao}
        >
          <option value="documento" className="bg-neutral-900 text-white">
            Documento
          </option>
          <option value="informacao" className="bg-neutral-900 text-white">
            Informação
          </option>
        </select>
        <input
          value={form.descricao}
          onChange={(e) => setForm({ ...form, descricao: e.target.value })}
          required
          placeholder="O que precisa? (ex.: extrato bancário de agosto)"
          aria-label="Descrição"
          className={`${campo} sm:col-span-2`}
        />
        <input
          type="date"
          value={form.prazo}
          onChange={(e) => setForm({ ...form, prazo: e.target.value })}
          aria-label="Prazo"
          className={campo}
        />
        <button
          type="submit"
          disabled={criar.isPending || !form.clienteId || !form.descricao.trim()}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 sm:col-span-5 sm:justify-self-start"
        >
          + Pedir ao cliente
        </button>
      </form>

      <div className="mb-3 flex gap-2 text-sm">
        {(["todas", "aberta", "respondida", "concluida"] as const).map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFiltro(f)}
            className={`rounded-lg px-3 py-1 ${filtro === f ? "bg-blue-600 text-white" : "border border-black/15 dark:border-white/15"}`}
          >
            {f === "todas" ? "Todas" : ROTULO[f]}
          </button>
        ))}
      </div>

      <Consulta
        isLoading={isLoading}
        error={error}
        vazio={lista.length === 0}
        aoTentar={() => refetch()}
        mensagemVazio="Nenhuma solicitação."
      >
        <div className="overflow-auto rounded-xl border border-black/10 dark:border-white/10">
          <table className="w-full text-left text-sm">
            <thead className="bg-neutral-100 dark:bg-neutral-900">
              <tr>
                <th className="px-3 py-2 font-medium">Cliente</th>
                <th className="px-3 py-2 font-medium">Pedido</th>
                <th className="px-3 py-2 font-medium">Prazo</th>
                <th className="px-3 py-2 font-medium">Situação</th>
                <th className="px-3 py-2 font-medium">Arquivos</th>
                <th className="w-32" />
              </tr>
            </thead>
            <tbody className="divide-y divide-black/10 dark:divide-white/10">
              {lista.map((s) => (
                <tr key={s.id}>
                  <td className="px-3 py-2 font-medium">{s.clienteNome}</td>
                  <td className="px-3 py-2">
                    {s.descricao}
                    {s.resposta && (
                      <p className="text-xs text-neutral-500">Resposta: {s.resposta}</p>
                    )}
                  </td>
                  <td className="px-3 py-2">{formatarData(s.prazo)}</td>
                  <td className="px-3 py-2">{ROTULO[s.status]}</td>
                  <td className="px-3 py-2">
                    {aberta === s.id ? (
                      <Anexos solicitacaoId={s.id} />
                    ) : (
                      <button
                        type="button"
                        onClick={() => setAberta(s.id)}
                        className="text-xs text-blue-600 hover:underline"
                      >
                        {s.arquivos} arquivo(s)
                      </button>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {s.status !== "concluida" && (
                      <button
                        type="button"
                        onClick={() => concluir(s.id)}
                        className="text-xs text-blue-600 hover:underline"
                      >
                        Concluir
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Consulta>
    </div>
  );
}
