import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useGetSessaoAtual } from "@workspace/api-client-react";
import { CHAVE_SESSAO, ehSessao } from "@/lib/sessao";
import MenuLateral from "@/components/MenuLateral";
import ErrorBoundary from "@/components/ErrorBoundary";
import { Toaster } from "@/components/ui/toaster";
import PortalApp from "@/portal/PortalApp";
import Solicitacoes from "@/pages/Solicitacoes";
import Login from "@/pages/Login";
import Painel from "@/pages/Painel";
import Clientes from "@/pages/Clientes";
import DadosCadastrais from "@/pages/DadosCadastrais";
import Senhas from "@/pages/Senhas";
import Atrasos from "@/pages/Atrasos";
import Perfil from "@/pages/Perfil";
import Usuarios from "@/pages/Usuarios";
import MinhaConta from "@/pages/MinhaConta";
import Produtividade from "@/pages/Produtividade";
import Despesas from "@/pages/Despesas";
import Funcionarios from "@/pages/Funcionarios";
import FuncionarioDetalhe from "@/pages/FuncionarioDetalhe";
import Folha from "@/pages/Folha";
import Processos from "@/pages/Processos";
import Pedidos from "@/pages/Pedidos";
import ProcessoDetalhe from "@/pages/ProcessoDetalhe";
import Tipos from "@/pages/Tipos";
import Competencias from "@/pages/Competencias";
import CompetenciaChecklist from "@/pages/CompetenciaChecklist";
import CompetenciaPagamentos from "@/pages/CompetenciaPagamentos";
import Pendencias from "@/pages/Pendencias";
import NotFound from "@/pages/not-found";

/**
 * Qualquer 401 (sessão expirou, ou alguém saiu em outra aba) revalida a sessão,
 * que falha e devolve a tela de login — em vez de deixar a tela travada num erro
 * sem explicação. O próprio pedido de sessão fica de fora do gatilho, senão o
 * 401 dele se realimentaria em laço.
 */
function aoFalhar(erro: unknown, query?: { queryKey?: readonly unknown[] }): void {
  if ((erro as { status?: number })?.status !== 401 || ehSessao(query)) return;
  queryClient.invalidateQueries({ queryKey: CHAVE_SESSAO });
}

const queryClient: QueryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 5000,
    },
  },
  queryCache: new QueryCache({ onError: aoFalhar }),
  mutationCache: new MutationCache({ onError: (erro) => aoFalhar(erro) }),
});

function Router() {
  return (
    <div className="flex min-h-screen">
      <MenuLateral />
      <main className="flex-1 p-8 overflow-auto">
        <Switch>
          <Route path="/" component={Painel} />
          <Route path="/clientes" component={Clientes} />
          <Route path="/cadastro" component={DadosCadastrais} />
          <Route path="/senhas" component={Senhas} />
          <Route path="/atrasos" component={Atrasos} />
          <Route path="/despesas" component={Despesas} />
          <Route path="/funcionarios/:id" component={FuncionarioDetalhe} />
          <Route path="/funcionarios" component={Funcionarios} />
          <Route path="/folha" component={Folha} />
          <Route path="/perfil" component={Perfil} />
          <Route path="/usuarios" component={Usuarios} />
          <Route path="/minha-conta" component={MinhaConta} />
          <Route path="/produtividade" component={Produtividade} />
          <Route path="/solicitacoes" component={Solicitacoes} />
          <Route path="/processos/:id" component={ProcessoDetalhe} />
          {/* Forma com children: o Route do wouter passa props próprias ao
              `component`, que não casam com a prop `categoria`. */}
          <Route path="/processos">{() => <Processos categoria="processo" />}</Route>
          <Route path="/pedidos/:id" component={ProcessoDetalhe} />
          <Route path="/pedidos" component={Pedidos} />
          <Route path="/tipos" component={Tipos} />
          <Route path="/competencias" component={Competencias} />
          <Route path="/competencias/:id/pagamentos" component={CompetenciaPagamentos} />
          <Route path="/competencias/:id" component={CompetenciaChecklist} />
          <Route path="/pendencias" component={Pendencias} />
          <Route component={NotFound} />
        </Switch>
      </main>
    </div>
  );
}

/**
 * Porta de entrada do app. Sem sessão não monta nenhuma tela: as páginas
 * disparam consultas já no primeiro render e todas voltariam 401.
 */
function Autenticado() {
  // `retry: false` para o 401 virar tela de login na hora, sem a espera das
  // tentativas repetidas.
  const { data, isPending } = useGetSessaoAtual({
    query: { queryKey: CHAVE_SESSAO, retry: false, staleTime: Infinity },
  });

  if (isPending) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-sm text-neutral-500">Carregando...</p>
      </div>
    );
  }

  return data ? <Router /> : <Login />;
}

/** `/portal/*` é a área do cliente, com sessão própria; o resto é o escritório. */
function Raiz() {
  const [caminho] = useLocation();
  return caminho === "/portal" || caminho.startsWith("/portal/") ? <PortalApp /> : <Autenticado />;
}

function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Raiz />
        </WouterRouter>
        <Toaster />
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

export default App;
