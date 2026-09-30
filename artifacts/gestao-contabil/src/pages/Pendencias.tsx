import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListarPendencias,
  getListarPendenciasQueryKey,
  useMarcarObrigacaoFeita,
  useMarcarPagamentoPago,
  useRegistrarCobranca,
  useGetConfiguracao,
  useSalvarConfiguracao,
} from "@workspace/api-client-react";
import { formatarData, formatarMoeda, rotuloCompetencia } from "@/lib/formato";
import {
  linkWhatsapp,
  montarMensagem,
  normalizarTelefone,
  MODELO_WHATSAPP_PADRAO,
} from "@/lib/whatsapp";

export default function Pendencias() {
  const qc = useQueryClient();
  const { data, isLoading } = useListarPendencias();
  const { data: confData } = useGetConfiguracao("modelo_whatsapp_inadimplencia");
  const marcarFeito = useMarcarObrigacaoFeita();
  const marcarPago = useMarcarPagamentoPago();
  const registrarCobranca = useRegistrarCobranca();
  const salvarConf = useSalvarConfiguracao();

  // Listas estáveis entre renders (o `?? []` criaria um array novo a cada um).
  const obrigacoes = useMemo(() => data?.obrigacoes ?? [], [data]);
  const inadimplentes = useMemo(() => data?.inadimplentes ?? [], [data]);
  const modelo = confData?.valor || MODELO_WHATSAPP_PADRAO;

  // Ids já resolvidos nesta sessão de tela: somem da lista na hora, sem esperar
  // o refetch, e voltam a aparecer se a API recusar a mudança.
  const [resolvidos, setResolvidos] = useState<Set<number>>(new Set());
  const [filtro, setFiltro] = useState(0);
  // Rascunho do modelo: `null` = ainda não mexeu, mostra o salvo. Derivado, e
  // não sincronizado por efeito: se a configuração chegar depois da lista, o
  // textarea passa a mostrá-la sozinho, sem congelar o texto padrão.
  const [modeloEdit, setModeloEdit] = useState<string | null>(null);
  const [modeloSalvo, setModeloSalvo] = useState(false);
  const modeloAtual = modeloEdit ?? modelo;

  const obrsView = obrigacoes.filter(
    (o) => !resolvidos.has(o.id) && (!filtro || o.clienteId === filtro),
  );
  const inadsView = inadimplentes.filter(
    (i) => !resolvidos.has(i.id) && (!filtro || i.clienteId === filtro),
  );

  function marcarResolvido(id: number, desfazer = false) {
    setResolvidos((s) => {
      const proximo = new Set(s);
      if (desfazer) proximo.delete(id);
      else proximo.add(id);
      return proximo;
    });
  }

  const opcoesClientes = useMemo(() => {
    const m = new Map<number, string>();
    for (const o of obrigacoes) m.set(o.clienteId, o.cliente);
    for (const i of inadimplentes) m.set(i.clienteId, i.cliente);
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [obrigacoes, inadimplentes]);

  function handleMarcarFeito(o: (typeof obrigacoes)[0]) {
    marcarResolvido(o.id);
    marcarFeito.mutate(
      { id: o.id },
      {
        onSuccess: () => qc.invalidateQueries({ queryKey: getListarPendenciasQueryKey() }),
        onError: () => marcarResolvido(o.id, true),
      },
    );
  }

  function handleMarcarPago(i: (typeof inadimplentes)[0]) {
    marcarResolvido(i.id);
    marcarPago.mutate(
      { id: i.id },
      {
        onSuccess: () => qc.invalidateQueries({ queryKey: getListarPendenciasQueryKey() }),
        onError: () => marcarResolvido(i.id, true),
      },
    );
  }

  function cobrar(i: (typeof inadimplentes)[0]) {
    const tel = normalizarTelefone(i.whatsapp);
    if (!tel) return;
    const msg = montarMensagem(modelo, {
      cliente: i.cliente,
      valor: formatarMoeda(i.valor),
      competencia: rotuloCompetencia(i.ano, i.mes),
      vencimento: formatarData(i.vencimento),
      dias_atraso: String(i.diasAtraso),
    });
    registrarCobranca.mutate(
      { data: { pagamentoId: i.id } },
      {
        onSuccess: () => qc.invalidateQueries({ queryKey: getListarPendenciasQueryKey() }),
      },
    );
    window.open(linkWhatsapp(tel, msg), "_blank", "noopener");
  }

  async function handleSalvarModelo(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    await salvarConf.mutateAsync({
      chave: "modelo_whatsapp_inadimplencia",
      data: { valor: modeloAtual.trim() || MODELO_WHATSAPP_PADRAO },
    });
    setModeloSalvo(true);
    window.setTimeout(() => setModeloSalvo(false), 2000);
  }

  if (isLoading) return <p className="text-sm text-neutral-500">Carregando...</p>;

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Pendências</h1>
        <p className="text-sm text-neutral-500">Obrigações atrasadas e clientes inadimplentes</p>
      </div>

      <div className="mb-6 flex items-center gap-2">
        <label className="text-sm text-neutral-600 dark:text-neutral-400">
          Filtrar por cliente:
        </label>
        <select
          value={filtro}
          onChange={(e) => setFiltro(Number(e.target.value))}
          className="rounded-lg border border-black/15 bg-transparent px-3 py-2 text-sm dark:border-white/15"
        >
          <option value={0}>Todos</option>
          {opcoesClientes.map(([id, nome]) => (
            <option key={id} value={id}>
              {nome}
            </option>
          ))}
        </select>
      </div>

      <section className="mb-10">
        <h2 className="mb-3 text-lg font-semibold">
          Obrigações em atraso{" "}
          <span className="text-sm font-normal text-neutral-500">({obrsView.length})</span>
        </h2>
        <div className="overflow-x-auto rounded-xl border border-black/10 dark:border-white/10">
          <table className="w-full text-left text-sm">
            <thead className="bg-black/5 dark:bg-white/5">
              <tr>
                <th className="px-3 py-3 font-medium">Cliente</th>
                <th className="px-3 py-3 font-medium">Obrigação</th>
                <th className="px-3 py-3 font-medium">Situação</th>
                <th className="px-3 py-3 font-medium">Competência</th>
                <th className="px-3 py-3 font-medium">Vencimento</th>
                <th className="px-3 py-3 font-medium">Atraso</th>
                <th className="px-3 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-black/10 dark:divide-white/10">
              {obrsView.map((o) => (
                <tr key={o.id}>
                  <td className="px-3 py-3">
                    <span className="text-neutral-400">{o.codigo ?? "—"}</span> {o.cliente}
                  </td>
                  <td className="px-3 py-3">{o.obrigacao}</td>
                  <td className="px-3 py-3">
                    {o.status === "emitido" ? (
                      <span
                        className="rounded bg-blue-500/15 px-2 py-0.5 text-xs text-blue-700 dark:text-blue-300"
                        title="Guia pronta, mas ainda não enviada ao cliente"
                      >
                        Emitida, não enviada
                      </span>
                    ) : (
                      <span className="rounded bg-amber-500/15 px-2 py-0.5 text-xs text-amber-700 dark:text-amber-300">
                        Pendente
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-3">{rotuloCompetencia(o.ano, o.mes)}</td>
                  <td className="px-3 py-3">{formatarData(o.vencimento)}</td>
                  <td className="px-3 py-3 text-red-600">{o.diasAtraso} dia(s)</td>
                  <td className="px-3 py-3 text-right">
                    <button
                      onClick={() => handleMarcarFeito(o)}
                      className="text-xs text-green-600 hover:underline"
                    >
                      Marcar enviado
                    </button>
                  </td>
                </tr>
              ))}
              {obrsView.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-3 py-6 text-center text-neutral-500">
                    Nenhuma obrigação em atraso. 🎉
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mb-10">
        <h2 className="mb-3 text-lg font-semibold">
          Clientes inadimplentes{" "}
          <span className="text-sm font-normal text-neutral-500">({inadsView.length})</span>
        </h2>
        <div className="overflow-x-auto rounded-xl border border-black/10 dark:border-white/10">
          <table className="w-full text-left text-sm">
            <thead className="bg-black/5 dark:bg-white/5">
              <tr>
                <th className="px-3 py-3 font-medium">Cliente</th>
                <th className="px-3 py-3 font-medium">Competência</th>
                <th className="px-3 py-3 font-medium">Valor</th>
                <th className="px-3 py-3 font-medium">Vencimento</th>
                <th className="px-3 py-3 font-medium">Atraso</th>
                <th className="px-3 py-3 font-medium">Cobrança</th>
                <th className="px-3 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-black/10 dark:divide-white/10">
              {inadsView.map((i) => (
                <tr key={i.id}>
                  <td className="px-3 py-3">
                    <span className="text-neutral-400">{i.codigo ?? "—"}</span> {i.cliente}
                  </td>
                  <td className="px-3 py-3">{rotuloCompetencia(i.ano, i.mes)}</td>
                  <td className="px-3 py-3">{formatarMoeda(i.valor)}</td>
                  <td className="px-3 py-3">{formatarData(i.vencimento)}</td>
                  <td className="px-3 py-3 text-red-600">{i.diasAtraso} dia(s)</td>
                  <td className="px-3 py-3 text-xs text-neutral-500">
                    {i.cobradoEm ? `cobrado em ${formatarData(i.cobradoEm)}` : "—"}
                  </td>
                  <td className="px-3 py-3 text-right">
                    <div className="flex justify-end gap-3">
                      {normalizarTelefone(i.whatsapp) ? (
                        <button
                          onClick={() => cobrar(i)}
                          className="text-xs text-green-700 hover:underline"
                        >
                          WhatsApp
                        </button>
                      ) : (
                        <span className="text-xs text-neutral-400" title="Sem WhatsApp cadastrado">
                          sem zap
                        </span>
                      )}
                      <button
                        onClick={() => handleMarcarPago(i)}
                        className="text-xs text-blue-600 hover:underline"
                      >
                        Marcar pago
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {inadsView.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-3 py-6 text-center text-neutral-500">
                    Nenhum cliente inadimplente. 🎉
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold">Modelo da mensagem de cobrança</h2>
        <form
          onSubmit={handleSalvarModelo}
          className="max-w-2xl rounded-xl border border-black/10 p-4 dark:border-white/10"
        >
          <textarea
            value={modeloAtual}
            onChange={(e) => setModeloEdit(e.target.value)}
            rows={4}
            aria-label="Modelo da mensagem de cobrança"
            className="w-full rounded-lg border border-black/15 bg-transparent px-3 py-2 text-sm dark:border-white/15"
          />
          <p className="mt-2 text-xs text-neutral-500">
            Variáveis: {"{cliente}"} {"{valor}"} {"{competencia}"} {"{vencimento}"}{" "}
            {"{dias_atraso}"}
          </p>
          <div className="mt-3 flex items-center gap-3">
            <button
              type="submit"
              disabled={salvarConf.isPending || modeloAtual === modelo}
              className="rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
            >
              {salvarConf.isPending ? "Salvando..." : "Salvar modelo"}
            </button>
            {modeloSalvo && <span className="text-sm text-green-600">✓ modelo salvo</span>}
          </div>
        </form>
      </section>
    </div>
  );
}
