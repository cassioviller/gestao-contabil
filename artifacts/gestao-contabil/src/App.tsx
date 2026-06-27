import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import MenuLateral from "@/components/MenuLateral";
import Painel from "@/pages/Painel";
import Clientes from "@/pages/Clientes";
import Tipos from "@/pages/Tipos";
import Competencias from "@/pages/Competencias";
import CompetenciaChecklist from "@/pages/CompetenciaChecklist";
import CompetenciaPagamentos from "@/pages/CompetenciaPagamentos";
import Pendencias from "@/pages/Pendencias";
import NotFound from "@/pages/not-found";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 5000,
    },
  },
});

function Router() {
  return (
    <div className="flex min-h-screen">
      <MenuLateral />
      <main className="flex-1 p-8 overflow-auto">
        <Switch>
          <Route path="/" component={Painel} />
          <Route path="/clientes" component={Clientes} />
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

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
        <Router />
      </WouterRouter>
    </QueryClientProvider>
  );
}

export default App;
