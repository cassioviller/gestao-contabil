import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetProcesso,
  getGetProcessoQueryKey,
  getListarProcessosQueryKey,
  useSalvarProcesso,
  useRemoverProcesso,
  useAdicionarEtapa,
  useAtualizarEtapa,
  useRemoverEtapa,
} from "@workspace/api-client-react";
import { formatarData, hojeBR } from "@/lib/formato";
import {
  STATUS_PROCESSO,
  TEXTOS,
  corStatusProcesso,
  rotuloStatusProcesso,
  atrasado,
  type Categoria,
} from "@/lib/processo";

type Etapa = {
  id: number;
  descricao: string;
  feito: boolean;
  concluidoEm: string | null;
  observacao: string | null;
};

/** Serve /processos/:id e /pedidos/:id — a volta segue a categoria do registro. */
export default function ProcessoDetalhe({ params }: { params: { id: string } }) {
  const [, navegar] = useLocation();
  const id = Number(params.id);
  const qc = useQueryClient();

  const { data: processo, isLoading } = useGetProcesso(id);
  const salvar = useSalvarProcesso();
  const removerProcesso = useRemoverProcesso();
  const adicionar = useAdicionarEtapa();
  const atualizar = useAtualizarEtapa();
  const removerEtapa = useRemoverEtapa();

  const [nova, setNova] = useState("");
  const [erro, setErro] = useState<string | null>(null);

  /**
   * Envolve toda escrita: sem isso uma rejeição vira erro não tratado e o dev
   * overlay cobre a tela inteira em vez de mostrar o que houve.
   */
  async function comAviso(acao: () => Promise<unknown>) {
    setErro(null);
    try {
      await acao();
    } catch (e) {
      setErro(
        e instanceof Error && e.message
          ? `Não foi possível salvar: ${e.message}`
          : "Não foi possível salvar. Verifique se o servidor da API está no ar.",
      );
      recarregar(); // descarta a atualização otimista que não foi aceita
    }
  }

  function recarregar() {
    qc.invalidateQueries({ queryKey: getGetProcessoQueryKey(id) });
    qc.invalidateQueries({ queryKey: getListarProcessosQueryKey() });
  }

  /**
   * Reflete a mudança no cache antes da resposta do servidor. Sem isso o
   * checkbox (controlado) volta sozinho ao valor antigo até o refetch chegar,
   * e o clique parece não ter funcionado.
   */
  function otimista(mudanca: (p: Record<string, unknown>) => Record<string, unknown>) {
    qc.setQueryData(getGetProcessoQueryKey(id), (antigo: unknown) =>
      antigo ? mudanca(antigo as Record<string, unknown>) : antigo,
    );
  }

  function etapaOtimista(etapaId: number, campos: Partial<Etapa>) {
    otimista((p) => ({
      ...p,
      etapas: ((p.etapas as Etapa[]) ?? []).map((e) =>
        e.id === etapaId ? { ...e, ...campos } : e,
      ),
    }));
  }

  if (isLoading) return <p className="text-sm text-neutral-500">Carregando...</p>;
  if (!processo) return <p className="text-sm text-neutral-500">Processo não encontrado.</p>;

  const p = processo as typeof processo & { etapas: Etapa[] };
  const etapas = p.etapas ?? [];
  const feitas = etapas.filter((e) => e.feito).length;
  const pct = etapas.length ? Math.round((feitas / etapas.length) * 100) : 0;
  const vencido = atrasado(p.prazo, p.status);
  const categoria = (p.categoria ?? "processo") as Categoria;
  const txt = TEXTOS[categoria];
  const voltarPara = `/${categoria}s`;

  /** Reenvia o processo inteiro: o POST é upsert e exige clienteId + tipo. */
  async function salvarCampo(campos: Record<string, unknown>) {
    await comAviso(async () => {
      await salvar.mutateAsync({
        data: {
          id: p.id,
          clienteId: p.clienteId,
          categoria,
          tipo: p.tipo,
          titulo: p.titulo,
          status: p.status,
          orgao: p.orgao,
          protocolo: p.protocolo,
          abertoEm: p.abertoEm,
          prazo: p.prazo,
          concluidoEm: p.concluidoEm,
          observacao: p.observacao,
          ...campos,
        } as never,
      });
      recarregar();
    });
  }

  async function mudarStatus(status: string) {
    // Concluir carimba a data; reabrir limpa.
    const concluidoEm = status === "concluido" ? hojeBR() : null;
    otimista((p) => ({ ...p, status, concluidoEm }));
    await salvarCampo({ status, concluidoEm });
  }

  async function adicionarEtapa(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const texto = nova.trim();
    if (!texto) return;
    await comAviso(async () => {
      await adicionar.mutateAsync({ id: p.id, data: { descricao: texto } });
      setNova("");
      recarregar();
    });
  }

  async function excluirProcesso() {
    if (!confirm(`Remover este ${txt.singular} de ${p.clienteNome}? O checklist vai junto.`))
      return;
    await comAviso(async () => {
      await removerProcesso.mutateAsync({ id: p.id });
      qc.invalidateQueries({ queryKey: getListarProcessosQueryKey() });
      navegar(voltarPara);
    });
  }

  const campo =
    "rounded-lg border border-black/15 bg-transparent px-3 py-2 text-sm dark:border-white/15";
  const cartao = "rounded-xl border border-black/10 p-4 dark:border-white/10";

  return (
    <div className="max-w-4xl">
      <Link href={voltarPara} className="text-sm text-blue-600 hover:underline">
        ← {txt.titulo}
      </Link>

      <div className="mb-6 mt-2 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{p.tipo}</h1>
          <p className="text-sm text-neutral-500">
            {p.clienteNome}
            {p.titulo ? ` · ${p.titulo}` : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className={`rounded-full px-2.5 py-1 text-xs ${corStatusProcesso(p.status)}`}>
            {rotuloStatusProcesso(p.status)}
          </span>
          <select
            value={p.status}
            onChange={(e) => mudarStatus(e.target.value)}
            className="rounded-lg border border-black/15 bg-neutral-900 px-3 py-2 text-sm text-white dark:border-white/15"
          >
            {STATUS_PROCESSO.map((s) => (
              <option key={s.valor} value={s.valor} className="bg-neutral-900 text-white">
                {s.rotulo}
              </option>
            ))}
          </select>
        </div>
      </div>

      {erro && (
        <p
          role="alert"
          className="mb-4 rounded-lg bg-red-600/10 px-3 py-2 text-sm text-red-700 dark:text-red-400"
        >
          {erro}
        </p>
      )}

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
        {/* --- Dados do processo --- */}
        <div className={cartao}>
          <h2 className="mb-3 text-sm font-semibold text-neutral-600 dark:text-neutral-400">
            Dados
          </h2>
          <dl className="grid grid-cols-2 gap-3 text-sm">
            {/* Órgão só aparece no trâmite formal; pedido do cliente não tem. */}
            {txt.mostrarOrgao && (
              <div>
                <dt className="text-xs text-neutral-500">Órgão</dt>
                <dd>
                  <input
                    defaultValue={p.orgao ?? ""}
                    placeholder="—"
                    onBlur={(e) =>
                      e.target.value !== (p.orgao ?? "") &&
                      salvarCampo({ orgao: e.target.value || null })
                    }
                    className="w-full bg-transparent outline-none focus:underline"
                  />
                </dd>
              </div>
            )}
            <div>
              <dt className="text-xs text-neutral-500">Protocolo</dt>
              <dd>
                <input
                  defaultValue={p.protocolo ?? ""}
                  placeholder="—"
                  onBlur={(e) =>
                    e.target.value !== (p.protocolo ?? "") &&
                    salvarCampo({ protocolo: e.target.value || null })
                  }
                  className="w-full bg-transparent outline-none focus:underline"
                />
              </dd>
            </div>
            <div>
              <dt className="text-xs text-neutral-500">Aberto em</dt>
              <dd className="text-neutral-600 dark:text-neutral-400">{formatarData(p.abertoEm)}</dd>
            </div>
            <div>
              <dt className="text-xs text-neutral-500">Prazo</dt>
              <dd>
                <input
                  type="date"
                  defaultValue={p.prazo ?? ""}
                  onBlur={(e) =>
                    e.target.value !== (p.prazo ?? "") &&
                    salvarCampo({ prazo: e.target.value || null })
                  }
                  className={`w-full bg-transparent outline-none ${vencido ? "font-medium text-red-600" : ""}`}
                />
                {vencido && <span className="text-xs text-red-600">atrasado</span>}
              </dd>
            </div>
            {p.concluidoEm && (
              <div>
                <dt className="text-xs text-neutral-500">Concluído em</dt>
                <dd className="text-neutral-600 dark:text-neutral-400">
                  {formatarData(p.concluidoEm)}
                </dd>
              </div>
            )}
          </dl>
          <div className="mt-3">
            <p className="mb-1 text-xs text-neutral-500">Observação</p>
            <textarea
              defaultValue={p.observacao ?? ""}
              rows={3}
              placeholder={`Anotações do ${txt.singular}…`}
              onBlur={(e) =>
                e.target.value !== (p.observacao ?? "") &&
                salvarCampo({ observacao: e.target.value || null })
              }
              className={`w-full ${campo}`}
            />
          </div>
        </div>

        {/* --- Progresso --- */}
        <div className={cartao}>
          <h2 className="mb-3 text-sm font-semibold text-neutral-600 dark:text-neutral-400">
            Progresso
          </h2>
          {etapas.length === 0 ? (
            <p className="text-sm text-neutral-500">
              Nenhuma etapa ainda. Adicione abaixo o que precisa ser feito.
            </p>
          ) : (
            <>
              <p className="text-3xl font-bold">{pct}%</p>
              <p className="mb-3 text-sm text-neutral-500">
                {feitas} de {etapas.length} etapa(s) concluída(s)
              </p>
              <div className="h-2 overflow-hidden rounded-full bg-black/10 dark:bg-white/10">
                <div className="h-full bg-green-600 transition-all" style={{ width: `${pct}%` }} />
              </div>
            </>
          )}
          <button onClick={excluirProcesso} className="mt-6 text-xs text-red-600 hover:underline">
            Remover {txt.singular}
          </button>
        </div>
      </div>

      {/* --- Checklist --- */}
      <div className={cartao}>
        <h2 className="mb-3 text-sm font-semibold text-neutral-600 dark:text-neutral-400">
          Checklist do {txt.singular}
        </h2>

        <ul className="mb-4 divide-y divide-black/10 dark:divide-white/10">
          {etapas.map((et) => (
            <li key={et.id} className="flex items-start gap-3 py-2.5">
              <input
                type="checkbox"
                checked={et.feito}
                aria-label={et.descricao}
                onChange={async (e) => {
                  const feito = e.target.checked;
                  etapaOtimista(et.id, {
                    feito,
                    concluidoEm: feito ? new Date().toISOString() : null,
                  });
                  await comAviso(async () => {
                    await atualizar.mutateAsync({ id: et.id, data: { feito } });
                    recarregar();
                  });
                }}
                className="mt-1"
              />
              <div className="flex-1">
                <input
                  defaultValue={et.descricao}
                  onBlur={async (e) => {
                    const v = e.target.value.trim();
                    if (!v) {
                      e.target.value = et.descricao;
                      return;
                    }
                    if (v === et.descricao) return;
                    await comAviso(async () => {
                      await atualizar.mutateAsync({ id: et.id, data: { descricao: v } });
                      recarregar();
                    });
                  }}
                  className={`w-full bg-transparent text-sm outline-none focus:underline ${
                    et.feito ? "text-neutral-400 line-through" : ""
                  }`}
                />
                {et.concluidoEm && (
                  <p className="text-xs text-neutral-500">
                    feito em {formatarData(et.concluidoEm)}
                  </p>
                )}
              </div>
              <button
                title="Remover etapa"
                onClick={async () => {
                  await comAviso(async () => {
                    await removerEtapa.mutateAsync({ id: et.id });
                    recarregar();
                  });
                }}
                className="text-neutral-400 hover:text-red-600"
              >
                ✕
              </button>
            </li>
          ))}
        </ul>

        <form onSubmit={adicionarEtapa} className="flex gap-2">
          <input
            value={nova}
            onChange={(e) => setNova(e.target.value)}
            name="novaEtapa"
            placeholder={txt.exemploEtapa}
            className={`flex-1 ${campo}`}
          />
          <button
            type="submit"
            disabled={adicionar.isPending || !nova.trim()}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            Adicionar
          </button>
        </form>
      </div>
    </div>
  );
}
