import type { ReactNode } from "react";
import { mensagemDeErro } from "@/lib/erros";

/**
 * Os três estados de qualquer lista: carregando, erro (com tentar de novo) e
 * vazio. Assim nenhuma tela engana com "nenhum registro" quando na verdade a
 * consulta falhou.
 */
export default function Consulta({
  isLoading,
  error,
  vazio,
  mensagemVazio = "Nada por aqui ainda.",
  aoTentar,
  children,
}: {
  isLoading: boolean;
  error?: unknown;
  vazio?: boolean;
  mensagemVazio?: ReactNode;
  aoTentar?: () => void;
  children: ReactNode;
}) {
  if (isLoading) return <p className="text-sm text-neutral-500">Carregando...</p>;
  if (error) {
    return (
      <div
        role="alert"
        className="rounded-lg bg-red-600/10 px-3 py-2 text-sm text-red-700 dark:text-red-400"
      >
        {mensagemDeErro(error)}
        {aoTentar && (
          <button type="button" onClick={aoTentar} className="ml-2 font-medium underline">
            Tentar de novo
          </button>
        )}
      </div>
    );
  }
  if (vazio) return <p className="text-sm text-neutral-500">{mensagemVazio}</p>;
  return <>{children}</>;
}
