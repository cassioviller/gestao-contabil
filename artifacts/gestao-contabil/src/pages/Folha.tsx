import { useState } from "react";
import { Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  getListarFolhaQueryKey,
  useListarFolha,
  useListarFuncionarios,
  useSalvarLancamentoFolha,
} from "@workspace/api-client-react";
import type { Funcionario, LancamentoFolha } from "@workspace/api-client-react";
import { MESES, formatarMoeda, formatarNumeroBR, mesAtualBR, paraDecimalAPI } from "@/lib/formato";
import { liquidoSugerido, rotuloTipoFolha } from "@/lib/pessoal";

type Escopo = "escritorio" | "clientes" | "todos";

const HOJE = mesAtualBR();
const emReais = formatarNumeroBR;

export default function Folha() {
  const qc = useQueryClient();
  const [escopo, setEscopo] = useState<Escopo>("escritorio");
  const [ano, setAno] = useState(HOJE.ano);
  const [mes, setMes] = useState(HOJE.mes);
  const [erro, setErro] = useState<string | null>(null);
  const [salvo, setSalvo] = useState(false);

  const { data: lancamentos = [], isLoading } = useListarFolha({ ano, mes, escopo });
  // Só quem está trabalhando entra na folha do mês; demitido continua visível
  // na tela de Funcionários, mas não gera linha aqui.
  const { data: funcionarios = [] } = useListarFuncionarios({ escopo });
  const salvarLanc = useSalvarLancamentoFolha();

  function invalidar() {
    qc.invalidateQueries({ queryKey: getListarFolhaQueryKey() });
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

  /**
   * Grava o campo do mês. O POST é um upsert por (funcionário, ano, mês, tipo),
   * então a primeira digitação cria a linha e as seguintes editam — a contadora
   * não precisa "abrir" a folha antes de lançar.
   */
  async function gravar(
    funcionarioId: number,
    lanc: LancamentoFolha | undefined,
    campo: string,
    bruto: string,
    base?: string | null,
  ) {
    await comAviso(async () => {
      await salvarLanc.mutateAsync({
        data: {
          id: lanc?.id ?? null,
          funcionarioId,
          ano,
          mes,
          tipo: "mensal",
          ...(lanc ? {} : { salarioBase: base ?? null }),
          [campo]: campo === "pago" ? bruto === "sim" : paraDecimalAPI(bruto),
        } as never,
      });
      invalidar();
    });
  }

  const lista = lancamentos as LancamentoFolha[];
  const equipe = (funcionarios as Funcionario[]).filter((f) => f.situacao !== "demitido");
  const porFuncionario = new Map(
    lista.filter((l) => l.tipo === "mensal").map((l) => [l.funcionarioId, l]),
  );
  // 13º e férias não somem da tela: aparecem como linhas extras abaixo.
  const extras = lista.filter((l) => l.tipo !== "mensal");

  const totalLiquido = lista.reduce(
    (s, l) => s + (Number(l.liquido ?? 0) || liquidoSugerido(l)),
    0,
  );
  const pagos = lista.filter((l) => l.pago).length;

  const entradaCelula =
    "h-9 w-24 bg-transparent px-2 text-right text-sm outline-none focus:bg-blue-50 focus:ring-2 focus:ring-inset focus:ring-blue-500 dark:focus:bg-blue-950/40";
  const selectEscuro =
    "rounded-lg border border-black/15 bg-neutral-900 px-3 py-2 text-sm text-white dark:border-white/15";

  const anos = Array.from({ length: 6 }, (_, i) => HOJE.ano - 3 + i);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Folha do mês</h1>
          <p className="text-sm text-neutral-500">
            Uma linha por funcionário. Digite direto na célula — a linha do mês é criada sozinha.
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
      </div>

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className="rounded-lg border border-black/10 p-3 dark:border-white/10">
          <p className="text-xs text-neutral-500">Líquido do mês</p>
          <p className="text-lg font-semibold">{formatarMoeda(totalLiquido)}</p>
        </div>
        <div className="rounded-lg border border-black/10 p-3 dark:border-white/10">
          <p className="text-xs text-neutral-500">Lançamentos pagos</p>
          <p className="text-lg font-semibold">
            {pagos}/{lista.length}
          </p>
        </div>
        <div className="rounded-lg border border-black/10 p-3 dark:border-white/10">
          <p className="text-xs text-neutral-500">Funcionários na folha</p>
          <p className="text-lg font-semibold">{equipe.length}</p>
        </div>
      </div>

      {erro && (
        <p role="alert" className="mb-3 rounded-lg bg-red-600/10 px-3 py-2 text-sm text-red-700 dark:text-red-400">
          {erro}
        </p>
      )}

      {isLoading ? (
        <p className="text-sm text-neutral-500">Carregando...</p>
      ) : equipe.length === 0 ? (
        <p className="rounded-xl border border-dashed border-black/15 p-8 text-center text-sm text-neutral-500 dark:border-white/15">
          Nenhum funcionário neste filtro. Cadastre em{" "}
          <Link href="/funcionarios" className="text-blue-600 hover:underline">
            Funcionários
          </Link>
          .
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-black/10 dark:border-white/10">
          <table className="w-full text-left text-sm">
            <thead className="bg-neutral-100 dark:bg-neutral-900">
              <tr>
                <th className="p-2 font-medium">Funcionário</th>
                <th className="p-2 font-medium">Empregador</th>
                <th className="p-2 text-right font-medium">Base</th>
                <th className="p-2 text-right font-medium">Proventos</th>
                <th className="p-2 text-right font-medium">Descontos</th>
                <th className="p-2 text-right font-medium">INSS</th>
                <th className="p-2 text-right font-medium">FGTS</th>
                <th className="p-2 text-right font-medium">Líquido</th>
                <th className="p-2 font-medium">Pago</th>
              </tr>
            </thead>
            <tbody>
              {equipe.map((f) => {
                const l = porFuncionario.get(f.id);
                const liquido = l
                  ? emReais(l.liquido) || formatarNumeroBR(liquidoSugerido(l))
                  : "";
                return (
                  <tr key={f.id} className="border-t border-black/10 dark:border-white/10">
                    <td className="p-2">
                      <Link
                        href={`/funcionarios/${f.id}`}
                        className="font-medium text-blue-600 hover:underline"
                      >
                        {f.nome}
                      </Link>
                    </td>
                    <td className="p-2">
                      {f.clienteNome ?? <span className="text-neutral-500">Escritório</span>}
                    </td>
                    {(["salarioBase", "proventos", "descontos", "inss", "fgts"] as const).map(
                      (campo) => (
                        <td key={campo} className="p-0 text-right">
                          <input
                            key={`${campo}-${l?.id ?? "novo"}-${ano}-${mes}`}
                            defaultValue={
                              campo === "salarioBase"
                                ? emReais(l?.salarioBase ?? f.salario)
                                : emReais(l?.[campo] as string | null)
                            }
                            onBlur={(e) => gravar(f.id, l, campo, e.target.value, f.salario)}
                            inputMode="decimal"
                            className={entradaCelula}
                            aria-label={`${campo} de ${f.nome}`}
                          />
                        </td>
                      ),
                    )}
                    <td className="p-0 text-right">
                      <input
                        key={`liquido-${l?.id ?? "novo"}-${ano}-${mes}`}
                        defaultValue={liquido}
                        onBlur={(e) => gravar(f.id, l, "liquido", e.target.value, f.salario)}
                        inputMode="decimal"
                        className={`${entradaCelula} font-medium`}
                        aria-label={`Líquido de ${f.nome}`}
                      />
                    </td>
                    <td className="p-2">
                      <button
                        type="button"
                        disabled={!l}
                        onClick={() => gravar(f.id, l, "pago", l?.pago ? "nao" : "sim", f.salario)}
                        aria-label={`${l?.pago ? "Pago" : "Em aberto"} — folha de ${f.nome}`}
                        className={`rounded-lg px-2 py-1 text-xs disabled:opacity-40 ${
                          l?.pago
                            ? "bg-green-600/15 text-green-700 dark:text-green-400"
                            : "bg-amber-600/15 text-amber-700 dark:text-amber-400"
                        }`}
                      >
                        {l?.pago ? "Pago" : "Em aberto"}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {extras.length > 0 && (
        <div className="mt-4">
          <h2 className="mb-2 text-sm font-semibold text-neutral-500">
            Outros lançamentos do mês
          </h2>
          <ul className="rounded-xl border border-black/10 text-sm dark:border-white/10">
            {extras.map((l) => (
              <li
                key={l.id}
                className="flex flex-wrap items-center justify-between gap-2 border-b border-black/10 p-2 last:border-0 dark:border-white/10"
              >
                <span>
                  <Link
                    href={`/funcionarios/${l.funcionarioId}`}
                    className="text-blue-600 hover:underline"
                  >
                    {l.funcionarioNome}
                  </Link>{" "}
                  — {rotuloTipoFolha(l.tipo)}
                </span>
                <span className="font-medium">
                  {formatarMoeda(Number(l.liquido ?? 0) || liquidoSugerido(l))}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
