import { Link, useLocation } from "wouter";

const itens = [
  { href: "/", rotulo: "Painel", icone: "📊" },
  { href: "/clientes", rotulo: "Clientes", icone: "👥" },
  { href: "/cadastro", rotulo: "Dados cadastrais", icone: "🗂️" },
  { href: "/senhas", rotulo: "Senhas", icone: "🔑" },
  { href: "/pedidos", rotulo: "Pedidos", icone: "📥" },
  { href: "/processos", rotulo: "Processos", icone: "📁" },
  { href: "/competencias", rotulo: "Competências", icone: "📅" },
  { href: "/pendencias", rotulo: "Pendências", icone: "⏰" },
  { href: "/tipos", rotulo: "Tipos de obrigação", icone: "🏷️" },
];

export default function MenuLateral() {
  const [caminho] = useLocation();

  return (
    <aside className="w-60 shrink-0 border-r border-black/10 bg-white p-4 dark:border-white/10 dark:bg-neutral-950">
      <div className="mb-6 px-2">
        <p className="text-lg font-bold">ContaFácil</p>
        <p className="text-xs text-neutral-500">Gestão de clientes</p>
      </div>
      <nav className="flex flex-col gap-1">
        {itens.map((item) => {
          const ativo =
            item.href === "/"
              ? caminho === "/"
              : caminho.startsWith(item.href);
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
    </aside>
  );
}
