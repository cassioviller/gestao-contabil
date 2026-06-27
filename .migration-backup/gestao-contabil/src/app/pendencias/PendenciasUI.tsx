"use client";

import { useMemo, useState, useTransition } from "react";
import {
  atualizarStatusItem,
  marcarPagamentoPago,
  registrarCobranca,
  salvarConfiguracao,
} from "@/lib/acoes";
import { formatarData, formatarMoeda, rotuloCompetencia } from "@/lib/formato";
import { linkWhatsapp, montarMensagem, normalizarTelefone } from "@/lib/whatsapp";

type Obrigacao = {
  id: number;
  competenciaId: number;
  ano: number;
  mes: number;
  vencimento: string | null;
  diasAtraso: number;
  clienteId: number;
  codigo: number | null;
  cliente: string;
  obrigacao: string;
};

type Inadimplente = {
  id: number;
  competenciaId: number;
  ano: number;
  mes: number;
  valor: string | null;
  vencimento: string | null;
  diasAtraso: number;
  clienteId: number;
  codigo: number | null;
  cliente: string;
  whatsapp: string | null;
  cobradoEm: string | null;
};

export default function PendenciasUI({
  obrigacoes,
  inadimplentes,
  modelo,
}: {
  obrigacoes: Obrigacao[];
  inadimplentes: Inadimplente[];
  modelo: string;
}) {
  const [obrs, setObrs] = useState(obrigacoes);
  const [inads, setInads] = useState(inadimplentes);
  const [filtro, setFiltro] = useState(0); // 0 = todos; senão clienteId
  const [, startTransition] = useTransition();

  // Lista de clientes presentes nas duas tabelas, para o filtro.
  const opcoesClientes = useMemo(() => {
    const m = new Map<number, string>();
    for (const o of obrs) m.set(o.clienteId, o.cliente);
    for (const i of inads) m.set(i.clienteId, i.cliente);
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [obrs, inads]);

  const obrsView = filtro ? obrs.filter((o) => o.clienteId === filtro) : obrs;
  const inadsView = filtro ? inads.filter((i) => i.clienteId === filtro) : inads;

  function marcarFeito(o: Obrigacao) {
    setObrs((s) => s.filter((x) => x.id !== o.id));
    const fd = new FormData();
    fd.set("id", String(o.id));
    fd.set("status", "feito");
    fd.set("competenciaId", String(o.competenciaId));
    startTransition(() => {
      atualizarStatusItem(fd);
    });
  }

  function marcarPago(i: Inadimplente) {
    setInads((s) => s.filter((x) => x.id !== i.id));
    const fd = new FormData();
    fd.set("id", String(i.id));
    startTransition(() => {
      marcarPagamentoPago(fd);
    });
  }

  function cobrar(i: Inadimplente) {
    const tel = normalizarTelefone(i.whatsapp);
    if (!tel) return;
    const msg = montarMensagem(modelo, {
      cliente: i.cliente,
      valor: formatarMoeda(i.valor),
      competencia: rotuloCompetencia(i.ano, i.mes),
      vencimento: formatarData(i.vencimento),
      dias_atraso: String(i.diasAtraso),
    });
    const fd = new FormData();
    fd.set("pagamentoId", String(i.id));
    startTransition(() => {
      registrarCobranca(fd);
    });
    setInads((s) =>
      s.map((x) => (x.id === i.id ? { ...x, cobradoEm: new Date().toISOString() } : x))
    );
    window.open(linkWhatsapp(tel, msg), "_blank", "noopener");
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Pendências</h1>
        <p className="text-sm text-neutral-500">
          Obrigações atrasadas e clientes inadimplentes
        </p>
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

      {/* Obrigações em atraso */}
      <section className="mb-10">
        <h2 className="mb-3 text-lg font-semibold">
          Obrigações em atraso{" "}
          <span className="text-sm font-normal text-neutral-500">
            ({obrsView.length})
          </span>
        </h2>
        <div className="overflow-x-auto rounded-xl border border-black/10 dark:border-white/10">
          <table className="w-full text-left text-sm">
            <thead className="bg-black/5 dark:bg-white/5">
              <tr>
                <th className="px-3 py-3 font-medium">Cliente</th>
                <th className="px-3 py-3 font-medium">Obrigação</th>
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
                    <span className="text-neutral-400">{o.codigo ?? "—"}</span>{" "}
                    {o.cliente}
                  </td>
                  <td className="px-3 py-3">{o.obrigacao}</td>
                  <td className="px-3 py-3">{rotuloCompetencia(o.ano, o.mes)}</td>
                  <td className="px-3 py-3">{formatarData(o.vencimento)}</td>
                  <td className="px-3 py-3 text-red-600">{o.diasAtraso} dia(s)</td>
                  <td className="px-3 py-3 text-right">
                    <button
                      onClick={() => marcarFeito(o)}
                      className="text-xs text-green-600 hover:underline"
                    >
                      Marcar feito
                    </button>
                  </td>
                </tr>
              ))}
              {obrsView.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-3 py-6 text-center text-neutral-500">
                    Nenhuma obrigação em atraso. 🎉
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Clientes inadimplentes */}
      <section className="mb-10">
        <h2 className="mb-3 text-lg font-semibold">
          Clientes inadimplentes{" "}
          <span className="text-sm font-normal text-neutral-500">
            ({inadsView.length})
          </span>
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
                    <span className="text-neutral-400">{i.codigo ?? "—"}</span>{" "}
                    {i.cliente}
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
                        onClick={() => marcarPago(i)}
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

      {/* Modelo da mensagem */}
      <section>
        <h2 className="mb-3 text-lg font-semibold">Modelo da mensagem de cobrança</h2>
        <form
          action={salvarConfiguracao}
          className="max-w-2xl rounded-xl border border-black/10 p-4 dark:border-white/10"
        >
          <input type="hidden" name="chave" value="modelo_whatsapp_inadimplencia" />
          <textarea
            name="valor"
            defaultValue={modelo}
            rows={4}
            className="w-full rounded-lg border border-black/15 bg-transparent px-3 py-2 text-sm dark:border-white/15"
          />
          <p className="mt-2 text-xs text-neutral-500">
            Variáveis: {"{cliente}"} {"{valor}"} {"{competencia}"} {"{vencimento}"}{" "}
            {"{dias_atraso}"}
          </p>
          <button
            type="submit"
            className="mt-3 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700"
          >
            Salvar modelo
          </button>
        </form>
      </section>
    </div>
  );
}
