import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListarCredenciais,
  getListarCredenciaisQueryKey,
  useSalvarCredencial,
  useAtualizarCredencial,
  useRemoverCredencial,
  useListarClientes,
  useListarTipos,
} from "@workspace/api-client-react";

type Credencial = {
  id: number;
  clienteId: number;
  clienteNome: string;
  tipoObrigacaoId: number | null;
  rotulo: string;
  login: string | null;
  senha: string | null;
  observacao: string | null;
};

type Campo = "rotulo" | "login" | "senha" | "observacao";

/** Acessos que não são de uma obrigação específica, mas todo escritório usa. */
const ACESSOS_GERAIS = ["gov.br", "e-CAC", "Prefeitura / NFS-e", "SEFAZ", "Conectividade Social", "Simples Nacional"];

export default function Senhas() {
  const qc = useQueryClient();
  const { data: credenciais = [], isLoading } = useListarCredenciais();
  const { data: clientes = [] } = useListarClientes();
  const { data: tipos = [] } = useListarTipos();

  const salvar = useSalvarCredencial();
  const atualizar = useAtualizarCredencial();
  const remover = useRemoverCredencial();

  const [busca, setBusca] = useState("");
  const [revelar, setRevelar] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [salvo, setSalvo] = useState(false);
  const [novoCliente, setNovoCliente] = useState("");
  const [novoRotulo, setNovoRotulo] = useState("");

  function invalidar() {
    qc.invalidateQueries({ queryKey: getListarCredenciaisQueryKey() });
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

  /** Enter confirma (sai do campo, o que dispara o save); Esc desfaz. */
  function teclas(original: string) {
    return (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") e.currentTarget.blur();
      if (e.key === "Escape") {
        e.currentTarget.value = original;
        e.currentTarget.blur();
      }
    };
  }

  async function salvarCampo(id: number, campo: Campo, valor: string) {
    await comAviso(async () => {
      await atualizar.mutateAsync({ id, data: { [campo]: valor || null } as never });
      invalidar();
    });
  }

  async function adicionar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const clienteId = Number(novoCliente);
    const rotulo = novoRotulo.trim();
    if (!clienteId || !rotulo) return;
    // Quando o rótulo bate com um tipo do catálogo, já deixa vinculado.
    const tipo = (tipos as { id: number; nome: string }[]).find(
      (t) => t.nome.toLowerCase() === rotulo.toLowerCase()
    );
    await comAviso(async () => {
      await salvar.mutateAsync({
        data: { clienteId, rotulo, tipoObrigacaoId: tipo?.id ?? null } as never,
      });
      setNovoRotulo("");
      invalidar();
    });
  }

  const lista = credenciais as unknown as Credencial[];
  const filtradas = lista.filter((c) => {
    const t = busca.trim().toLowerCase();
    if (!t) return true;
    return [c.clienteNome, c.rotulo, c.login, c.observacao].some((v) =>
      (v ?? "").toLowerCase().includes(t)
    );
  });

  const celula = "border-r border-black/10 p-0 dark:border-white/10";
  const entrada =
    "h-9 w-full bg-transparent px-2 text-sm outline-none focus:bg-blue-50 focus:ring-2 focus:ring-inset focus:ring-blue-500 dark:focus:bg-blue-950/40";
  const campoForm =
    "rounded-lg border border-black/15 bg-transparent px-3 py-2 text-sm dark:border-white/15";
  const selectEscuro =
    "rounded-lg border border-black/15 bg-neutral-900 px-3 py-2 text-sm text-white dark:border-white/15";

  // Sugestões do datalist: as obrigações do catálogo + os acessos gerais.
  const sugestoes = [...(tipos as { nome: string }[]).map((t) => t.nome), ...ACESSOS_GERAIS];

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Senhas</h1>
          <p className="text-sm text-neutral-500">
            {filtradas.length} acesso(s) · uma linha por empresa × sistema
          </p>
        </div>
        <div className="flex items-center gap-2">
          {salvo && <span className="text-xs text-green-600">✓ salvo</span>}
          <button onClick={() => setRevelar((v) => !v)} className={campoForm}>
            {revelar ? "🙈 Ocultar senhas" : "👁 Mostrar senhas"}
          </button>
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
        <input value={novoRotulo} onChange={(e) => setNovoRotulo(e.target.value)} name="novoRotulo"
          list="sistemas" placeholder="Sistema / obrigação (ex: DAS)" className={`${campoForm} w-64`} />
        <datalist id="sistemas">
          {sugestoes.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
        <button type="submit" disabled={!novoCliente || !novoRotulo.trim()}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
          + Adicionar acesso
        </button>
        <input value={busca} onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar por empresa, sistema ou login…"
          className={`ml-auto w-full ${campoForm} sm:w-72`} />
      </form>

      {isLoading ? (
        <p className="text-sm text-neutral-500">Carregando...</p>
      ) : (
        <div className="max-h-[calc(100vh-18rem)] overflow-auto rounded-xl border border-black/10 dark:border-white/10">
          <table className="w-full text-left text-sm">
            <thead className="sticky top-0 z-20 bg-neutral-100 dark:bg-neutral-900">
              <tr>
                <th className={`w-64 px-2 py-2 font-medium ${celula}`}>Empresa</th>
                <th className={`w-48 px-2 py-2 font-medium ${celula}`}>Sistema / obrigação</th>
                <th className={`w-44 px-2 py-2 font-medium ${celula}`}>Login</th>
                <th className={`w-44 px-2 py-2 font-medium ${celula}`}>Senha</th>
                <th className={`px-2 py-2 font-medium ${celula}`}>Observação</th>
                <th className="w-10" />
              </tr>
            </thead>
            <tbody className="divide-y divide-black/10 dark:divide-white/10">
              {filtradas.map((c) => (
                <tr key={c.id}>
                  <td className={`w-64 px-2 py-2 font-medium ${celula}`}>{c.clienteNome}</td>
                  <td className={`w-48 ${celula}`}>
                    <input name="rotulo" defaultValue={c.rotulo}
                      onKeyDown={teclas(c.rotulo)}
                      onBlur={(e) => {
                        const v = e.target.value.trim();
                        if (!v) {
                          e.target.value = c.rotulo;
                          return;
                        }
                        if (v !== c.rotulo) salvarCampo(c.id, "rotulo", v);
                      }}
                      className={entrada} />
                  </td>
                  <td className={`w-44 ${celula}`}>
                    <input name="login" defaultValue={c.login ?? ""}
                      onKeyDown={teclas(c.login ?? "")}
                      onBlur={(e) => e.target.value !== (c.login ?? "") && salvarCampo(c.id, "login", e.target.value)}
                      className={entrada} />
                  </td>
                  <td className={`w-44 ${celula}`}>
                    <input name="senha" type={revelar ? "text" : "password"} defaultValue={c.senha ?? ""}
                      onKeyDown={teclas(c.senha ?? "")}
                      onBlur={(e) => e.target.value !== (c.senha ?? "") && salvarCampo(c.id, "senha", e.target.value)}
                      className={entrada} />
                  </td>
                  <td className={celula}>
                    <input name="observacao" defaultValue={c.observacao ?? ""}
                      onKeyDown={teclas(c.observacao ?? "")}
                      onBlur={(e) =>
                        e.target.value !== (c.observacao ?? "") && salvarCampo(c.id, "observacao", e.target.value)
                      }
                      className={entrada} />
                  </td>
                  <td className="w-10 px-2 py-2 text-center">
                    <button title="Remover acesso"
                      onClick={() =>
                        comAviso(async () => {
                          await remover.mutateAsync({ id: c.id });
                          invalidar();
                        })
                      }
                      className="text-neutral-400 hover:text-red-600">
                      ✕
                    </button>
                  </td>
                </tr>
              ))}
              {filtradas.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-3 py-8 text-center text-neutral-500">
                    Nenhum acesso cadastrado. Escolha a empresa e o sistema acima para começar.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <p className="mt-3 text-xs text-neutral-500">
        Senhas ficam gravadas em texto no banco — use só em ambiente de confiança.
      </p>
    </div>
  );
}
