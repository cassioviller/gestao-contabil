import { useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  getListarPortalPedidosQueryKey,
  useCriarPortalPedido,
  useListarPortalPedidos,
} from "@workspace/api-client-react";
import { formatarData } from "@/lib/formato";
import { rotuloStatusProcesso } from "@workspace/dominio";
import { mensagemDeErro } from "@/lib/erros";
import Consulta from "@/components/Consulta";

const SUGESTOES = [
  "Alteração de endereço",
  "Inclusão de atividade",
  "Certidão negativa",
  "Segunda via de guia",
  "Outro",
];

export default function PortalPedidos() {
  const qc = useQueryClient();
  const { data: lista = [], isLoading, error, refetch } = useListarPortalPedidos();
  const criar = useCriarPortalPedido();
  const [tipo, setTipo] = useState("");
  const [observacao, setObservacao] = useState("");
  const [erro, setErro] = useState<string | null>(null);

  async function enviar(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    try {
      await criar.mutateAsync({
        data: { tipo: tipo.trim(), observacao: observacao.trim() || null },
      });
      setTipo("");
      setObservacao("");
      qc.invalidateQueries({ queryKey: getListarPortalPedidosQueryKey() });
    } catch (err) {
      setErro(mensagemDeErro(err));
    }
  }

  const campo =
    "w-full rounded-lg border border-black/15 bg-transparent px-3 py-2 text-sm dark:border-white/15";

  return (
    <div>
      <h1 className="mb-1 text-xl font-bold">Pedidos</h1>
      <p className="mb-4 text-sm text-neutral-500">
        Peça algo ao escritório e acompanhe o andamento.
      </p>
      <form
        onSubmit={enviar}
        className="mb-6 grid gap-2 rounded-xl border border-black/10 bg-white p-4 dark:border-white/10 dark:bg-neutral-950"
      >
        <input
          list="tipos-pedido"
          value={tipo}
          onChange={(e) => setTipo(e.target.value)}
          required
          placeholder="O que você precisa? (ex.: alteração de endereço)"
          aria-label="Tipo do pedido"
          className={campo}
        />
        <datalist id="tipos-pedido">
          {SUGESTOES.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
        <textarea
          value={observacao}
          onChange={(e) => setObservacao(e.target.value)}
          rows={2}
          placeholder="Detalhes (opcional)"
          aria-label="Detalhes do pedido"
          className={campo}
        />
        {erro && (
          <p role="alert" className="text-sm text-red-600">
            {erro}
          </p>
        )}
        <button
          type="submit"
          disabled={criar.isPending || !tipo.trim()}
          className="justify-self-start rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          Abrir pedido
        </button>
      </form>
      <Consulta
        isLoading={isLoading}
        error={error}
        vazio={lista.length === 0}
        aoTentar={() => refetch()}
        mensagemVazio="Você ainda não fez nenhum pedido."
      >
        <ul className="divide-y divide-black/10 rounded-xl border border-black/10 bg-white dark:divide-white/10 dark:border-white/10 dark:bg-neutral-950">
          {lista.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 p-4">
              <div>
                <p className="font-medium">{p.tipo}</p>
                <p className="text-xs text-neutral-500">
                  aberto em {formatarData(p.abertoEm)} · {rotuloStatusProcesso(p.status)}
                  {p.totalEtapas ? ` · ${p.etapasFeitas}/${p.totalEtapas} etapas` : ""}
                </p>
              </div>
            </li>
          ))}
        </ul>
      </Consulta>
    </div>
  );
}
