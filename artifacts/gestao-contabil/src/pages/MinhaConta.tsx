import { useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  getGetSessaoAtualQueryKey,
  useGetSessaoAtual,
  useSairDeTodos,
  useTrocarSenha,
} from "@workspace/api-client-react";
import { mensagemDeErro } from "@/lib/erros";
import { encerrarSessaoLocal } from "@/lib/sessao";

const PAPEL: Record<string, string> = {
  admin: "Administrador",
  contador: "Contador(a)",
  auxiliar: "Auxiliar",
};

export default function MinhaConta() {
  const qc = useQueryClient();
  const { data: sessao } = useGetSessaoAtual({
    query: { queryKey: getGetSessaoAtualQueryKey(), staleTime: Infinity },
  });
  const trocar = useTrocarSenha();
  const sairDeTodos = useSairDeTodos({
    // Sucesso ou erro, a sessão local cai: a tela volta para o login.
    mutation: { onSettled: () => encerrarSessaoLocal(qc) },
  });

  const [senhaAtual, setSenhaAtual] = useState("");
  const [novaSenha, setNovaSenha] = useState("");
  const [confirmacao, setConfirmacao] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  async function enviar(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    setOk(false);
    if (novaSenha !== confirmacao) {
      setErro("A confirmação não bate com a nova senha.");
      return;
    }
    try {
      await trocar.mutateAsync({ data: { senhaAtual, novaSenha } });
      setSenhaAtual("");
      setNovaSenha("");
      setConfirmacao("");
      setOk(true);
    } catch (err) {
      setErro(mensagemDeErro(err, "Não foi possível trocar a senha."));
    }
  }

  const campo =
    "w-full rounded-lg border border-black/15 bg-transparent px-3 py-2 text-sm dark:border-white/15";

  return (
    <div className="max-w-md">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Minha conta</h1>
        <p className="text-sm text-neutral-500">
          {sessao?.nome ?? sessao?.login} · {sessao ? PAPEL[sessao.papel] ?? sessao.papel : ""} ·{" "}
          {sessao?.conta}
        </p>
      </div>

      <form onSubmit={enviar} className="mb-8 grid gap-3">
        <h2 className="font-medium">Trocar senha</h2>
        <label className="text-sm">
          <span className="mb-1 block">Senha atual</span>
          <input type="password" name="senhaAtual" autoComplete="current-password" value={senhaAtual}
            onChange={(e) => setSenhaAtual(e.target.value)} required className={campo} />
        </label>
        <label className="text-sm">
          <span className="mb-1 block">Nova senha (mínimo 8 caracteres)</span>
          <input type="password" name="novaSenha" autoComplete="new-password" value={novaSenha} minLength={8}
            onChange={(e) => setNovaSenha(e.target.value)} required className={campo} />
        </label>
        <label className="text-sm">
          <span className="mb-1 block">Confirme a nova senha</span>
          <input type="password" name="confirmacao" autoComplete="new-password" value={confirmacao}
            onChange={(e) => setConfirmacao(e.target.value)} required className={campo} />
        </label>
        {erro && (
          <p role="alert" className="rounded-lg bg-red-600/10 px-3 py-2 text-sm text-red-700 dark:text-red-400">
            {erro}
          </p>
        )}
        {ok && <p className="text-sm text-green-600">✓ Senha trocada. Os outros dispositivos foram desconectados.</p>}
        <button type="submit" disabled={trocar.isPending || !senhaAtual || novaSenha.length < 8}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
          {trocar.isPending ? "Trocando..." : "Trocar senha"}
        </button>
      </form>

      <div className="rounded-xl border border-black/10 p-4 dark:border-white/10">
        <h2 className="font-medium">Sair de todos os dispositivos</h2>
        <p className="mb-3 text-sm text-neutral-500">
          Encerra todas as suas sessões, inclusive esta. Use se deixou o sistema aberto num computador
          que não é seu.
        </p>
        <button type="button" onClick={() => sairDeTodos.mutate()} disabled={sairDeTodos.isPending}
          className="rounded-lg border border-red-600/40 px-4 py-2 text-sm text-red-700 hover:bg-red-600/10 disabled:opacity-50 dark:text-red-400">
          Sair de todos os dispositivos
        </button>
      </div>
    </div>
  );
}
