import { Component, type ErrorInfo, type ReactNode } from "react";

type Estado = { erro: Error | null };

/**
 * Última linha de defesa: um erro de render em qualquer tela vira esta caixa
 * com botão de recarregar, em vez de uma página branca sem explicação.
 */
export default class ErrorBoundary extends Component<{ children: ReactNode }, Estado> {
  override state: Estado = { erro: null };

  static getDerivedStateFromError(erro: Error): Estado {
    return { erro };
  }

  override componentDidCatch(erro: Error, info: ErrorInfo): void {
    console.error("Erro de tela", erro, info.componentStack);
  }

  override render(): ReactNode {
    if (!this.state.erro) return this.props.children;
    return (
      <div role="alert" className="flex min-h-screen items-center justify-center p-6">
        <div className="max-w-md rounded-xl border border-red-300 bg-red-50 p-6 text-red-900 dark:border-red-900 dark:bg-red-950/30 dark:text-red-200">
          <p className="text-lg font-semibold">Algo deu errado nesta tela.</p>
          <p className="mt-1 text-sm">
            O erro foi registrado. Recarregar a página costuma resolver; se voltar a acontecer,
            avise o suporte com o horário.
          </p>
          <pre className="mt-3 max-h-32 overflow-auto rounded bg-black/5 p-2 text-xs dark:bg-white/10">
            {this.state.erro.message}
          </pre>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-4 rounded-lg bg-red-700 px-4 py-2 text-sm font-medium text-white hover:bg-red-800"
          >
            Recarregar
          </button>
        </div>
      </div>
    );
  }
}
