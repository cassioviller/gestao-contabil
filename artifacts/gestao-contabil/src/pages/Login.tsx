import { useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getGetSessaoAtualQueryKey, useEntrar } from "@workspace/api-client-react";

export default function Login() {
  const queryClient = useQueryClient();
  const [login, setLogin] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState<string | null>(null);

  const entrar = useEntrar({
    mutation: {
      onSuccess: (sessao) => {
        // Reaproveita a resposta como sessão atual e joga fora o cache do
        // usuário anterior — trocar de conta na mesma aba não pode deixar dado
        // do escritório antigo na tela.
        queryClient.clear();
        queryClient.setQueryData(getGetSessaoAtualQueryKey(), sessao);
      },
      onError: () => setErro("Login ou senha inválidos."),
    },
  });

  function aoEnviar(evento: FormEvent) {
    evento.preventDefault();
    setErro(null);
    entrar.mutate({ data: { login: login.trim(), senha } });
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-neutral-50 p-4 dark:bg-neutral-900">
      <form
        onSubmit={aoEnviar}
        className="w-full max-w-sm rounded-xl border border-black/10 bg-white p-8 dark:border-white/10 dark:bg-neutral-950"
      >
        <p className="text-2xl font-bold">ContaFácil</p>
        <p className="mt-1 mb-6 text-sm text-neutral-500">
          Entre com o acesso do seu escritório
        </p>

        <label className="mb-1 block text-sm font-medium" htmlFor="login">
          Login
        </label>
        <input
          id="login"
          name="login"
          autoComplete="username"
          autoFocus
          value={login}
          onChange={(e) => setLogin(e.target.value)}
          className="mb-4 w-full rounded-lg border border-black/15 px-3 py-2 text-sm dark:border-white/15 dark:bg-neutral-900"
        />

        <label className="mb-1 block text-sm font-medium" htmlFor="senha">
          Senha
        </label>
        <input
          id="senha"
          name="senha"
          type="password"
          autoComplete="current-password"
          value={senha}
          onChange={(e) => setSenha(e.target.value)}
          className="mb-4 w-full rounded-lg border border-black/15 px-3 py-2 text-sm dark:border-white/15 dark:bg-neutral-900"
        />

        {erro ? (
          <p role="alert" className="mb-4 text-sm text-red-600">
            {erro}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={entrar.isPending || !login.trim() || !senha}
          className="w-full rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
        >
          {entrar.isPending ? "Entrando..." : "Entrar"}
        </button>
      </form>
    </div>
  );
}
