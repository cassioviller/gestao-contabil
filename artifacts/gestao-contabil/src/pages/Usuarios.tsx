import { useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  getGetSessaoAtualQueryKey,
  getListarUsuariosQueryKey,
  useAtualizarUsuario,
  useCriarUsuario,
  useGetSessaoAtual,
  useListarUsuarios,
  useRedefinirSenhaUsuario,
} from "@workspace/api-client-react";
import { mensagemDeErro } from "@/lib/erros";
import { formatarData } from "@/lib/formato";

type Papel = "admin" | "contador" | "auxiliar";

type Usuario = {
  id: number;
  login: string;
  nome: string | null;
  email: string | null;
  papel: Papel;
  ativo: boolean;
  ultimoAcessoEm: string | null;
  criadoEm: string;
};

const PAPEIS: { valor: Papel; rotulo: string; descricao: string }[] = [
  { valor: "admin", rotulo: "Administrador", descricao: "tudo, inclusive gerenciar usuários" },
  { valor: "contador", rotulo: "Contador(a)", descricao: "opera o escritório e revela senhas" },
  { valor: "auxiliar", rotulo: "Auxiliar", descricao: "opera o checklist, não revela senhas" },
];

function rotuloPapel(p: Papel): string {
  return PAPEIS.find((x) => x.valor === p)?.rotulo ?? p;
}

export default function Usuarios() {
  const qc = useQueryClient();
  const { data: sessao } = useGetSessaoAtual({
    query: { queryKey: getGetSessaoAtualQueryKey(), staleTime: Infinity },
  });
  const { data: usuarios = [], isLoading, error: erroLista } = useListarUsuarios();
  const criar = useCriarUsuario();
  const atualizar = useAtualizarUsuario();
  const redefinir = useRedefinirSenhaUsuario();

  const [form, setForm] = useState({
    login: "",
    nome: "",
    email: "",
    papel: "contador" as Papel,
    senha: "",
  });
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  function invalidar() {
    qc.invalidateQueries({ queryKey: getListarUsuariosQueryKey() });
  }

  async function comAviso(acao: () => Promise<unknown>, mensagem: string) {
    setErro(null);
    setAviso(null);
    try {
      await acao();
      invalidar();
      setAviso(mensagem);
      window.setTimeout(() => setAviso(null), 2500);
    } catch (e) {
      setErro(mensagemDeErro(e));
    }
  }

  async function adicionar(e: FormEvent) {
    e.preventDefault();
    await comAviso(async () => {
      await criar.mutateAsync({
        data: {
          login: form.login.trim(),
          nome: form.nome.trim() || null,
          email: form.email.trim() || null,
          papel: form.papel,
          senha: form.senha,
        },
      });
      setForm({ login: "", nome: "", email: "", papel: "contador", senha: "" });
    }, "Usuário criado.");
  }

  async function redefinirSenha(u: Usuario) {
    const nova = prompt(
      `Nova senha para "${u.login}" (mínimo 8 caracteres). As sessões dele(a) serão encerradas.`,
    );
    if (nova === null) return;
    if (nova.length < 8) {
      setErro("A senha precisa ter ao menos 8 caracteres.");
      return;
    }
    await comAviso(
      () => redefinir.mutateAsync({ id: u.id, data: { novaSenha: nova } }),
      "Senha redefinida.",
    );
  }

  const campo =
    "rounded-lg border border-black/15 bg-transparent px-3 py-2 text-sm dark:border-white/15";
  const selecao =
    "rounded-lg border border-black/15 bg-neutral-900 px-3 py-2 text-sm text-white dark:border-white/15";
  const lista = usuarios as unknown as Usuario[];

  return (
    <div className="max-w-5xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Usuários</h1>
        <p className="text-sm text-neutral-500">
          Quem entra no escritório e o que cada um pode fazer. Cada pessoa tem o seu login: assim a
          auditoria diz quem revelou uma senha ou marcou uma guia.
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
      {aviso && <p className="mb-4 text-sm text-green-600">✓ {aviso}</p>}
      {erroLista && (
        <p
          role="alert"
          className="mb-4 rounded-lg bg-red-600/10 px-3 py-2 text-sm text-red-700 dark:text-red-400"
        >
          {mensagemDeErro(erroLista)}
        </p>
      )}

      <form
        onSubmit={adicionar}
        className="mb-6 grid gap-3 rounded-xl border border-black/10 p-4 sm:grid-cols-6 dark:border-white/10"
      >
        <input
          name="login"
          value={form.login}
          onChange={(e) => setForm({ ...form, login: e.target.value })}
          placeholder="login"
          required
          minLength={2}
          autoComplete="off"
          className={campo}
          aria-label="Login"
        />
        <input
          name="nome"
          value={form.nome}
          onChange={(e) => setForm({ ...form, nome: e.target.value })}
          placeholder="Nome"
          className={campo}
          aria-label="Nome"
        />
        <input
          name="email"
          type="email"
          value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })}
          placeholder="E-mail (opcional)"
          className={campo}
          aria-label="E-mail"
        />
        <select
          name="papel"
          value={form.papel}
          onChange={(e) => setForm({ ...form, papel: e.target.value as Papel })}
          className={selecao}
          aria-label="Papel"
        >
          {PAPEIS.map((p) => (
            <option key={p.valor} value={p.valor} className="bg-neutral-900 text-white">
              {p.rotulo}
            </option>
          ))}
        </select>
        <input
          name="senha"
          type="password"
          value={form.senha}
          onChange={(e) => setForm({ ...form, senha: e.target.value })}
          placeholder="Senha inicial (8+)"
          required
          minLength={8}
          autoComplete="new-password"
          className={campo}
          aria-label="Senha inicial"
        />
        <button
          type="submit"
          disabled={criar.isPending || !form.login.trim() || form.senha.length < 8}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          + Adicionar usuário
        </button>
        <p className="text-xs text-neutral-500 sm:col-span-6">
          {PAPEIS.map((p) => `${p.rotulo}: ${p.descricao}`).join(" · ")}
        </p>
      </form>

      {isLoading ? (
        <p className="text-sm text-neutral-500">Carregando...</p>
      ) : (
        <div className="overflow-auto rounded-xl border border-black/10 dark:border-white/10">
          <table className="w-full text-left text-sm">
            <thead className="bg-neutral-100 dark:bg-neutral-900">
              <tr>
                <th className="px-3 py-2 font-medium">Login</th>
                <th className="px-3 py-2 font-medium">Nome</th>
                <th className="px-3 py-2 font-medium">E-mail</th>
                <th className="px-3 py-2 font-medium">Papel</th>
                <th className="px-3 py-2 text-center font-medium">Ativo</th>
                <th className="px-3 py-2 font-medium">Último acesso</th>
                <th className="w-40" />
              </tr>
            </thead>
            <tbody className="divide-y divide-black/10 dark:divide-white/10">
              {lista.map((u) => {
                const souEu = u.id === sessao?.usuarioId;
                return (
                  <tr key={u.id} className={u.ativo ? "" : "opacity-60"}>
                    <td className="px-3 py-2 font-medium">
                      {u.login}
                      {souEu && <span className="ml-2 text-xs text-neutral-500">(você)</span>}
                    </td>
                    <td className="px-3 py-2">{u.nome ?? "—"}</td>
                    <td className="px-3 py-2">{u.email ?? "—"}</td>
                    <td className="px-3 py-2">
                      <select
                        value={u.papel}
                        disabled={souEu}
                        aria-label={`Papel de ${u.login}`}
                        onChange={(e) =>
                          comAviso(
                            () =>
                              atualizar.mutateAsync({
                                id: u.id,
                                data: { papel: e.target.value as Papel },
                              }),
                            `Papel de ${u.login}: ${rotuloPapel(e.target.value as Papel)}.`,
                          )
                        }
                        className={`${selecao} disabled:opacity-60`}
                      >
                        {PAPEIS.map((p) => (
                          <option
                            key={p.valor}
                            value={p.valor}
                            className="bg-neutral-900 text-white"
                          >
                            {p.rotulo}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-3 py-2 text-center">
                      <input
                        type="checkbox"
                        checked={u.ativo}
                        disabled={souEu}
                        aria-label={`Ativo: ${u.login}`}
                        onChange={(e) =>
                          comAviso(
                            () =>
                              atualizar.mutateAsync({
                                id: u.id,
                                data: { ativo: e.target.checked },
                              }),
                            e.target.checked
                              ? `${u.login} reativado(a).`
                              : `${u.login} desativado(a); as sessões caíram.`,
                          )
                        }
                      />
                    </td>
                    <td className="px-3 py-2 text-neutral-500">
                      {u.ultimoAcessoEm ? formatarData(u.ultimoAcessoEm.slice(0, 10)) : "nunca"}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <button
                        type="button"
                        onClick={() => redefinirSenha(u)}
                        className="rounded-lg border border-black/15 px-3 py-1 text-xs dark:border-white/15"
                      >
                        Redefinir senha
                      </button>
                    </td>
                  </tr>
                );
              })}
              {lista.length === 0 && !erroLista && (
                <tr>
                  <td colSpan={7} className="px-3 py-8 text-center text-neutral-500">
                    Nenhum usuário.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
