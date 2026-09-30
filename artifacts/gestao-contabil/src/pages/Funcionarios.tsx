import { useState } from "react";
import { Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  getListarFuncionariosQueryKey,
  useAtualizarFuncionario,
  useListarClientes,
  useListarFuncionarios,
  useRemoverFuncionario,
  useSalvarFuncionario,
} from "@workspace/api-client-react";
import type { Funcionario } from "@workspace/api-client-react";
import { formatarData, formatarMoeda } from "@/lib/formato";
import { SITUACOES, rotuloSituacao } from "@/lib/pessoal";

type Escopo = "escritorio" | "clientes" | "todos";
type Campo = "nome" | "cpf" | "cargo" | "admissao" | "salario" | "telefone";

export default function Funcionarios() {
  const qc = useQueryClient();
  const [escopo, setEscopo] = useState<Escopo>("escritorio");
  const [situacao, setSituacao] = useState<string>("ativo");
  const [busca, setBusca] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [salvo, setSalvo] = useState(false);

  const { data: funcionarios = [], isLoading } = useListarFuncionarios({
    escopo,
    ...(situacao === "todas" ? {} : { situacao: situacao as never }),
  });
  const { data: clientes = [] } = useListarClientes();

  const salvar = useSalvarFuncionario();
  const atualizar = useAtualizarFuncionario();
  const remover = useRemoverFuncionario();

  const [novo, setNovo] = useState({ clienteId: "", nome: "", cargo: "", admissao: "", salario: "" });

  function invalidar() {
    qc.invalidateQueries({ queryKey: getListarFuncionariosQueryKey() });
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
    const valor =
      campo === "salario"
        ? bruto.trim()
          ? bruto.trim().replace(/\./g, "").replace(",", ".")
          : null
        : bruto.trim() || null;
    await comAviso(async () => {
      await atualizar.mutateAsync({ id, data: { [campo]: valor } as never });
      invalidar();
    });
  }

  async function mudarSituacao(id: number, nova: string) {
    await comAviso(async () => {
      await atualizar.mutateAsync({ id, data: { situacao: nova } as never });
      invalidar();
    });
  }

  async function adicionar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!novo.nome.trim()) return;
    await comAviso(async () => {
      await salvar.mutateAsync({
        data: {
          clienteId: novo.clienteId ? Number(novo.clienteId) : null,
          nome: novo.nome.trim(),
          cargo: novo.cargo.trim() || null,
          admissao: novo.admissao || null,
          salario: novo.salario.trim()
            ? novo.salario.trim().replace(/\./g, "").replace(",", ".")
            : null,
        } as never,
      });
      setNovo((n) => ({ ...n, nome: "", cargo: "", salario: "" }));
      invalidar();
    });
  }

  async function excluir(f: Funcionario) {
    if (
      !window.confirm(
        `Excluir ${f.nome}? A folha e as férias registradas para ele também serão apagadas.`,
      )
    ) {
      return;
    }
    await comAviso(async () => {
      await remover.mutateAsync({ id: f.id });
      invalidar();
    });
  }

  const lista = funcionarios as Funcionario[];
  const filtrados = lista.filter((f) => {
    const t = busca.trim().toLowerCase();
    if (!t) return true;
    return [f.nome, f.cargo, f.cpf, f.clienteNome].some((v) =>
      (v ?? "").toLowerCase().includes(t),
    );
  });

  const folhaMensal = filtrados
    .filter((f) => f.situacao !== "demitido")
    .reduce((s, f) => s + Number(f.salario ?? 0), 0);

  const celula = "border-r border-black/10 p-0 dark:border-white/10";
  const entrada =
    "h-9 w-full bg-transparent px-2 text-sm outline-none focus:bg-blue-50 focus:ring-2 focus:ring-inset focus:ring-blue-500 dark:focus:bg-blue-950/40";
  const campoForm =
    "rounded-lg border border-black/15 bg-transparent px-3 py-2 text-sm dark:border-white/15";
  const selectEscuro =
    "rounded-lg border border-black/15 bg-neutral-900 px-3 py-2 text-sm text-white dark:border-white/15";

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Funcionários</h1>
          <p className="text-sm text-neutral-500">
            Quadro do escritório e dos clientes. Clique no nome para ver folha e férias.
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
          value={situacao}
          onChange={(e) => setSituacao(e.target.value)}
          className={`${selectEscuro} ml-2`}
          aria-label="Situação"
        >
          <option value="todas" className="bg-neutral-900 text-white">
            Todas as situações
          </option>
          {SITUACOES.map((s) => (
            <option key={s.valor} value={s.valor} className="bg-neutral-900 text-white">
              {s.rotulo}
            </option>
          ))}
        </select>

        <input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar por nome, cargo ou CPF…"
          className={`ml-auto w-full ${campoForm} sm:w-72`}
        />
      </div>

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className="rounded-lg border border-black/10 p-3 dark:border-white/10">
          <p className="text-xs text-neutral-500">Funcionários listados</p>
          <p className="text-lg font-semibold">{filtrados.length}</p>
        </div>
        <div className="rounded-lg border border-black/10 p-3 dark:border-white/10">
          <p className="text-xs text-neutral-500">Em férias</p>
          <p className="text-lg font-semibold">
            {filtrados.filter((f) => f.situacao === "ferias").length}
          </p>
        </div>
        <div className="rounded-lg border border-black/10 p-3 dark:border-white/10">
          <p className="text-xs text-neutral-500">Salários somados</p>
          <p className="text-lg font-semibold">{formatarMoeda(folhaMensal)}</p>
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
          aria-label="Empregador"
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
          value={novo.nome}
          onChange={(e) => setNovo((n) => ({ ...n, nome: e.target.value }))}
          placeholder="Nome do funcionário"
          className={`${campoForm} w-56`}
          aria-label="Nome"
        />
        <input
          value={novo.cargo}
          onChange={(e) => setNovo((n) => ({ ...n, cargo: e.target.value }))}
          placeholder="Cargo"
          className={`${campoForm} w-40`}
          aria-label="Cargo"
        />
        <input
          type="date"
          value={novo.admissao}
          onChange={(e) => setNovo((n) => ({ ...n, admissao: e.target.value }))}
          className={campoForm}
          aria-label="Admissão"
        />
        <input
          value={novo.salario}
          onChange={(e) => setNovo((n) => ({ ...n, salario: e.target.value }))}
          placeholder="Salário"
          inputMode="decimal"
          className={`${campoForm} w-28`}
          aria-label="Salário"
        />
        <button
          type="submit"
          disabled={!novo.nome.trim()}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          + Cadastrar
        </button>
      </form>

      {isLoading ? (
        <p className="text-sm text-neutral-500">Carregando...</p>
      ) : filtrados.length === 0 ? (
        <p className="rounded-xl border border-dashed border-black/15 p-8 text-center text-sm text-neutral-500 dark:border-white/15">
          Nenhum funcionário cadastrado neste filtro.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-black/10 dark:border-white/10">
          <table className="w-full text-left text-sm">
            <thead className="bg-neutral-100 dark:bg-neutral-900">
              <tr>
                <th className="p-2 font-medium">Nome</th>
                <th className="p-2 font-medium">Empregador</th>
                <th className="p-2 font-medium">Cargo</th>
                <th className="p-2 font-medium">CPF</th>
                <th className="p-2 font-medium">Admissão</th>
                <th className="p-2 text-right font-medium">Salário</th>
                <th className="p-2 font-medium">Situação</th>
                <th className="p-2" />
              </tr>
            </thead>
            <tbody>
              {filtrados.map((f) => (
                <tr key={f.id} className="border-t border-black/10 dark:border-white/10">
                  <td className="border-r border-black/10 p-2 dark:border-white/10">
                    <Link
                      href={`/funcionarios/${f.id}`}
                      className="font-medium text-blue-600 hover:underline"
                    >
                      {f.nome}
                    </Link>
                  </td>
                  <td className="border-r border-black/10 p-2 dark:border-white/10">
                    {f.clienteNome ?? <span className="text-neutral-500">Escritório</span>}
                  </td>
                  <td className={celula}>
                    <input
                      name="cargo"
                      defaultValue={f.cargo ?? ""}
                      onBlur={(e) => salvarCampo(f.id, "cargo", e.target.value)}
                      className={entrada}
                      aria-label={`Cargo de ${f.nome}`}
                    />
                  </td>
                  <td className={celula}>
                    <input
                      name="cpf"
                      defaultValue={f.cpf ?? ""}
                      onBlur={(e) => salvarCampo(f.id, "cpf", e.target.value)}
                      className={entrada}
                      aria-label={`CPF de ${f.nome}`}
                    />
                  </td>
                  <td className="border-r border-black/10 p-2 dark:border-white/10">
                    {formatarData(f.admissao)}
                  </td>
                  <td className={celula}>
                    <input
                      name="salario"
                      defaultValue={f.salario ? Number(f.salario).toFixed(2).replace(".", ",") : ""}
                      onBlur={(e) => salvarCampo(f.id, "salario", e.target.value)}
                      inputMode="decimal"
                      className={`${entrada} text-right`}
                      aria-label={`Salário de ${f.nome}`}
                    />
                  </td>
                  <td className="border-r border-black/10 p-2 dark:border-white/10">
                    <select
                      value={f.situacao}
                      onChange={(e) => mudarSituacao(f.id, e.target.value)}
                      aria-label={`Situação de ${f.nome}`}
                      className="rounded-lg border border-black/15 bg-transparent px-2 py-1 text-xs dark:border-white/15"
                    >
                      {SITUACOES.map((s) => (
                        <option key={s.valor} value={s.valor}>
                          {s.rotulo}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="p-2 text-right">
                    <button
                      type="button"
                      onClick={() => excluir(f)}
                      aria-label={`Excluir ${f.nome}`}
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
      <p className="mt-2 text-xs text-neutral-500">
        Situação atual: {rotuloSituacao(situacao)}
      </p>
    </div>
  );
}
