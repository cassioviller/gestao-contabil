import { Link, useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { getGetSessaoAtualQueryKey, useGetSessaoAtual, useSair } from "@workspace/api-client-react";
import { encerrarSessaoLocal } from "@/lib/sessao";

const itens: { href: string; rotulo: string; icone: string; somenteAdmin?: boolean }[] = [
  { href: "/", rotulo: "Painel", icone: "📊" },
  { href: "/clientes", rotulo: "Clientes", icone: "👥" },
  { href: "/cadastro", rotulo: "Dados cadastrais", icone: "🗂️" },
  { href: "/senhas", rotulo: "Senhas", icone: "🔑" },
  { href: "/pedidos", rotulo: "Pedidos", icone: "📥" },
  { href: "/processos", rotulo: "Processos", icone: "📁" },
  { href: "/solicitacoes", rotulo: "Solicitações", icone: "📨" },
  { href: "/competencias", rotulo: "Competências", icone: "📅" },
  { href: "/atrasos", rotulo: "Guias em atraso", icone: "🚨" },
  { href: "/pendencias", rotulo: "Pendências", icone: "⏰" },
  { href: "/produtividade", rotulo: "Produtividade", icone: "📈" },
  { href: "/tipos", rotulo: "Tipos de obrigação", icone: "🏷️" },
  { href: "/funcionarios", rotulo: "Funcionários", icone: "🧑‍💼" },
  { href: "/folha", rotulo: "Folha do mês", icone: "🧾" },
  { href: "/despesas", rotulo: "Despesas", icone: "💸" },
  { href: "/perfil", rotulo: "Perfil do escritório", icone: "🏢" },
  { href: "/usuarios", rotulo: "Usuários", icone: "🔐", somenteAdmin: true },
];

const PAPEL: Record<string, string> = {
  admin: "administrador",
  contador: "contador(a)",
  auxiliar: "auxiliar",
};

export default function MenuLateral() {
  const [caminho] = useLocation();
  const queryClient = useQueryClient();
  const { data: sessao } = useGetSessaoAtual({
    query: { queryKey: getGetSessaoAtualQueryKey(), staleTime: Infinity },
  });

  const sair = useSair({
    mutation: {
      // No sucesso e também no erro: se o cookie já tinha caducado, o pedido
      // falha mas a sessão local precisa cair do mesmo jeito.
      onSettled: () => encerrarSessaoLocal(queryClient),
    },
  });

  return (
    <aside className="flex w-60 shrink-0 flex-col border-r border-black/10 bg-white p-4 dark:border-white/10 dark:bg-neutral-950">
      {/* O nome do escritório vem da sessão; "ContaFácil" fica de subtítulo para
          a tela ser do escritório, não do sistema. */}
      <div className="mb-6 px-2">
        <p className="text-lg leading-tight font-bold" title={sessao?.conta}>
          {sessao?.conta ?? "ContaFácil"}
        </p>
        <p className="text-xs text-neutral-500">ContaFácil · gestão contábil</p>
      </div>
      <nav className="flex flex-col gap-1">
        {itens
          .filter((item) => !item.somenteAdmin || sessao?.papel === "admin")
          .map((item) => {
            const ativo = item.href === "/" ? caminho === "/" : caminho.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
                  ativo
                    ? "bg-blue-600 text-white"
                    : "text-neutral-700 hover:bg-black/5 dark:text-neutral-300 dark:hover:bg-white/10"
                }`}
              >
                <span>{item.icone}</span>
                <span>{item.rotulo}</span>
              </Link>
            );
          })}
      </nav>

      <div className="mt-auto border-t border-black/10 px-2 pt-4 dark:border-white/10">
        <p className="truncate text-sm font-medium" title={sessao?.conta}>
          {sessao?.conta ?? ""}
        </p>
        <p className="truncate text-xs text-neutral-500">
          {sessao?.login ?? ""}
          {sessao?.papel ? ` · ${PAPEL[sessao.papel] ?? sessao.papel}` : ""}
        </p>
        <Link
          href="/minha-conta"
          className="mt-1 block text-xs text-blue-600 hover:underline dark:text-blue-400"
        >
          Minha conta (trocar senha)
        </Link>
        <button
          type="button"
          onClick={() => sair.mutate()}
          disabled={sair.isPending}
          className="mt-3 w-full rounded-lg border border-black/15 px-3 py-2 text-sm text-neutral-700 transition-colors hover:bg-black/5 disabled:opacity-50 dark:border-white/15 dark:text-neutral-300 dark:hover:bg-white/10"
        >
          Sair
        </button>
      </div>
    </aside>
  );
}
