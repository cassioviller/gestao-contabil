import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListarDebitos,
  getListarDebitosQueryKey,
  useSalvarDebito,
  useAtualizarDebito,
  useRemoverDebito,
  useListarClientes,
  useListarTipos,
} from "@workspace/api-client-react";
import { formatarMoeda, formatarNumeroBR, hojeBR, paraDecimalAPI } from "@/lib/formato";
import { diasAtraso as calcularDiasAtraso } from "@workspace/dominio";

type Debito = {
  id: number;
  clienteId: number;
  clienteNome: string;
  rotulo: string;
  competenciaRef: string | null;
  vencimento: string | null;
  valor: string | null;
  status: string;
  observacao: string | null;
};

type Campo = "rotulo" | "competenciaRef" | "vencimento" | "valor" | "observacao";

const STATUS = [
  { valor: "em_aberto", rotulo: "Em aberto", cor: "bg-red-600/15 text-red-700 dark:text-red-400" },
  { valor: "parcelado", rotulo: "Parcelado", cor: "bg-amber-600/15 text-amber-700 dark:text-amber-400" },
  { valor: "pago", rotulo: "Pago", cor: "bg-green-600/15 text-green-700 dark:text-green-400" },
] as const;

/** Guias que não vêm do catálogo mas aparecem sempre. */
const GUIAS_EXTRA = ["Parcelamento", "DAS", "Simples Nacional", "IRPJ", "CSLL", "ICMS", "ISS", "PIS/COFINS"];

/** Dias de atraso — só conta enquanto a guia não foi quitada. */
function diasAtraso(vencimento: string | null, status: string, hoje: string): number | null {
  if (!vencimento || status === "pago") return null;
  const dias = calcularDiasAtraso(vencimento, hoje);
  return dias > 0 ? dias : null;
}

export default function Atrasos() {
  const qc = useQueryClient();
  const [filtro, setFiltro] = useState("todos");

  const { data: debitos = [], isLoading } = useListarDebitos(
    filtro === "todos" ? undefined : { status: filtro as never }
  );
  const { data: clientes = [] } = useListarClientes();
  const { data: tipos = [] } = useListarTipos();

  const salvar = useSalvarDebito();
  const atualizar = useAtualizarDebito();
  const remover = useRemoverDebito();

  const [busca, setBusca] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [salvo, setSalvo] = useState(false);
  const [novoCliente, setNovoCliente] = useState("");
  const [novaGuia, setNovaGuia] = useState("");
  const hoje = hojeBR();

  function invalidar() {
    qc.invalidateQueries({ queryKey: getListarDebitosQueryKey() });
  }

  async function comAviso(acao: () => Promise<unknown>) {
    setErro(null);
    try {
      await acao();
      setSalvo(true);
      window.setTimeout(() => setSalvo(false), 1500);
    } catch (e) {
      setErro(
        e instanceof Error && e.message
          ? `Não foi possível salvar: ${e.message}`
          : "Não foi possível salvar. Verifique se o servidor da API está no ar."
      );
    }
  }

  /** Enter confirma (sai do campo e salva); Esc desfaz. */
  function teclas(original: string) {
    return (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") e.currentTarget.blur();
      if (e.key === "Escape") {
        e.currentTarget.value = original;
        e.currentTarget.blur();
      }
    };
  }

  async function salvarCampo(id: number, campo: Campo, bruto: string) {
    // "1.234,56" (pt-BR) → "1234.56", que é o formato do numeric do Postgres.
    const valor = campo === "valor" ? paraDecimalAPI(bruto) : bruto.trim() || null;
    await comAviso(async () => {
      await atualizar.mutateAsync({ id, data: { [campo]: valor } as never });
      invalidar();
    });
  }

  async function mudarStatus(id: number, status: string) {
    await comAviso(async () => {
      await atualizar.mutateAsync({ id, data: { status } as never });
      invalidar();
    });
  }

  async function adicionar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const clienteId = Number(novoCliente);
    const rotulo = novaGuia.trim();
    if (!clienteId || !rotulo) return;
    const tipo = (tipos as { id: number; nome: string }[]).find(
      (t) => t.nome.toLowerCase() === rotulo.toLowerCase()
    );
    await comAviso(async () => {
      await salvar.mutateAsync({
        data: { clienteId, rotulo, tipoObrigacaoId: tipo?.id ?? null } as never,
      });
      setNovaGuia("");
      invalidar();
    });
  }

  const lista = debitos as unknown as Debito[];
  const filtrados = lista.filter((d) => {
    const t = busca.trim().toLowerCase();
    if (!t) return true;
    return [d.clienteNome, d.rotulo, d.competenciaRef, d.observacao].some((v) =>
      (v ?? "").toLowerCase().includes(t)
    );
  });

  // Só o que ainda não foi pago entra no total devido.
  const totalAberto = filtrados
    .filter((d) => d.status !== "pago")
    .reduce((soma, d) => soma + Number(d.valor ?? 0), 0);
  const empresasComAtraso = new Set(
    filtrados.filter((d) => d.status !== "pago").map((d) => d.clienteId)
  ).size;

  const celula = "border-r border-black/10 p-0 dark:border-white/10";
  const entrada =
    "h-9 w-full bg-transparent px-2 text-sm outline-none focus:bg-blue-50 focus:ring-2 focus:ring-inset focus:ring-blue-500 dark:focus:bg-blue-950/40";
  const campoForm =
    "rounded-lg border border-black/15 bg-transparent px-3 py-2 text-sm dark:border-white/15";
  const selectEscuro =
    "rounded-lg border border-black/15 bg-neutral-900 px-3 py-2 text-sm text-white dark:border-white/15";

  const sugestoes = [...(tipos as { nome: string }[]).map((t) => t.nome), ...GUIAS_EXTRA];

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Guias em atraso</h1>
          <p className="text-sm text-neutral-500">
            O que a empresa deve ao fisco — INSS, FGTS, parcelamento…
          </p>
        </div>
        {salvo && <span className="text-xs text-green-600">✓ salvo</span>}
      </div>

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className="rounded-lg border border-black/10 p-3 dark:border-white/10">
          <p className="text-xs text-neutral-500">Total devido</p>
          <p className="text-lg font-semibold text-red-600">{formatarMoeda(totalAberto)}</p>
        </div>
        <div className="rounded-lg border border-black/10 p-3 dark:border-white/10">
          <p className="text-xs text-neutral-500">Empresas com atraso</p>
          <p className="text-lg font-semibold">{empresasComAtraso}</p>
        </div>
        <div className="rounded-lg border border-black/10 p-3 dark:border-white/10">
          <p className="text-xs text-neutral-500">Guias listadas</p>
          <p className="text-lg font-semibold">{filtrados.length}</p>
        </div>
      </div>

      {erro && (
        <p role="alert" className="mb-3 rounded-lg bg-red-600/10 px-3 py-2 text-sm text-red-700 dark:text-red-400">
          {erro}
        </p>
      )}

      <form onSubmit={adicionar} className="mb-4 flex flex-wrap items-center gap-2">
        <select value={novoCliente} onChange={(e) => setNovoCliente(e.target.value)} required
          className={selectEscuro} aria-label="Empresa">
          <option value="" className="bg-neutral-900 text-white">Empresa…</option>
          {(clientes as { id: number; razaoSocial: string }[]).map((c) => (
            <option key={c.id} value={c.id} className="bg-neutral-900 text-white">
              {c.razaoSocial}
            </option>
          ))}
        </select>
        <input value={novaGuia} onChange={(e) => setNovaGuia(e.target.value)} name="novaGuia"
          list="guias" placeholder="Guia (ex: INSS)" className={`${campoForm} w-56`} />
        <datalist id="guias">
          {sugestoes.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
        <button type="submit" disabled={!novoCliente || !novaGuia.trim()}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
          + Registrar atraso
        </button>
        <input value={busca} onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar por empresa, guia ou competência…"
          className={`ml-auto w-full ${campoForm} sm:w-72`} />
      </form>

      <div className="mb-4 flex flex-wrap gap-2">
        {[{ valor: "todos", rotulo: "Todos" }, ...STATUS].map((s) => (
          <button key={s.valor} onClick={() => setFiltro(s.valor)}
            className={`rounded-lg px-3 py-1.5 text-sm ${
              filtro === s.valor
                ? "bg-blue-600 text-white"
                : "border border-black/15 text-neutral-700 dark:border-white/15 dark:text-neutral-300"
            }`}>
            {s.rotulo}
          </button>
        ))}
      </div>

      {isLoading ? (
        <p className="text-sm text-neutral-500">Carregando...</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-black/10 dark:border-white/10">
          <table className="w-full text-left text-sm">
            <thead className="bg-neutral-100 dark:bg-neutral-900">
              <tr>
                <th className={`w-56 px-2 py-2 font-medium ${celula}`}>Empresa</th>
                <th className={`w-40 px-2 py-2 font-medium ${celula}`}>Guia</th>
                <th className={`w-32 px-2 py-2 font-medium ${celula}`}>Competência</th>
                <th className={`w-36 px-2 py-2 font-medium ${celula}`}>Vencimento</th>
                <th className={`w-28 px-2 py-2 font-medium ${celula}`}>Valor</th>
                <th className={`w-36 px-2 py-2 font-medium ${celula}`}>Situação</th>
                <th className={`px-2 py-2 font-medium ${celula}`}>Observação</th>
                <th className="w-10" />
              </tr>
            </thead>
            <tbody className="divide-y divide-black/10 dark:divide-white/10">
              {filtrados.map((d) => {
                const atraso = diasAtraso(d.vencimento, d.status, hoje);
                return (
                  <tr key={d.id} className={d.status === "pago" ? "opacity-60" : ""}>
                    <td className={`w-56 px-2 py-2 font-medium ${celula}`}>{d.clienteNome}</td>
                    <td className={`w-40 ${celula}`}>
                      <input name="rotulo" defaultValue={d.rotulo} onKeyDown={teclas(d.rotulo)}
                        onBlur={(e) => {
                          const v = e.target.value.trim();
                          if (!v) {
                            e.target.value = d.rotulo;
                            return;
                          }
                          if (v !== d.rotulo) salvarCampo(d.id, "rotulo", v);
                        }}
                        className={entrada} />
                    </td>
                    <td className={`w-32 ${celula}`}>
                      <input name="competenciaRef" defaultValue={d.competenciaRef ?? ""}
                        placeholder="05/2026" onKeyDown={teclas(d.competenciaRef ?? "")}
                        onBlur={(e) =>
                          e.target.value !== (d.competenciaRef ?? "") &&
                          salvarCampo(d.id, "competenciaRef", e.target.value)
                        }
                        className={entrada} />
                    </td>
                    <td className={`w-36 ${celula}`}>
                      <input type="date" name="vencimento" defaultValue={d.vencimento ?? ""}
                        onBlur={(e) =>
                          e.target.value !== (d.vencimento ?? "") &&
                          salvarCampo(d.id, "vencimento", e.target.value)
                        }
                        className={`${entrada} ${atraso ? "font-medium text-red-600" : ""}`} />
                      {atraso && (
                        <p className="px-2 pb-1 text-xs text-red-600">{atraso} dia(s)</p>
                      )}
                    </td>
                    <td className={`w-28 ${celula}`}>
                      <input name="valor" defaultValue={formatarNumeroBR(d.valor)} placeholder="0,00"
                        onKeyDown={teclas(formatarNumeroBR(d.valor))}
                        onBlur={(e) =>
                          paraDecimalAPI(e.target.value) !== (d.valor ?? null) &&
                          salvarCampo(d.id, "valor", e.target.value)
                        }
                        className={entrada} />
                    </td>
                    <td className={`w-36 px-2 py-1 ${celula}`}>
                      <select name="status" aria-label={`Situação de ${d.rotulo} de ${d.clienteNome}`}
                        value={d.status} onChange={(e) => mudarStatus(d.id, e.target.value)}
                        className="h-8 w-full rounded bg-neutral-900 px-1 text-xs text-white outline-none">
                        {STATUS.map((s) => (
                          <option key={s.valor} value={s.valor} className="bg-neutral-900 text-white">
                            {s.rotulo}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className={celula}>
                      <input name="observacao" defaultValue={d.observacao ?? ""}
                        onKeyDown={teclas(d.observacao ?? "")}
                        onBlur={(e) =>
                          e.target.value !== (d.observacao ?? "") &&
                          salvarCampo(d.id, "observacao", e.target.value)
                        }
                        className={entrada} />
                    </td>
                    <td className="w-10 px-2 py-2 text-center">
                      <button title="Remover registro"
                        onClick={() =>
                          comAviso(async () => {
                            await remover.mutateAsync({ id: d.id });
                            invalidar();
                          })
                        }
                        className="text-neutral-400 hover:text-red-600">
                        ✕
                      </button>
                    </td>
                  </tr>
                );
              })}
              {filtrados.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-3 py-8 text-center text-neutral-500">
                    Nenhuma guia em atraso registrada.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <p className="mt-3 text-xs text-neutral-500">
        Marcar como <strong>Pago</strong> tira a guia do total devido, mas mantém o histórico na lista.
        Datas de vencimento vencidas aparecem em vermelho com os dias de atraso.
      </p>
    </div>
  );
}
