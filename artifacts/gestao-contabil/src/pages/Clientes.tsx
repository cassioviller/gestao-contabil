import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListarClientes,
  getListarClientesQueryKey,
  useCriarCliente,
  useRemoverCliente,
  useListarTipos,
} from "@workspace/api-client-react";
import { formatarMoeda, REGIMES, rotuloRegime } from "@/lib/formato";

type Cliente = {
  id: number;
  codigo: number | null;
  razaoSocial: string;
  cnpj: string | null;
  cnaePrincipal: string | null;
  regime: string | null;
  inscricaoEstadual: string | null;
  formaEnvio: string | null;
  procuracao: string | null;
  senhaNfse: string | null;
  observacao: string | null;
  valorHonorario: string | null;
  diaVencimentoHonorario: number | null;
  contatoNome: string | null;
  whatsapp: string | null;
  email: string | null;
  ativo: boolean;
  obrigacoes: number[];
};

const novoCliente: Cliente = {
  id: 0, codigo: null, razaoSocial: "", cnpj: "", cnaePrincipal: "", regime: null, inscricaoEstadual: "",
  formaEnvio: "", procuracao: "", senhaNfse: "", observacao: "",
  valorHonorario: "", diaVencimentoHonorario: null,
  contatoNome: "", whatsapp: "", email: "", ativo: true, obrigacoes: [],
};

function Campo({ label, name, defaultValue, type = "text", required, placeholder }: {
  label: string; name: string; defaultValue: string | number; type?: string; required?: boolean; placeholder?: string;
}) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="text-neutral-600 dark:text-neutral-400">{label}</span>
      <input name={name} type={type} defaultValue={defaultValue} required={required} placeholder={placeholder}
        className="rounded-lg border border-black/15 bg-transparent px-3 py-2 dark:border-white/15" />
    </label>
  );
}

function FormularioCliente({ cliente, tipos, aoFechar }: {
  cliente: Cliente;
  tipos: { id: number; nome: string; regimes: string[] | null }[];
  aoFechar: () => void;
}) {
  // Controlado para as obrigações reagirem à troca de regime.
  const [regime, setRegime] = useState(cliente.regime ?? "");
  const [mostrarTodas, setMostrarTodas] = useState(false);
  const qc = useQueryClient();
  const criarMutation = useCriarCliente();
  const removerMutation = useRemoverCliente();
  const ehNovo = cliente.id === 0;

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const tipoIds = tipos.map((t) => t.id).filter((id) => fd.get(`obrig_${id}`) !== null);
    const dados = {
      id: ehNovo ? null : cliente.id,
      codigo: fd.get("codigo") ? Number(fd.get("codigo")) : null,
      razaoSocial: String(fd.get("razaoSocial") ?? ""),
      cnpj: String(fd.get("cnpj") ?? "") || null,
      cnaePrincipal: String(fd.get("cnaePrincipal") ?? "") || null,
      regime: String(fd.get("regime") ?? "") || null,
      inscricaoEstadual: String(fd.get("inscricaoEstadual") ?? "") || null,
      formaEnvio: String(fd.get("formaEnvio") ?? "") || null,
      procuracao: String(fd.get("procuracao") ?? "") || null,
      senhaNfse: String(fd.get("senhaNfse") ?? "") || null,
      observacao: String(fd.get("observacao") ?? "") || null,
      valorHonorario: String(fd.get("valorHonorario") ?? "").replace(/\./g, "").replace(",", ".") || null,
      diaVencimentoHonorario: fd.get("diaVencimentoHonorario") ? Number(fd.get("diaVencimentoHonorario")) : null,
      contatoNome: String(fd.get("contatoNome") ?? "") || null,
      whatsapp: String(fd.get("whatsapp") ?? "") || null,
      email: String(fd.get("email") ?? "") || null,
      ativo: fd.get("ativo") !== null,
      obrigacoes: tipoIds,
    };
    // @ts-ignore
    await criarMutation.mutateAsync({ data: dados });
    qc.invalidateQueries({ queryKey: getListarClientesQueryKey() });
    aoFechar();
  }

  async function handleRemover() {
    if (!confirm("Remover este cliente? Isso apaga seu histórico.")) return;
    await removerMutation.mutateAsync({ id: cliente.id });
    qc.invalidateQueries({ queryKey: getListarClientesQueryKey() });
    aoFechar();
  }

  /** Sem restrição na obrigação, ou sem regime no cliente, tudo se aplica. */
  const compativel = (t: { regimes: string[] | null }) =>
    !t.regimes?.length || !regime || t.regimes.includes(regime);

  // As já vinculadas continuam visíveis mesmo se incompatíveis — esconder uma
  // marcada faria o checkbox sumir e o submit a desvincularia sem querer.
  const escondiveis = tipos.filter((t) => !compativel(t) && !cliente.obrigacoes.includes(t.id));
  const visiveis = mostrarTodas ? tipos : tipos.filter((t) => !escondiveis.includes(t));
  // Contagem independente do toggle: senão o botão sumiria depois de abrir tudo.
  const ocultas = escondiveis.length;

  return (
    <div className="fixed inset-0 z-10 flex items-start justify-center overflow-y-auto bg-black/40 p-4">
      <div className="my-8 w-full max-w-2xl rounded-xl border border-black/10 bg-white p-6 shadow-xl dark:border-white/10 dark:bg-neutral-950">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">{ehNovo ? "Novo cliente" : `Editar — ${cliente.razaoSocial}`}</h2>
          <button onClick={aoFechar} className="text-neutral-500 hover:text-neutral-800">✕</button>
        </div>
        <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Campo label="Código" name="codigo" defaultValue={cliente.codigo ?? ""} type="number" />
          <Campo label="Razão social *" name="razaoSocial" defaultValue={cliente.razaoSocial} required />
          <Campo label="CNPJ" name="cnpj" defaultValue={cliente.cnpj ?? ""} />
          <Campo label="CNAE principal" name="cnaePrincipal" defaultValue={cliente.cnaePrincipal ?? ""} placeholder="ex: 6920-6/01" />
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-neutral-600 dark:text-neutral-400">Regime tributário</span>
            {/* Fundo próprio: com `bg-transparent` a lista suspensa sai branca e o texto claro some. */}
            <select name="regime" value={regime} onChange={(e) => setRegime(e.target.value)}
              className="rounded-lg border border-black/15 bg-neutral-900 px-3 py-2 text-white dark:border-white/15">
              <option value="" className="bg-neutral-900 text-white">Não definido</option>
              {REGIMES.map((r) => (
                <option key={r.valor} value={r.valor} className="bg-neutral-900 text-white">{r.rotulo}</option>
              ))}
            </select>
          </label>
          <Campo label="Inscrição estadual" name="inscricaoEstadual" defaultValue={cliente.inscricaoEstadual ?? ""} />
          <Campo label="Forma de envio" name="formaEnvio" defaultValue={cliente.formaEnvio ?? ""} />
          <Campo label="Procuração" name="procuracao" defaultValue={cliente.procuracao ?? ""} />
          <Campo label="Senha NFS-e" name="senhaNfse" defaultValue={cliente.senhaNfse ?? ""} />
          <Campo label="Honorário mensal (R$)" name="valorHonorario" defaultValue={cliente.valorHonorario ?? ""} placeholder="ex: 350,00" />
          <Campo label="Contato (WhatsApp)" name="contatoNome" defaultValue={cliente.contatoNome ?? ""} placeholder="ex: Maria (financeiro)" />
          <Campo label="WhatsApp" name="whatsapp" defaultValue={cliente.whatsapp ?? ""} placeholder="ex: (11) 99999-9999" />
          <Campo label="E-mail de contato" name="email" type="email" defaultValue={cliente.email ?? ""} placeholder="ex: contato@empresa.com.br" />
          <Campo label="Dia venc. honorário" name="diaVencimentoHonorario" defaultValue={cliente.diaVencimentoHonorario ?? ""} type="number" placeholder="ex: 10" />
          <label className="flex flex-col gap-1 text-sm sm:col-span-2">
            <span className="text-neutral-600 dark:text-neutral-400">Observação</span>
            <textarea name="observacao" defaultValue={cliente.observacao ?? ""} rows={2}
              className="rounded-lg border border-black/15 bg-transparent px-3 py-2 dark:border-white/15" />
          </label>
          <fieldset className="sm:col-span-2">
            <legend className="mb-2 text-sm text-neutral-600 dark:text-neutral-400">Obrigações deste cliente</legend>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {visiveis.map((t) => {
                const incompativel = !compativel(t);
                return (
                  <label key={t.id} className="flex items-center gap-2 text-sm">
                    <input type="checkbox" name={`obrig_${t.id}`} defaultChecked={cliente.obrigacoes.includes(t.id)} />
                    <span className={incompativel ? "text-amber-600 dark:text-amber-400" : ""}>
                      {t.nome}
                      {incompativel && <span title="Não é deste regime"> ⚠</span>}
                    </span>
                  </label>
                );
              })}
            </div>
            {ocultas > 0 && (
              <button type="button" onClick={() => setMostrarTodas((v) => !v)}
                className="mt-2 text-xs text-blue-600 hover:underline">
                {mostrarTodas
                  ? "Mostrar só as do regime"
                  : `Mostrar todas (${ocultas} não são deste regime)`}
              </button>
            )}
          </fieldset>
          <label className="flex items-center gap-2 text-sm sm:col-span-2">
            <input type="checkbox" name="ativo" defaultChecked={cliente.ativo} />
            Cliente ativo
          </label>
          <div className="flex items-center justify-between gap-2 sm:col-span-2">
            {!ehNovo ? (
              <button type="button" onClick={handleRemover} className="text-sm text-red-600 hover:underline">Remover</button>
            ) : <span />}
            <div className="flex gap-2">
              <button type="button" onClick={aoFechar}
                className="rounded-lg border border-black/15 px-4 py-2 text-sm dark:border-white/15">Cancelar</button>
              <button type="submit" disabled={criarMutation.isPending}
                className="rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50">
                {criarMutation.isPending ? "Salvando..." : "Salvar"}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function Clientes() {
  const { data: clientes = [], isLoading } = useListarClientes();
  const { data: tipos = [] } = useListarTipos();
  const [editando, setEditando] = useState<Cliente | null>(null);
  const [busca, setBusca] = useState("");

  const filtrados = clientes.filter((c) => {
    const t = busca.trim().toLowerCase();
    if (!t) return true;
    return (
      c.razaoSocial.toLowerCase().includes(t) ||
      (c.cnpj ?? "").toLowerCase().includes(t) ||
      String(c.codigo ?? "").includes(t)
    );
  });

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Clientes</h1>
          <p className="text-sm text-neutral-500">{clientes.length} cadastrado(s)</p>
        </div>
        <button onClick={() => setEditando({ ...novoCliente })}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
          + Novo cliente
        </button>
      </div>

      <input value={busca} onChange={(e) => setBusca(e.target.value)}
        placeholder="Buscar por nome, CNPJ ou código…"
        className="mb-4 w-full rounded-lg border border-black/15 bg-transparent px-3 py-2 text-sm dark:border-white/15 sm:w-80" />

      {isLoading ? (
        <p className="text-sm text-neutral-500">Carregando...</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-black/10 dark:border-white/10">
          <table className="w-full text-left text-sm">
            <thead className="bg-black/5 dark:bg-white/5">
              <tr>
                <th className="px-3 py-3 font-medium">Cód.</th>
                <th className="px-3 py-3 font-medium">Empresa</th>
                <th className="px-3 py-3 font-medium">CNPJ</th>
                <th className="px-3 py-3 font-medium">Regime</th>
                <th className="px-3 py-3 font-medium">Honorário</th>
                <th className="px-3 py-3 font-medium">Obrigações</th>
                <th className="px-3 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-black/10 dark:divide-white/10">
              {filtrados.map((c) => (
                <tr key={c.id} className={c.ativo ? "" : "opacity-50"}>
                  <td className="px-3 py-3 text-neutral-500">{c.codigo ?? "—"}</td>
                  <td className="px-3 py-3">
                    <p className="font-medium">{c.razaoSocial}</p>
                    {!c.ativo && <span className="text-xs text-red-500">inativo</span>}
                  </td>
                  <td className="px-3 py-3 text-neutral-600 dark:text-neutral-400">{c.cnpj || "—"}</td>
                  <td className="px-3 py-3 text-neutral-600 dark:text-neutral-400">{rotuloRegime(c.regime) || "—"}</td>
                  <td className="px-3 py-3">{formatarMoeda(c.valorHonorario)}</td>
                  <td className="px-3 py-3">
                    <span className="text-xs text-neutral-500">{c.obrigacoes.length} obrigação(ões)</span>
                  </td>
                  <td className="px-3 py-3 text-right">
                    <button onClick={() => setEditando(c as Cliente)} className="text-xs text-blue-600 hover:underline">Editar</button>
                  </td>
                </tr>
              ))}
              {filtrados.length === 0 && (
                <tr><td colSpan={7} className="px-3 py-6 text-center text-neutral-500">Nenhum cliente encontrado.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {editando && (
        <FormularioCliente
          cliente={editando}
          tipos={tipos as { id: number; nome: string; regimes: string[] | null }[]}
          aoFechar={() => setEditando(null)}
        />
      )}
    </div>
  );
}
