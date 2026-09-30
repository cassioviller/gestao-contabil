import { useState } from "react";
import { Link, useRoute } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  getGetFuncionarioQueryKey,
  useAtualizarFuncionario,
  useGetFuncionario,
  useRemoverFerias,
  useRemoverLancamentoFolha,
  useSalvarFerias,
  useSalvarLancamentoFolha,
} from "@workspace/api-client-react";
import type {
  FichaFuncionario,
  LancamentoFolha,
  PeriodoFerias,
} from "@workspace/api-client-react";
import { MESES, formatarData, formatarMoeda, formatarNumeroBR, hojeBR, mesAtualBR, nomeMes, paraDecimalAPI } from "@/lib/formato";
import { TIPOS_FOLHA, liquidoSugerido, rotuloTipoFolha } from "@/lib/pessoal";

/** Campos do cadastro completo — o que a lista não mostra fica aqui. */
const FICHA = [
  { nome: "cpf", rotulo: "CPF" },
  { nome: "rg", rotulo: "RG" },
  { nome: "pis", rotulo: "PIS" },
  { nome: "ctps", rotulo: "CTPS" },
  { nome: "nascimento", rotulo: "Nascimento", tipo: "date" },
  { nome: "cargo", rotulo: "Cargo" },
  { nome: "admissao", rotulo: "Admissão", tipo: "date" },
  { nome: "demissao", rotulo: "Demissão", tipo: "date" },
  { nome: "telefone", rotulo: "Telefone" },
  { nome: "email", rotulo: "E-mail" },
  { nome: "endereco", rotulo: "Endereço" },
  { nome: "observacao", rotulo: "Observação" },
] as const;

const VALORES_FOLHA = [
  { nome: "salarioBase", rotulo: "Base" },
  { nome: "proventos", rotulo: "Proventos" },
  { nome: "descontos", rotulo: "Descontos" },
  { nome: "inss", rotulo: "INSS" },
  { nome: "fgts", rotulo: "FGTS" },
  { nome: "irrf", rotulo: "IRRF" },
] as const;

const HOJE = mesAtualBR();
const paraNumero = paraDecimalAPI;
const emReais = formatarNumeroBR;

export default function FuncionarioDetalhe() {
  const [, params] = useRoute("/funcionarios/:id");
  const id = Number(params?.id);
  const qc = useQueryClient();

  const { data, isLoading } = useGetFuncionario(id, {
    // `enabled` sem `queryKey` não passa no tipo do hook gerado; a chave é a
    // mesma que o invalidar usa depois de cada gravação.
    query: { queryKey: getGetFuncionarioQueryKey(id), enabled: Number.isFinite(id) },
  });
  const atualizar = useAtualizarFuncionario();
  const salvarFolha = useSalvarLancamentoFolha();
  const removerFolha = useRemoverLancamentoFolha();
  const salvarFerias = useSalvarFerias();
  const removerFerias = useRemoverFerias();

  const [erro, setErro] = useState<string | null>(null);
  const [salvo, setSalvo] = useState(false);
  const [novoLanc, setNovoLanc] = useState({
    ano: String(HOJE.ano),
    mes: String(HOJE.mes),
    tipo: "mensal",
    salarioBase: "",
  });
  const [novasFerias, setNovasFerias] = useState({
    aquisitivoInicio: "",
    aquisitivoFim: "",
    gozoInicio: "",
    gozoFim: "",
  });

  function invalidar() {
    qc.invalidateQueries({ queryKey: getGetFuncionarioQueryKey(id) });
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

  if (isLoading) return <p className="text-sm text-neutral-500">Carregando...</p>;
  if (!data) return <p className="text-sm text-neutral-500">Funcionário não encontrado.</p>;

  const ficha = data as FichaFuncionario;
  const f = ficha.funcionario;
  const folha = ficha.folha as LancamentoFolha[];
  const periodos = ficha.ferias as PeriodoFerias[];

  async function salvarCampo(campo: string, bruto: string) {
    const valor = campo === "salario" ? paraNumero(bruto) : bruto.trim() || null;
    await comAviso(async () => {
      await atualizar.mutateAsync({ id, data: { [campo]: valor } as never });
      invalidar();
    });
  }

  async function salvarValorFolha(lanc: LancamentoFolha, campo: string, bruto: string) {
    await comAviso(async () => {
      await salvarFolha.mutateAsync({
        data: {
          id: lanc.id,
          funcionarioId: lanc.funcionarioId,
          ano: lanc.ano,
          mes: lanc.mes,
          tipo: lanc.tipo,
          [campo]: paraNumero(bruto),
        } as never,
      });
      invalidar();
    });
  }

  async function alternarPagoFolha(lanc: LancamentoFolha) {
    await comAviso(async () => {
      await salvarFolha.mutateAsync({
        data: {
          id: lanc.id,
          funcionarioId: lanc.funcionarioId,
          ano: lanc.ano,
          mes: lanc.mes,
          tipo: lanc.tipo,
          pago: !lanc.pago,
          pagoEm: !lanc.pago ? hojeBR() : null,
        } as never,
      });
      invalidar();
    });
  }

  async function adicionarLancamento(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    await comAviso(async () => {
      await salvarFolha.mutateAsync({
        data: {
          funcionarioId: id,
          ano: Number(novoLanc.ano),
          mes: Number(novoLanc.mes),
          tipo: novoLanc.tipo,
          // Sem valor digitado, o salário do cadastro entra como base — é o que
          // acontece na maioria dos meses.
          salarioBase: paraNumero(novoLanc.salarioBase) ?? f.salario ?? null,
        } as never,
      });
      setNovoLanc((n) => ({ ...n, salarioBase: "" }));
      invalidar();
    });
  }

  async function adicionarFerias(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!novasFerias.aquisitivoInicio || !novasFerias.aquisitivoFim) return;
    await comAviso(async () => {
      await salvarFerias.mutateAsync({
        data: {
          funcionarioId: id,
          aquisitivoInicio: novasFerias.aquisitivoInicio,
          aquisitivoFim: novasFerias.aquisitivoFim,
          gozoInicio: novasFerias.gozoInicio || null,
          gozoFim: novasFerias.gozoFim || null,
        } as never,
      });
      setNovasFerias({ aquisitivoInicio: "", aquisitivoFim: "", gozoInicio: "", gozoFim: "" });
      invalidar();
    });
  }

  const entrada =
    "h-9 w-full rounded-lg border border-black/15 bg-transparent px-2 text-sm dark:border-white/15";
  const entradaCelula =
    "h-9 w-24 bg-transparent px-2 text-right text-sm outline-none focus:bg-blue-50 focus:ring-2 focus:ring-inset focus:ring-blue-500 dark:focus:bg-blue-950/40";
  const campoForm =
    "rounded-lg border border-black/15 bg-transparent px-3 py-2 text-sm dark:border-white/15";
  const selectEscuro =
    "rounded-lg border border-black/15 bg-neutral-900 px-3 py-2 text-sm text-white dark:border-white/15";

  const totalPago = folha
    .filter((l) => l.pago)
    .reduce((s, l) => s + (Number(l.liquido ?? 0) || liquidoSugerido(l)), 0);

  return (
    <div>
      <Link href="/funcionarios" className="text-sm text-blue-600 hover:underline">
        ← Funcionários
      </Link>

      <div className="mt-2 mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{f.nome}</h1>
          <p className="text-sm text-neutral-500">
            {f.cargo ?? "Sem cargo"} ·{" "}
            {f.clienteNome ?? "Funcionário do escritório"} · salário{" "}
            {formatarMoeda(f.salario)}
          </p>
        </div>
        {salvo && <span className="text-xs text-green-600">✓ salvo</span>}
      </div>

      {erro && (
        <p role="alert" className="mb-4 rounded-lg bg-red-600/10 px-3 py-2 text-sm text-red-700 dark:text-red-400">
          {erro}
        </p>
      )}

      <section className="mb-8">
        <h2 className="mb-3 text-lg font-semibold">Cadastro</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          <label>
            <span className="mb-1 block text-xs text-neutral-500">Salário</span>
            <input
              defaultValue={emReais(f.salario)}
              onBlur={(e) => salvarCampo("salario", e.target.value)}
              inputMode="decimal"
              className={entrada}
              aria-label="Salário"
            />
          </label>
          {FICHA.map((c) => (
            <label key={c.nome}>
              <span className="mb-1 block text-xs text-neutral-500">{c.rotulo}</span>
              <input
                type={"tipo" in c ? c.tipo : "text"}
                defaultValue={
                  ("tipo" in c && c.tipo === "date"
                    ? (f[c.nome] as string | null)?.slice(0, 10)
                    : (f[c.nome] as string | null)) ?? ""
                }
                onBlur={(e) => salvarCampo(c.nome, e.target.value)}
                className={entrada}
                aria-label={c.rotulo}
              />
            </label>
          ))}
        </div>
      </section>

      <section className="mb-8">
        <div className="mb-3 flex items-end justify-between gap-3">
          <h2 className="text-lg font-semibold">Folha mês a mês</h2>
          <p className="text-sm text-neutral-500">
            Pago até agora: <strong>{formatarMoeda(totalPago)}</strong>
          </p>
        </div>

        <form onSubmit={adicionarLancamento} className="mb-3 flex flex-wrap items-center gap-2">
          <select
            value={novoLanc.mes}
            onChange={(e) => setNovoLanc((n) => ({ ...n, mes: e.target.value }))}
            className={selectEscuro}
            aria-label="Mês do lançamento"
          >
            {MESES.map((nome, i) => (
              <option key={nome} value={i + 1} className="bg-neutral-900 text-white">
                {nome}
              </option>
            ))}
          </select>
          <input
            value={novoLanc.ano}
            onChange={(e) => setNovoLanc((n) => ({ ...n, ano: e.target.value }))}
            className={`${campoForm} w-24`}
            inputMode="numeric"
            aria-label="Ano do lançamento"
          />
          <select
            value={novoLanc.tipo}
            onChange={(e) => setNovoLanc((n) => ({ ...n, tipo: e.target.value }))}
            className={selectEscuro}
            aria-label="Tipo do lançamento"
          >
            {TIPOS_FOLHA.map((t) => (
              <option key={t.valor} value={t.valor} className="bg-neutral-900 text-white">
                {t.rotulo}
              </option>
            ))}
          </select>
          <input
            value={novoLanc.salarioBase}
            onChange={(e) => setNovoLanc((n) => ({ ...n, salarioBase: e.target.value }))}
            placeholder={`Base (padrão ${emReais(f.salario) || "0,00"})`}
            inputMode="decimal"
            className={`${campoForm} w-48`}
            aria-label="Base do lançamento"
          />
          <button
            type="submit"
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            + Lançar mês
          </button>
        </form>

        {folha.length === 0 ? (
          <p className="rounded-xl border border-dashed border-black/15 p-6 text-center text-sm text-neutral-500 dark:border-white/15">
            Nenhum mês lançado ainda.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-black/10 dark:border-white/10">
            <table className="w-full text-left text-sm">
              <thead className="bg-neutral-100 dark:bg-neutral-900">
                <tr>
                  <th className="p-2 font-medium">Mês</th>
                  <th className="p-2 font-medium">Tipo</th>
                  {VALORES_FOLHA.map((v) => (
                    <th key={v.nome} className="p-2 text-right font-medium">
                      {v.rotulo}
                    </th>
                  ))}
                  <th className="p-2 text-right font-medium">Líquido</th>
                  <th className="p-2 font-medium">Pago</th>
                  <th className="p-2" />
                </tr>
              </thead>
              <tbody>
                {folha.map((l) => (
                  <tr key={l.id} className="border-t border-black/10 dark:border-white/10">
                    <td className="p-2 whitespace-nowrap">
                      {nomeMes(l.mes)}/{l.ano}
                    </td>
                    <td className="p-2 whitespace-nowrap">{rotuloTipoFolha(l.tipo)}</td>
                    {VALORES_FOLHA.map((v) => (
                      <td key={v.nome} className="p-0 text-right">
                        <input
                          defaultValue={emReais(l[v.nome] as string | null)}
                          onBlur={(e) => salvarValorFolha(l, v.nome, e.target.value)}
                          inputMode="decimal"
                          className={entradaCelula}
                          aria-label={`${v.rotulo} de ${nomeMes(l.mes)}/${l.ano}`}
                        />
                      </td>
                    ))}
                    <td className="p-0 text-right">
                      <input
                        defaultValue={emReais(l.liquido) || formatarNumeroBR(liquidoSugerido(l))}
                        onBlur={(e) => salvarValorFolha(l, "liquido", e.target.value)}
                        inputMode="decimal"
                        className={`${entradaCelula} font-medium`}
                        aria-label={`Líquido de ${nomeMes(l.mes)}/${l.ano}`}
                      />
                    </td>
                    <td className="p-2">
                      <button
                        type="button"
                        onClick={() => alternarPagoFolha(l)}
                        aria-label={`${l.pago ? "Pago" : "Em aberto"} — ${nomeMes(l.mes)}/${l.ano}`}
                        className={`rounded-lg px-2 py-1 text-xs ${
                          l.pago
                            ? "bg-green-600/15 text-green-700 dark:text-green-400"
                            : "bg-amber-600/15 text-amber-700 dark:text-amber-400"
                        }`}
                      >
                        {l.pago ? "Pago" : "Em aberto"}
                      </button>
                    </td>
                    <td className="p-2 text-right">
                      <button
                        type="button"
                        onClick={() =>
                          comAviso(async () => {
                            await removerFolha.mutateAsync({ id: l.id });
                            invalidar();
                          })
                        }
                        aria-label={`Excluir lançamento de ${nomeMes(l.mes)}/${l.ano}`}
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
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold">Férias</h2>

        <form onSubmit={adicionarFerias} className="mb-3 flex flex-wrap items-end gap-2">
          <label className="text-xs text-neutral-500">
            Aquisitivo — início
            <input
              type="date"
              value={novasFerias.aquisitivoInicio}
              onChange={(e) =>
                setNovasFerias((v) => ({ ...v, aquisitivoInicio: e.target.value }))
              }
              className={`${campoForm} mt-1 block`}
              required
            />
          </label>
          <label className="text-xs text-neutral-500">
            Aquisitivo — fim
            <input
              type="date"
              value={novasFerias.aquisitivoFim}
              onChange={(e) => setNovasFerias((v) => ({ ...v, aquisitivoFim: e.target.value }))}
              className={`${campoForm} mt-1 block`}
              required
            />
          </label>
          <label className="text-xs text-neutral-500">
            Gozo — início
            <input
              type="date"
              value={novasFerias.gozoInicio}
              onChange={(e) => setNovasFerias((v) => ({ ...v, gozoInicio: e.target.value }))}
              className={`${campoForm} mt-1 block`}
            />
          </label>
          <label className="text-xs text-neutral-500">
            Gozo — fim
            <input
              type="date"
              value={novasFerias.gozoFim}
              onChange={(e) => setNovasFerias((v) => ({ ...v, gozoFim: e.target.value }))}
              className={`${campoForm} mt-1 block`}
            />
          </label>
          <button
            type="submit"
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            + Período
          </button>
        </form>

        {periodos.length === 0 ? (
          <p className="rounded-xl border border-dashed border-black/15 p-6 text-center text-sm text-neutral-500 dark:border-white/15">
            Nenhum período aquisitivo registrado.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-black/10 dark:border-white/10">
            <table className="w-full text-left text-sm">
              <thead className="bg-neutral-100 dark:bg-neutral-900">
                <tr>
                  <th className="p-2 font-medium">Período aquisitivo</th>
                  <th className="p-2 font-medium">Gozo</th>
                  <th className="p-2 font-medium">Conceder até</th>
                  <th className="p-2 font-medium">Situação</th>
                  <th className="p-2" />
                </tr>
              </thead>
              <tbody>
                {periodos.map((p) => (
                  <tr key={p.id} className="border-t border-black/10 dark:border-white/10">
                    <td className="p-2 whitespace-nowrap">
                      {formatarData(p.aquisitivoInicio)} a {formatarData(p.aquisitivoFim)}
                    </td>
                    <td className="p-2 whitespace-nowrap">
                      {p.gozoInicio
                        ? `${formatarData(p.gozoInicio)} a ${formatarData(p.gozoFim)}`
                        : "—"}
                    </td>
                    <td className="p-2 whitespace-nowrap">{formatarData(p.limiteGozo)}</td>
                    <td className="p-2">
                      {p.gozoInicio ? (
                        <span className="rounded-lg bg-green-600/15 px-2 py-1 text-xs text-green-700 dark:text-green-400">
                          Gozadas
                        </span>
                      ) : p.vencendo ? (
                        <span className="rounded-lg bg-red-600/15 px-2 py-1 text-xs text-red-700 dark:text-red-400">
                          ⚠ Vencendo
                        </span>
                      ) : (
                        <span className="rounded-lg bg-neutral-500/15 px-2 py-1 text-xs">
                          A vencer
                        </span>
                      )}
                    </td>
                    <td className="p-2 text-right">
                      <button
                        type="button"
                        onClick={() =>
                          comAviso(async () => {
                            await removerFerias.mutateAsync({ id: p.id });
                            invalidar();
                          })
                        }
                        aria-label={`Excluir período de ${formatarData(p.aquisitivoInicio)}`}
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
      </section>
    </div>
  );
}
