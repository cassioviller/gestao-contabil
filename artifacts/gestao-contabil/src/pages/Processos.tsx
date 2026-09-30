import { useState } from "react";
import { Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListarProcessos,
  getListarProcessosQueryKey,
  useSalvarProcesso,
  useListarClientes,
} from "@workspace/api-client-react";
import { formatarData } from "@/lib/formato";
import {
  STATUS_PROCESSO,
  TEXTOS,
  rotuloStatusProcesso,
  corStatusProcesso,
  atrasado,
  type Categoria,
} from "@/lib/processo";

type Filtro = "todos" | "aberto" | "em_andamento" | "concluido" | "cancelado";

function FormularioProcesso({
  clientes,
  aoFechar,
  categoria,
}: {
  clientes: { id: number; razaoSocial: string }[];
  aoFechar: () => void;
  categoria: Categoria;
}) {
  const txt = TEXTOS[categoria];
  const qc = useQueryClient();
  const salvar = useSalvarProcesso();
  const [erro, setErro] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErro(null);
    const fd = new FormData(e.currentTarget);
    const dados = {
      clienteId: Number(fd.get("clienteId")),
      categoria,
      tipo: String(fd.get("tipo") ?? "").trim(),
      titulo: String(fd.get("titulo") ?? "") || null,
      orgao: String(fd.get("orgao") ?? "") || null,
      protocolo: String(fd.get("protocolo") ?? "") || null,
      prazo: String(fd.get("prazo") ?? "") || null,
      observacao: String(fd.get("observacao") ?? "") || null,
    };
    // Sem o catch, a rejeição vira erro não tratado e o dev overlay cobre a tela.
    try {
      await salvar.mutateAsync({ data: dados as never });
    } catch (e) {
      setErro(
        e instanceof Error && e.message
          ? `Não foi possível salvar: ${e.message}`
          : "Não foi possível salvar. Verifique se o servidor da API está no ar.",
      );
      return;
    }
    qc.invalidateQueries({ queryKey: getListarProcessosQueryKey() });
    aoFechar();
  }

  const campo =
    "rounded-lg border border-black/15 bg-transparent px-3 py-2 text-sm dark:border-white/15";

  return (
    <div className="fixed inset-0 z-10 flex items-start justify-center overflow-y-auto bg-black/40 p-4">
      <div className="my-8 w-full max-w-xl rounded-xl border border-black/10 bg-white p-6 shadow-xl dark:border-white/10 dark:bg-neutral-950">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">{txt.novo}</h2>
          <button onClick={aoFechar} className="text-neutral-500 hover:text-neutral-800">
            ✕
          </button>
        </div>
        <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {erro && (
            <p
              role="alert"
              className="rounded-lg bg-red-600/10 px-3 py-2 text-sm text-red-700 sm:col-span-2 dark:text-red-400"
            >
              {erro}
            </p>
          )}
          <label className="flex flex-col gap-1 text-sm sm:col-span-2">
            <span className="text-neutral-600 dark:text-neutral-400">Empresa *</span>
            <select
              name="clienteId"
              required
              defaultValue=""
              className="rounded-lg border border-black/15 bg-neutral-900 px-3 py-2 text-sm text-white dark:border-white/15"
            >
              <option value="" disabled className="bg-neutral-900 text-white">
                Selecione…
              </option>
              {clientes.map((c) => (
                <option key={c.id} value={c.id} className="bg-neutral-900 text-white">
                  {c.razaoSocial}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1 text-sm sm:col-span-2">
            <span className="text-neutral-600 dark:text-neutral-400">Tipo de {txt.singular} *</span>
            {/* Lista aberta: as sugestões cobrem o comum, mas dá para digitar qualquer coisa. */}
            <input
              name="tipo"
              required
              list="tipos-sugeridos"
              placeholder={txt.exemploTipo}
              className={campo}
            />
            <datalist id="tipos-sugeridos">
              {txt.sugestoes.map((t) => (
                <option key={t} value={t} />
              ))}
            </datalist>
          </label>

          <label className="flex flex-col gap-1 text-sm sm:col-span-2">
            <span className="text-neutral-600 dark:text-neutral-400">Título / resumo</span>
            <input name="titulo" placeholder="detalhe em uma linha" className={campo} />
          </label>

          {/* Órgão e protocolo só fazem sentido no trâmite formal. */}
          {txt.mostrarOrgao && (
            <>
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-neutral-600 dark:text-neutral-400">Órgão</span>
                <input name="orgao" placeholder="ex: JUCESP, Prefeitura" className={campo} />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-neutral-600 dark:text-neutral-400">Protocolo</span>
                <input name="protocolo" className={campo} />
              </label>
            </>
          )}
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-neutral-600 dark:text-neutral-400">Prazo</span>
            <input name="prazo" type="date" className={campo} />
          </label>
          <span />

          <label className="flex flex-col gap-1 text-sm sm:col-span-2">
            <span className="text-neutral-600 dark:text-neutral-400">Observação</span>
            <textarea name="observacao" rows={2} className={campo} />
          </label>

          <div className="flex justify-end gap-2 sm:col-span-2">
            <button type="button" onClick={aoFechar} className={campo}>
              Cancelar
            </button>
            <button
              type="submit"
              disabled={salvar.isPending}
              className="rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
            >
              {salvar.isPending ? "Salvando..." : `Criar ${txt.singular}`}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/** Serve as duas abas: /processos e /pedidos. Muda a categoria e o vocabulário. */
export default function Processos({ categoria = "processo" }: { categoria?: Categoria }) {
  const txt = TEXTOS[categoria];
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const [busca, setBusca] = useState("");
  const [criando, setCriando] = useState(false);

  const { data: processos = [], isLoading } = useListarProcessos({
    categoria,
    ...(filtro === "todos" ? {} : { status: filtro }),
  });
  const { data: clientes = [] } = useListarClientes();

  const filtrados = processos.filter((p) => {
    const t = busca.trim().toLowerCase();
    if (!t) return true;
    return [p.clienteNome, p.tipo, p.titulo, p.protocolo, p.orgao].some((v) =>
      (v ?? "").toLowerCase().includes(t),
    );
  });

  const abas: { valor: Filtro; rotulo: string }[] = [
    { valor: "todos", rotulo: "Todos" },
    ...STATUS_PROCESSO.map((s) => ({ valor: s.valor as Filtro, rotulo: s.rotulo })),
  ];

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{txt.titulo}</h1>
          <p className="text-sm text-neutral-500">
            {filtrados.length} {txt.singular}(s) · abra um para montar o checklist
          </p>
        </div>
        <button
          onClick={() => setCriando(true)}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          + {txt.novo}
        </button>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {abas.map((a) => (
          <button
            key={a.valor}
            onClick={() => setFiltro(a.valor)}
            className={`rounded-lg px-3 py-1.5 text-sm ${
              filtro === a.valor
                ? "bg-blue-600 text-white"
                : "border border-black/15 text-neutral-700 dark:border-white/15 dark:text-neutral-300"
            }`}
          >
            {a.rotulo}
          </button>
        ))}
        <input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar por empresa, tipo, protocolo…"
          className="ml-auto w-full rounded-lg border border-black/15 bg-transparent px-3 py-2 text-sm dark:border-white/15 sm:w-72"
        />
      </div>

      {isLoading ? (
        <p className="text-sm text-neutral-500">Carregando...</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-black/10 dark:border-white/10">
          <table className="w-full text-left text-sm">
            <thead className="bg-black/5 dark:bg-white/5">
              <tr>
                <th className="px-3 py-3 font-medium">Empresa</th>
                <th className="px-3 py-3 font-medium">{txt.titulo.slice(0, -1)}</th>
                <th className="px-3 py-3 font-medium">Status</th>
                <th className="px-3 py-3 font-medium">Checklist</th>
                <th className="px-3 py-3 font-medium">Prazo</th>
                <th className="px-3 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-black/10 dark:divide-white/10">
              {filtrados.map((p) => {
                const total = p.totalEtapas;
                const feitas = p.etapasFeitas;
                const pct = total ? Math.round((feitas / total) * 100) : 0;
                const vencido = atrasado(p.prazo, p.status);
                return (
                  <tr key={p.id}>
                    <td className="px-3 py-3 font-medium">{p.clienteNome}</td>
                    <td className="px-3 py-3">
                      <p>{p.tipo}</p>
                      {p.titulo && <p className="text-xs text-neutral-500">{p.titulo}</p>}
                    </td>
                    <td className="px-3 py-3">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs ${corStatusProcesso(p.status)}`}
                      >
                        {rotuloStatusProcesso(p.status)}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      {total === 0 ? (
                        <span className="text-xs text-neutral-500">sem etapas</span>
                      ) : (
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 w-20 overflow-hidden rounded-full bg-black/10 dark:bg-white/10">
                            <div className="h-full bg-green-600" style={{ width: `${pct}%` }} />
                          </div>
                          <span className="text-xs text-neutral-500">
                            {feitas}/{total}
                          </span>
                        </div>
                      )}
                    </td>
                    <td
                      className={`px-3 py-3 ${vencido ? "font-medium text-red-600" : "text-neutral-600 dark:text-neutral-400"}`}
                    >
                      {formatarData(p.prazo)}
                      {vencido && <span className="ml-1 text-xs">atrasado</span>}
                    </td>
                    <td className="px-3 py-3 text-right">
                      <Link
                        href={`/${categoria}s/${p.id}`}
                        className="text-xs text-blue-600 hover:underline"
                      >
                        Abrir
                      </Link>
                    </td>
                  </tr>
                );
              })}
              {filtrados.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-3 py-8 text-center text-neutral-500">
                    Nenhum {txt.singular} aqui.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {criando && (
        <FormularioProcesso
          clientes={clientes as { id: number; razaoSocial: string }[]}
          aoFechar={() => setCriando(false)}
          categoria={categoria}
        />
      )}
    </div>
  );
}
