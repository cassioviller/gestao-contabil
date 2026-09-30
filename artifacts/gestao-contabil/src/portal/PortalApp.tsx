import { useState, type FormEvent } from "react";
import { Link, Route, Switch, useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  getGetPortalSessaoQueryKey,
  useGetPortalSessao,
  usePortalEntrar,
  usePortalSair,
} from "@workspace/api-client-react";
import { mensagemDeErro } from "@/lib/erros";
import PortalGuias from "./PortalGuias";
import PortalHonorarios from "./PortalHonorarios";
import PortalSolicitacoes from "./PortalSolicitacoes";
import PortalPedidos from "./PortalPedidos";

const CHAVE = getGetPortalSessaoQueryKey();

function Entrar() {
  const [email, setEmail] = useState("");
  const [enviado, setEnviado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const pedir = usePortalEntrar();

  async function enviar(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    try {
      await pedir.mutateAsync({ data: { email: email.trim() } });
      setEnviado(true);
    } catch (err) {
      setErro(mensagemDeErro(err, "Não foi possível pedir o acesso."));
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-neutral-50 p-4 dark:bg-neutral-900">
      <form
        onSubmit={enviar}
        className="w-full max-w-sm rounded-xl border border-black/10 bg-white p-8 dark:border-white/10 dark:bg-neutral-950"
      >
        <h1 className="text-2xl font-bold">Portal do cliente</h1>
        <p className="mt-1 mb-6 text-sm text-neutral-500">
          Informe o e-mail cadastrado no seu escritório contábil: enviamos um link de acesso.
        </p>
        {enviado ? (
          <p
            role="status"
            className="rounded-lg bg-green-600/10 px-3 py-2 text-sm text-green-800 dark:text-green-300"
          >
            Se este e-mail estiver cadastrado, o link chega em instantes e vale por 30 minutos.
          </p>
        ) : (
          <>
            <label className="mb-1 block text-sm font-medium" htmlFor="email-portal">
              E-mail
            </label>
            <input
              id="email-portal"
              type="email"
              autoComplete="email"
              autoFocus
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mb-4 w-full rounded-lg border border-black/15 px-3 py-2 text-sm dark:border-white/15 dark:bg-neutral-900"
            />
            {erro && (
              <p role="alert" className="mb-4 text-sm text-red-600">
                {erro}
              </p>
            )}
            <button
              type="submit"
              disabled={pedir.isPending || !email.trim()}
              className="w-full rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {pedir.isPending ? "Enviando..." : "Receber link de acesso"}
            </button>
          </>
        )}
      </form>
    </div>
  );
}

const ABAS = [
  { href: "/portal", rotulo: "Guias" },
  { href: "/portal/honorarios", rotulo: "Honorários" },
  { href: "/portal/solicitacoes", rotulo: "Solicitações" },
  { href: "/portal/pedidos", rotulo: "Pedidos" },
];

/**
 * Segunda área do app, sem o menu do escritório: o cliente entra por link de
 * e-mail e vê só o que é dele.
 */
export default function PortalApp() {
  const qc = useQueryClient();
  const [caminho] = useLocation();
  const { data: sessao, isPending } = useGetPortalSessao({
    query: { queryKey: CHAVE, retry: false, staleTime: Infinity },
  });
  const sair = usePortalSair({
    mutation: { onSettled: () => qc.resetQueries({ queryKey: CHAVE }) },
  });

  if (isPending) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-sm text-neutral-500">Carregando...</p>
      </div>
    );
  }
  if (!sessao) return <Entrar />;

  return (
    <div className="min-h-screen bg-neutral-50 dark:bg-neutral-900">
      <header className="border-b border-black/10 bg-white dark:border-white/10 dark:bg-neutral-950">
        <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div>
            <p className="text-xs text-neutral-500">{sessao.escritorio} · portal do cliente</p>
            <p className="font-semibold">{sessao.razaoSocial}</p>
          </div>
          <button
            type="button"
            onClick={() => sair.mutate()}
            className="rounded-lg border border-black/15 px-3 py-1.5 text-sm dark:border-white/15"
          >
            Sair
          </button>
        </div>
        <nav className="mx-auto flex max-w-4xl gap-1 px-4">
          {ABAS.map((a) => {
            const ativa = a.href === "/portal" ? caminho === "/portal" : caminho.startsWith(a.href);
            return (
              <Link
                key={a.href}
                href={a.href}
                className={`-mb-px border-b-2 px-3 py-2 text-sm ${
                  ativa
                    ? "border-blue-600 font-medium text-blue-600"
                    : "border-transparent text-neutral-500"
                }`}
              >
                {a.rotulo}
              </Link>
            );
          })}
        </nav>
      </header>
      <main className="mx-auto max-w-4xl p-4">
        <Switch>
          <Route path="/portal" component={PortalGuias} />
          <Route path="/portal/honorarios" component={PortalHonorarios} />
          <Route path="/portal/solicitacoes" component={PortalSolicitacoes} />
          <Route path="/portal/pedidos" component={PortalPedidos} />
          <Route>
            <p className="text-sm text-neutral-500">Página não encontrada.</p>
          </Route>
        </Switch>
      </main>
    </div>
  );
}
