import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListarTipos,
  getListarTiposQueryKey,
  useSalvarTipo,
  useRemoverTipo,
  useVincularAutomaticas,
  getListarClientesQueryKey,
} from "@workspace/api-client-react";
import { mensagemDeErro } from "@/lib/erros";
import {
  PERIODICIDADES,
  rotuloPeriodicidade,
  mesesDaPeriodicidade,
  MESES,
  nomeMes,
  REGIMES,
} from "@/lib/formato";

type Tipo = {
  id: number;
  nome: string;
  descricao: string | null;
  ordem: number;
  diaVencimento: number | null;
  offsetMes: number;
  periodicidade: string;
  mesReferencia: number | null;
  regimes: string[] | null;
  /** Ao definir o regime de um cliente, vincula sozinha (se for do regime). */
  vincularAutomatico: boolean;
  /** Inativa não entra em mês novo, mas o histórico fica. */
  ativo: boolean;
};

/** Campos que a grade edita. `id` fica de fora — é a identidade da linha. */
type Rascunho = Partial<Omit<Tipo, "id">>;

const COR_PERIODICIDADE: Record<string, string> = {
  mensal: "bg-blue-600/15 text-blue-700 dark:text-blue-400",
  bimestral: "bg-cyan-600/15 text-cyan-700 dark:text-cyan-400",
  trimestral: "bg-violet-600/15 text-violet-700 dark:text-violet-400",
  semestral: "bg-amber-600/15 text-amber-700 dark:text-amber-400",
  anual: "bg-rose-600/15 text-rose-700 dark:text-rose-400",
};

/** Iniciais dos regimes, para caber numa coluna de grade. */
const SIGLA_REGIME: Record<string, string> = {
  simples_nacional: "S",
  mei: "M",
  lucro_presumido: "P",
  lucro_real: "R",
};

const mesmo = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

export default function Tipos() {
  const qc = useQueryClient();
  const { data: tiposApi = [], isLoading } = useListarTipos();
  const salvarMutation = useSalvarTipo();
  const removerMutation = useRemoverTipo();
  const vincularMutation = useVincularAutomaticas();

  const [rascunhos, setRascunhos] = useState<Record<number, Rascunho>>({});
  const [filtro, setFiltro] = useState("todas");
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [salvo, setSalvo] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  const tipos = tiposApi as unknown as Tipo[];

  /** Valor exibido: o rascunho, se houver, senão o que veio do servidor. */
  function ver<K extends keyof Rascunho>(t: Tipo, campo: K): Tipo[K] {
    const r = rascunhos[t.id];
    return (r && campo in r ? r[campo] : t[campo]) as Tipo[K];
  }

  function mudar<K extends keyof Rascunho>(t: Tipo, campo: K, valor: Tipo[K]) {
    setErro(null);
    setRascunhos((atual) => {
      const r = { ...(atual[t.id] ?? {}), [campo]: valor };
      // Voltou ao valor original em todos os campos? O rascunho deixa de existir.
      const aindaDifere = Object.entries(r).some(([k, v]) => !mesmo(v, t[k as keyof Tipo]));
      const proximo = { ...atual };
      if (aindaDifere) proximo[t.id] = r;
      else delete proximo[t.id];
      return proximo;
    });
  }

  function alternarRegime(t: Tipo, valor: string) {
    const atuais = ver(t, "regimes") ?? [];
    const proximo = atuais.includes(valor)
      ? atuais.filter((r) => r !== valor)
      : [...atuais, valor];
    // Nenhum marcado = vale para todos, que no banco é nulo.
    mudar(t, "regimes", proximo.length ? proximo : null);
  }

  const alterados = tipos.filter((t) => {
    const r = rascunhos[t.id];
    return r && Object.entries(r).some(([k, v]) => !mesmo(v, t[k as keyof Tipo]));
  });

  async function salvarTudo() {
    setSalvando(true);
    setErro(null);
    try {
      // A API salva um tipo por vez; em série para a mensagem de erro apontar
      // qual obrigação falhou.
      for (const t of alterados) {
        const dados = { ...t, ...rascunhos[t.id] };
        await salvarMutation.mutateAsync({
          data: {
            id: t.id,
            nome: dados.nome,
            ordem: dados.ordem,
            diaVencimento: dados.diaVencimento,
            offsetMes: dados.offsetMes,
            periodicidade: dados.periodicidade,
            mesReferencia: dados.periodicidade === "mensal" ? null : dados.mesReferencia ?? 1,
            regimes: dados.regimes,
            descricao: dados.descricao,
            vincularAutomatico: dados.vincularAutomatico,
            ativo: dados.ativo,
          } as never,
        });
      }
      setRascunhos({});
      qc.invalidateQueries({ queryKey: getListarTiposQueryKey() });
      setSalvo(true);
      window.setTimeout(() => setSalvo(false), 2000);
    } catch (e) {
      setErro(mensagemDeErro(e, "Não foi possível salvar. Verifique se o servidor da API está no ar."));
    } finally {
      setSalvando(false);
    }
  }

  /** Põe a base em dia: cada cliente com regime ganha as automáticas do regime dele. */
  async function vincularAutomaticas() {
    setErro(null);
    setAviso(null);
    try {
      const { vinculosCriados } = await vincularMutation.mutateAsync();
      qc.invalidateQueries({ queryKey: getListarClientesQueryKey() });
      setAviso(
        vinculosCriados === 0
          ? "Nenhum vínculo novo: os clientes já tinham as obrigações automáticas do regime deles."
          : `${vinculosCriados} vínculo(s) criado(s) entre clientes e obrigações automáticas.`,
      );
    } catch (e) {
      setErro(mensagemDeErro(e));
    }
  }

  async function adicionar() {
    const nome = prompt("Nome da nova obrigação:");
    if (!nome?.trim()) return;
    try {
      await salvarMutation.mutateAsync({
        data: { nome: nome.trim(), ordem: tipos.length + 1 } as never,
      });
      qc.invalidateQueries({ queryKey: getListarTiposQueryKey() });
    } catch {
      setErro("Não foi possível criar. Já existe uma obrigação com esse nome?");
    }
  }

  async function remover(t: Tipo) {
    if (!confirm(`Remover "${t.nome}"? Ela sai do checklist de todos os clientes.`)) return;
    await removerMutation.mutateAsync({ id: t.id });
    qc.invalidateQueries({ queryKey: getListarTiposQueryKey() });
  }

  const visiveis = tipos.filter((t) => filtro === "todas" || ver(t, "periodicidade") === filtro);

  const celula = "border-r border-black/10 p-0 dark:border-white/10";
  const entrada =
    "h-9 w-full bg-transparent px-2 text-sm outline-none focus:bg-blue-50 focus:ring-2 focus:ring-inset focus:ring-blue-500 dark:focus:bg-blue-950/40";
  const selecao =
    "h-9 w-full bg-neutral-900 px-1 text-sm text-white outline-none focus:ring-2 focus:ring-inset focus:ring-blue-500";

  return (
    <div className="pb-24">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Tipos de obrigação</h1>
          <p className="text-sm text-neutral-500">
            Edite tudo aqui e grave de uma vez · a periodicidade define em que meses cada uma aparece
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={vincularAutomaticas} disabled={vincularMutation.isPending}
            title="Vincula a cada cliente ativo com regime as obrigações marcadas como automáticas; não desvincula nada"
            className="rounded-lg border border-black/15 px-4 py-2 text-sm disabled:opacity-50 dark:border-white/15">
            {vincularMutation.isPending ? "Vinculando..." : "Vincular automáticas aos clientes"}
          </button>
          <button onClick={adicionar}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
            + Nova obrigação
          </button>
        </div>
      </div>

      {aviso && <p className="mb-3 text-sm text-green-700 dark:text-green-400">✓ {aviso}</p>}

      {erro && (
        <p role="alert" className="mb-3 rounded-lg bg-red-600/10 px-3 py-2 text-sm text-red-700 dark:text-red-400">
          {erro}
        </p>
      )}

      <div className="mb-4 flex flex-wrap gap-2">
        {[{ valor: "todas", rotulo: "Todas" }, ...PERIODICIDADES].map((p) => {
          const quantos =
            p.valor === "todas" ? tipos.length : tipos.filter((t) => ver(t, "periodicidade") === p.valor).length;
          return (
            <button key={p.valor} onClick={() => setFiltro(p.valor)}
              className={`rounded-lg px-3 py-1.5 text-sm ${
                filtro === p.valor
                  ? "bg-blue-600 text-white"
                  : "border border-black/15 text-neutral-700 dark:border-white/15 dark:text-neutral-300"
              }`}>
              {p.rotulo} <span className="text-xs opacity-70">{quantos}</span>
            </button>
          );
        })}
      </div>

      {isLoading ? (
        <p className="text-sm text-neutral-500">Carregando...</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-black/10 dark:border-white/10">
          <table className="w-full text-left text-sm">
            <thead className="bg-neutral-100 dark:bg-neutral-900">
              <tr>
                <th className={`w-16 px-2 py-2 font-medium ${celula}`}>Ordem</th>
                <th className={`min-w-56 px-2 py-2 font-medium ${celula}`}>Obrigação</th>
                <th className={`min-w-64 px-2 py-2 font-medium ${celula}`}>Descrição</th>
                <th className={`w-36 px-2 py-2 font-medium ${celula}`}>Periodicidade</th>
                <th className={`w-32 px-2 py-2 font-medium ${celula}`}>Mês de referência</th>
                <th className={`w-24 px-2 py-2 font-medium ${celula}`}>Dia venc.</th>
                <th className={`w-36 px-2 py-2 font-medium ${celula}`}>Vence em</th>
                <th className={`w-40 px-2 py-2 font-medium ${celula}`}>
                  Regimes
                  <span className="block text-xs font-normal text-neutral-500">
                    S=Simples M=MEI P=Presumido R=Real
                  </span>
                </th>
                <th className={`w-16 px-2 py-2 text-center font-medium ${celula}`}
                  title="Ao definir o regime de um cliente, a obrigação é vinculada sozinha">
                  Auto
                </th>
                <th className={`w-16 px-2 py-2 text-center font-medium ${celula}`}
                  title="Inativa não entra em mês novo; o histórico fica">
                  Ativa
                </th>
                <th className="w-10" />
              </tr>
            </thead>
            <tbody className="divide-y divide-black/10 dark:divide-white/10">
              {visiveis.map((t) => {
                const periodicidade = ver(t, "periodicidade");
                const regimes = ver(t, "regimes") ?? [];
                const alterado = alterados.some((a) => a.id === t.id);
                const ativa = ver(t, "ativo");
                return (
                  <tr key={t.id}
                    className={`${alterado ? "bg-amber-50 dark:bg-amber-950/20" : ""} ${ativa ? "" : "opacity-60"}`}>
                    <td className={`w-16 ${celula}`}>
                      <input type="number" name="ordem" aria-label={`Ordem de ${t.nome}`}
                        value={ver(t, "ordem")}
                        onChange={(e) => mudar(t, "ordem", Number(e.target.value))}
                        className={entrada} />
                    </td>
                    <td className={`min-w-56 ${celula}`}>
                      <input name="nome" aria-label={`Nome de ${t.nome}`} value={ver(t, "nome")}
                        onChange={(e) => mudar(t, "nome", e.target.value)}
                        className={`${entrada} font-medium`} />
                      {periodicidade !== "mensal" && (
                        <p className="px-2 pb-1 text-xs text-neutral-500">
                          cai em{" "}
                          {mesesDaPeriodicidade(periodicidade, ver(t, "mesReferencia")).map(nomeMes).join(", ")}
                        </p>
                      )}
                    </td>
                    <td className={`min-w-64 ${celula}`}>
                      <input name="descricao" aria-label={`Descrição de ${t.nome}`}
                        value={ver(t, "descricao") ?? ""}
                        placeholder="o que é, quem entrega"
                        onChange={(e) => mudar(t, "descricao", e.target.value || null)}
                        className={`${entrada} text-neutral-600 dark:text-neutral-300`} />
                    </td>
                    <td className={`w-36 ${celula}`}>
                      <select name="periodicidade" aria-label={`Periodicidade de ${t.nome}`}
                        value={periodicidade}
                        onChange={(e) => mudar(t, "periodicidade", e.target.value)}
                        className={selecao}>
                        {PERIODICIDADES.map((p) => (
                          <option key={p.valor} value={p.valor} className="bg-neutral-900 text-white">
                            {p.rotulo}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className={`w-32 ${celula}`}>
                      {periodicidade === "mensal" ? (
                        <span className="block px-2 py-2 text-neutral-400">—</span>
                      ) : (
                        <select name="mesReferencia" aria-label={`Mês de referência de ${t.nome}`}
                          value={String(ver(t, "mesReferencia") ?? 1)}
                          onChange={(e) => mudar(t, "mesReferencia", Number(e.target.value))}
                          className={selecao}>
                          {MESES.map((m, i) => (
                            <option key={m} value={i + 1} className="bg-neutral-900 text-white">
                              {m}
                            </option>
                          ))}
                        </select>
                      )}
                    </td>
                    <td className={`w-24 ${celula}`}>
                      <input type="number" min={1} max={31} name="diaVencimento"
                        aria-label={`Dia de vencimento de ${t.nome}`}
                        value={ver(t, "diaVencimento") ?? ""}
                        onChange={(e) =>
                          mudar(t, "diaVencimento", e.target.value ? Number(e.target.value) : null)
                        }
                        className={entrada} />
                    </td>
                    <td className={`w-36 ${celula}`}>
                      <select name="offsetMes" aria-label={`Vencimento de ${t.nome} em relação à competência`}
                        value={String(ver(t, "offsetMes"))}
                        onChange={(e) => mudar(t, "offsetMes", Number(e.target.value))}
                        className={selecao}>
                        <option value="0" className="bg-neutral-900 text-white">Mesmo mês</option>
                        <option value="1" className="bg-neutral-900 text-white">Mês seguinte</option>
                      </select>
                    </td>
                    <td className={`w-40 px-2 py-2 ${celula}`}>
                      <div className="flex items-center gap-2">
                        {REGIMES.map((r) => (
                          <label key={r.valor} className="flex items-center gap-0.5 text-xs" title={r.rotulo}>
                            <input type="checkbox" checked={regimes.includes(r.valor)}
                              aria-label={`${t.nome}: ${r.rotulo}`}
                              onChange={() => alternarRegime(t, r.valor)} />
                            {SIGLA_REGIME[r.valor]}
                          </label>
                        ))}
                      </div>
                      <p className="mt-0.5 text-xs text-neutral-400">
                        {regimes.length ? "" : "todos"}
                      </p>
                    </td>
                    <td className={`w-16 px-2 py-2 text-center ${celula}`}>
                      <input type="checkbox" name="vincularAutomatico"
                        aria-label={`${t.nome}: vincular automaticamente`}
                        checked={ver(t, "vincularAutomatico")}
                        onChange={(e) => mudar(t, "vincularAutomatico", e.target.checked)} />
                    </td>
                    <td className={`w-16 px-2 py-2 text-center ${celula}`}>
                      <input type="checkbox" name="ativo" aria-label={`${t.nome}: ativa`}
                        checked={ativa}
                        onChange={(e) => mudar(t, "ativo", e.target.checked)} />
                    </td>
                    <td className="w-10 px-2 py-2 text-center">
                      <button onClick={() => remover(t)} title="Remover obrigação"
                        className="text-neutral-400 hover:text-red-600">
                        ✕
                      </button>
                    </td>
                  </tr>
                );
              })}
              {visiveis.length === 0 && (
                <tr>
                  <td colSpan={11} className="px-3 py-8 text-center text-neutral-500">
                    {tipos.length === 0 ? "Nenhuma obrigação cadastrada." : "Nenhuma nesta periodicidade."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Barra de gravação: fixa no rodapé para não sumir ao rolar a grade. */}
      <div className="fixed inset-x-0 bottom-0 border-t border-black/10 bg-white/95 px-6 py-3 backdrop-blur dark:border-white/10 dark:bg-neutral-950/95">
        <div className="flex flex-wrap items-center justify-end gap-3">
          {salvo && <span className="mr-auto text-sm text-green-600">✓ alterações salvas</span>}
          {!salvo && alterados.length > 0 && (
            <span className="mr-auto text-sm text-amber-700 dark:text-amber-400">
              {alterados.length} alteração(ões) pendente(s):{" "}
              {alterados.map((t) => t.nome).join(", ")}
            </span>
          )}
          {!salvo && alterados.length === 0 && (
            <span className="mr-auto text-sm text-neutral-500">Nenhuma alteração pendente</span>
          )}
          <button onClick={() => setRascunhos({})} disabled={alterados.length === 0 || salvando}
            className="rounded-lg border border-black/15 px-4 py-2 text-sm disabled:opacity-40 dark:border-white/15">
            Descartar
          </button>
          <button onClick={salvarTudo} disabled={alterados.length === 0 || salvando}
            className="rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-40">
            {salvando ? "Salvando..." : "Salvar alterações"}
          </button>
        </div>
      </div>
    </div>
  );
}
