import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  getListarDespesasQueryKey,
  useAtualizarDespesa,
  useListarClientes,
  useListarDespesas,
  useRemoverDespesa,
  useSalvarDespesa,
} from "@workspace/api-client-react";
import type { Despesa } from "@workspace/api-client-react";
import { MESES, formatarMoeda, formatarNumeroBR, hojeBR, mesAtualBR, paraDecimalAPI } from "@/lib/formato";

/** Categorias que quase todo escritório usa — o campo aceita qualquer outra. */
const CATEGORIAS = [
  "Aluguel",
  "Energia",
  "Água",
  "Telefone / Internet",
  "Sistemas e software",
  "Material de escritório",
  "Salários",
  "Pró-labore",
  "Impostos",
  "Contador / terceiros",
  "Transporte",
  "Manutenção",
  "Outros",
];

const FORMAS = ["Pix", "Boleto", "Débito automático", "Cartão", "Dinheiro", "Transferência"];

type Escopo = "escritorio" | "clientes" | "todos";
type Campo = "data" | "categoria" | "descricao" | "valor" | "vencimento" | "formaPagamento";

const HOJE = mesAtualBR();

export default function Despesas() {
  const qc = useQueryClient();
  const [escopo, setEscopo] = useState<Escopo>("escritorio");
  const [ano, setAno] = useState(HOJE.ano);
  const [mes, setMes] = useState(HOJE.mes);
  const [soAbertas, setSoAbertas] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [salvo, setSalvo] = useState(false);

  const params = { escopo, ano, mes } as const;
  const { data: despesas = [], isLoading } = useListarDespesas(params);
  const { data: clientes = [] } = useListarClientes();

  const salvar = useSalvarDespesa();
  const atualizar = useAtualizarDespesa();
  const remover = useRemoverDespesa();

  const [novo, setNovo] = useState({
    clienteId: "",
    data: hojeBR(),
    categoria: "",
    descricao: "",
    valor: "",
    formaPagamento: "",
    pago: false,
  });

  function invalidar() {
    // Sem params: invalida a lista de qualquer mês/escopo já em cache.
    qc.invalidateQueries({ queryKey: getListarDespesasQueryKey() });
  }

  async function comAviso(acao: () => Promise<unknown>) {
    setErro(null);
    try {
      await acao();
      setSalvo(true);
      window.setTimeout(() => setSalvo(false), 1500);
    } catch (e) {
      setErro(e instanceof Error && e.message ? e.message : "Não foi possível salvar.");
    }
  }

  async function salvarCampo(id: number, campo: Campo, bruto: string) {
    const valor = campo === "valor" ? paraDecimalAPI(bruto) : bruto.trim() || null;
    await comAviso(async () => {
      await atualizar.mutateAsync({ id, data: { [campo]: valor } as never });
      invalidar();
    });
  }

  async function alternarPago(d: Despesa) {
    await comAviso(async () => {
      await atualizar.mutateAsync({ id: d.id, data: { pago: !d.pago } as never });
      invalidar();
    });
  }

  async function adicionar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!novo.categoria.trim() || !novo.descricao.trim() || !novo.valor.trim()) return;
    await comAviso(async () => {
      await salvar.mutateAsync({
        data: {
          clienteId: novo.clienteId ? Number(novo.clienteId) : null,
          data: novo.data,
          categoria: novo.categoria.trim(),
          descricao: novo.descricao.trim(),
          valor: paraDecimalAPI(novo.valor) ?? "0",
          formaPagamento: novo.formaPagamento.trim() || null,
          pago: novo.pago,
        } as never,
      });
      setNovo((n) => ({ ...n, categoria: "", descricao: "", valor: "" }));
      invalidar();
    });
  }

  async function excluir(d: Despesa) {
    if (!window.confirm(`Excluir "${d.descricao}"?`)) return;
    await comAviso(async () => {
      await remover.mutateAsync({ id: d.id });
      invalidar();
    });
  }

  const lista = despesas as Despesa[];
  const filtradas = soAbertas ? lista.filter((d) => !d.pago) : lista;

  const { total, aberto, porCategoria } = useMemo(() => {
    const soma = (linhas: Despesa[]) =>
      linhas.reduce((s, d) => s + Number(d.valor ?? 0), 0);
    const mapa = new Map<string, number>();
    for (const d of filtradas) {
      mapa.set(d.categoria, (mapa.get(d.categoria) ?? 0) + Number(d.valor ?? 0));
    }
    return {
      total: soma(filtradas),
      aberto: soma(filtradas.filter((d) => !d.pago)),
      porCategoria: [...mapa.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4),
    };
  }, [filtradas]);

  const celula = "border-r border-black/10 p-0 dark:border-white/10";
  const entrada =
    "h-9 w-full bg-transparent px-2 text-sm outline-none focus:bg-blue-50 focus:ring-2 focus:ring-inset focus:ring-blue-500 dark:focus:bg-blue-950/40";
  const campoForm =
    "rounded-lg border border-black/15 bg-transparent px-3 py-2 text-sm dark:border-white/15";
  const selectEscuro =
    "rounded-lg border border-black/15 bg-neutral-900 px-3 py-2 text-sm text-white dark:border-white/15";

  const anos = Array.from({ length: 6 }, (_, i) => HOJE.ano - 3 + i);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Despesas</h1>
          <p className="text-sm text-neutral-500">
            Os gastos do escritório e os que você acompanha para os clientes.
          </p>
        </div>
        {salvo && <span className="text-xs text-green-600">✓ salvo</span>}
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {(
          [
            { valor: "escritorio", rotulo: "Do escritório" },
            { valor: "clientes", rotulo: "Dos clientes" },
            { valor: "todos", rotulo: "Todos" },
          ] as const
        ).map((o) => (
          <button
            key={o.valor}
            onClick={() => setEscopo(o.valor)}
            className={`rounded-lg px-3 py-1.5 text-sm ${
              escopo === o.valor
                ? "bg-blue-600 text-white"
                : "border border-black/15 text-neutral-700 dark:border-white/15 dark:text-neutral-300"
            }`}
          >
            {o.rotulo}
          </button>
        ))}

        <select
          value={mes}
          onChange={(e) => setMes(Number(e.target.value))}
          className={`${selectEscuro} ml-2`}
          aria-label="Mês"
        >
          {MESES.map((nome, i) => (
            <option key={nome} value={i + 1} className="bg-neutral-900 text-white">
              {nome}
            </option>
          ))}
        </select>
        <select
          value={ano}
          onChange={(e) => setAno(Number(e.target.value))}
          className={selectEscuro}
          aria-label="Ano"
        >
          {anos.map((a) => (
            <option key={a} value={a} className="bg-neutral-900 text-white">
              {a}
            </option>
          ))}
        </select>

        <label className="ml-2 flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={soAbertas}
            onChange={(e) => setSoAbertas(e.target.checked)}
            className="size-4"
          />
          Só as não pagas
        </label>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-lg border border-black/10 p-3 dark:border-white/10">
          <p className="text-xs text-neutral-500">Total do mês</p>
          <p className="text-lg font-semibold">{formatarMoeda(total)}</p>
        </div>
        <div className="rounded-lg border border-black/10 p-3 dark:border-white/10">
          <p className="text-xs text-neutral-500">Ainda a pagar</p>
          <p className="text-lg font-semibold text-red-600">{formatarMoeda(aberto)}</p>
        </div>
        <div className="col-span-2 rounded-lg border border-black/10 p-3 dark:border-white/10">
          <p className="text-xs text-neutral-500">Maiores categorias</p>
          <p className="truncate text-sm" title={porCategoria.map(([c]) => c).join(", ")}>
            {porCategoria.length
              ? porCategoria.map(([c, v]) => `${c}: ${formatarMoeda(v)}`).join(" · ")
              : "—"}
          </p>
        </div>
      </div>

      {erro && (
        <p role="alert" className="mb-3 rounded-lg bg-red-600/10 px-3 py-2 text-sm text-red-700 dark:text-red-400">
          {erro}
        </p>
      )}

      <form onSubmit={adicionar} className="mb-4 flex flex-wrap items-center gap-2">
        <select
          value={novo.clienteId}
          onChange={(e) => setNovo((n) => ({ ...n, clienteId: e.target.value }))}
          className={selectEscuro}
          aria-label="De quem é o gasto"
        >
          <option value="" className="bg-neutral-900 text-white">
            Do escritório
          </option>
          {(clientes as { id: number; razaoSocial: string }[]).map((c) => (
            <option key={c.id} value={c.id} className="bg-neutral-900 text-white">
              {c.razaoSocial}
            </option>
          ))}
        </select>
        <input
          type="date"
          value={novo.data}
          onChange={(e) => setNovo((n) => ({ ...n, data: e.target.value }))}
          className={campoForm}
          aria-label="Data"
        />
        <input
          value={novo.categoria}
          onChange={(e) => setNovo((n) => ({ ...n, categoria: e.target.value }))}
          list="categorias"
          placeholder="Categoria"
          className={`${campoForm} w-44`}
          aria-label="Categoria"
        />
        <datalist id="categorias">
          {CATEGORIAS.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
        <input
          value={novo.descricao}
          onChange={(e) => setNovo((n) => ({ ...n, descricao: e.target.value }))}
          placeholder="Descrição"
          className={`${campoForm} w-56`}
          aria-label="Descrição"
        />
        <input
          value={novo.valor}
          onChange={(e) => setNovo((n) => ({ ...n, valor: e.target.value }))}
          placeholder="Valor"
          inputMode="decimal"
          className={`${campoForm} w-28`}
          aria-label="Valor"
        />
        <input
          value={novo.formaPagamento}
          onChange={(e) => setNovo((n) => ({ ...n, formaPagamento: e.target.value }))}
          list="formas"
          placeholder="Pagamento"
          className={`${campoForm} w-36`}
          aria-label="Forma de pagamento"
        />
        <datalist id="formas">
          {FORMAS.map((f) => (
            <option key={f} value={f} />
          ))}
        </datalist>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={novo.pago}
            onChange={(e) => setNovo((n) => ({ ...n, pago: e.target.checked }))}
            className="size-4"
          />
          Já pago
        </label>
        <button
          type="submit"
          disabled={!novo.categoria.trim() || !novo.descricao.trim() || !novo.valor.trim()}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          + Lançar gasto
        </button>
      </form>

      {isLoading ? (
        <p className="text-sm text-neutral-500">Carregando...</p>
      ) : filtradas.length === 0 ? (
        <p className="rounded-xl border border-dashed border-black/15 p-8 text-center text-sm text-neutral-500 dark:border-white/15">
          Nenhum gasto lançado neste mês.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-black/10 dark:border-white/10">
          <table className="w-full text-left text-sm">
            <thead className="bg-neutral-100 dark:bg-neutral-900">
              <tr>
                <th className="p-2 font-medium">Data</th>
                <th className="p-2 font-medium">De quem</th>
                <th className="p-2 font-medium">Categoria</th>
                <th className="p-2 font-medium">Descrição</th>
                <th className="p-2 text-right font-medium">Valor</th>
                <th className="p-2 font-medium">Pagamento</th>
                <th className="p-2 font-medium">Pago</th>
                <th className="p-2" />
              </tr>
            </thead>
            <tbody>
              {filtradas.map((d) => (
                <tr key={d.id} className="border-t border-black/10 dark:border-white/10">
                  <td className={celula}>
                    <input
                      type="date"
                      name="data"
                      defaultValue={d.data?.slice(0, 10) ?? ""}
                      onBlur={(e) => salvarCampo(d.id, "data", e.target.value)}
                      className={`${entrada} w-36`}
                      aria-label={`Data de ${d.descricao}`}
                    />
                  </td>
                  <td className="border-r border-black/10 p-2 dark:border-white/10">
                    {d.clienteNome ?? (
                      <span className="text-neutral-500">Escritório</span>
                    )}
                  </td>
                  <td className={celula}>
                    <input
                      name="categoria"
                      defaultValue={d.categoria}
                      list="categorias"
                      onBlur={(e) => salvarCampo(d.id, "categoria", e.target.value)}
                      className={entrada}
                      aria-label={`Categoria de ${d.descricao}`}
                    />
                  </td>
                  <td className={celula}>
                    <input
                      name="descricao"
                      defaultValue={d.descricao}
                      onBlur={(e) => salvarCampo(d.id, "descricao", e.target.value)}
                      className={entrada}
                      aria-label={`Descrição de ${d.descricao}`}
                    />
                  </td>
                  <td className={celula}>
                    <input
                      name="valor"
                      defaultValue={formatarNumeroBR(d.valor)}
                      onBlur={(e) => salvarCampo(d.id, "valor", e.target.value)}
                      inputMode="decimal"
                      className={`${entrada} text-right`}
                      aria-label={`Valor de ${d.descricao}`}
                    />
                  </td>
                  <td className={celula}>
                    <input
                      name="formaPagamento"
                      defaultValue={d.formaPagamento ?? ""}
                      list="formas"
                      onBlur={(e) => salvarCampo(d.id, "formaPagamento", e.target.value)}
                      className={entrada}
                      aria-label={`Forma de pagamento de ${d.descricao}`}
                    />
                  </td>
                  <td className="border-r border-black/10 p-2 text-center dark:border-white/10">
                    <button
                      type="button"
                      onClick={() => alternarPago(d)}
                      aria-label={`${d.pago ? "Pago" : "Em aberto"} — ${d.descricao}`}
                      className={`rounded-lg px-2 py-1 text-xs ${
                        d.pago
                          ? "bg-green-600/15 text-green-700 dark:text-green-400"
                          : "bg-amber-600/15 text-amber-700 dark:text-amber-400"
                      }`}
                    >
                      {d.pago ? "Pago" : "Em aberto"}
                    </button>
                  </td>
                  <td className="p-2 text-right">
                    <button
                      type="button"
                      onClick={() => excluir(d)}
                      aria-label={`Excluir ${d.descricao}`}
                      className="rounded px-2 py-1 text-xs text-red-600 hover:bg-red-600/10"
                    >
                      Excluir
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
