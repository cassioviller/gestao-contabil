"use client";

import { useState } from "react";
import { salvarCliente, removerCliente } from "@/lib/acoes";
import { formatarMoeda } from "@/lib/formato";

type Tipo = { id: number; nome: string };
type Cliente = {
  id: number;
  codigo: number | null;
  razaoSocial: string;
  cnpj: string | null;
  inscricaoEstadual: string | null;
  formaEnvio: string | null;
  procuracao: string | null;
  senhaNfse: string | null;
  observacao: string | null;
  valorHonorario: string | null;
  diaVencimentoHonorario: number | null;
  whatsapp: string | null;
  ativo: boolean;
  obrigacoes: number[];
};

export default function ClientesUI({
  clientes,
  tipos,
}: {
  clientes: Cliente[];
  tipos: Tipo[];
}) {
  // null = formulário fechado; objeto = editando (id presente) ou novo (id 0).
  const [editando, setEditando] = useState<Cliente | null>(null);
  const [busca, setBusca] = useState("");

  const novo: Cliente = {
    id: 0,
    codigo: null,
    razaoSocial: "",
    cnpj: "",
    inscricaoEstadual: "",
    formaEnvio: "",
    procuracao: "",
    senhaNfse: "",
    observacao: "",
    valorHonorario: "",
    diaVencimentoHonorario: null,
    whatsapp: "",
    ativo: true,
    obrigacoes: [],
  };

  const filtrados = clientes.filter((c) => {
    const t = busca.trim().toLowerCase();
    if (!t) return true;
    return (
      c.razaoSocial.toLowerCase().includes(t) ||
      (c.cnpj ?? "").toLowerCase().includes(t) ||
      String(c.codigo ?? "").includes(t)
    );
  });

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Clientes</h1>
          <p className="text-sm text-neutral-500">
            {clientes.length} cadastrado(s)
          </p>
        </div>
        <button
          onClick={() => setEditando(novo)}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          + Novo cliente
        </button>
      </div>

      <input
        value={busca}
        onChange={(e) => setBusca(e.target.value)}
        placeholder="Buscar por nome, CNPJ ou código…"
        className="mb-4 w-full rounded-lg border border-black/15 bg-transparent px-3 py-2 text-sm dark:border-white/15 sm:w-80"
      />

      <div className="overflow-x-auto rounded-xl border border-black/10 dark:border-white/10">
        <table className="w-full text-left text-sm">
          <thead className="bg-black/5 dark:bg-white/5">
            <tr>
              <th className="px-3 py-3 font-medium">Cód.</th>
              <th className="px-3 py-3 font-medium">Empresa</th>
              <th className="px-3 py-3 font-medium">CNPJ</th>
              <th className="px-3 py-3 font-medium">Honorário</th>
              <th className="px-3 py-3 font-medium">Obrigações</th>
              <th className="px-3 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-black/10 dark:divide-white/10">
            {filtrados.map((c) => (
              <tr key={c.id} className={c.ativo ? "" : "opacity-50"}>
                <td className="px-3 py-3 text-neutral-500">{c.codigo ?? "—"}</td>
                <td className="px-3 py-3">
                  <p className="font-medium">{c.razaoSocial}</p>
                  {!c.ativo && (
                    <span className="text-xs text-red-500">inativo</span>
                  )}
                </td>
                <td className="px-3 py-3 text-neutral-600 dark:text-neutral-400">
                  {c.cnpj || "—"}
                </td>
                <td className="px-3 py-3">{formatarMoeda(c.valorHonorario)}</td>
                <td className="px-3 py-3">
                  <span className="text-xs text-neutral-500">
                    {c.obrigacoes.length} obrigação(ões)
                  </span>
                </td>
                <td className="px-3 py-3 text-right">
                  <button
                    onClick={() => setEditando(c)}
                    className="text-xs text-blue-600 hover:underline"
                  >
                    Editar
                  </button>
                </td>
              </tr>
            ))}
            {filtrados.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-neutral-500">
                  Nenhum cliente encontrado.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {editando && (
        <FormularioCliente
          cliente={editando}
          tipos={tipos}
          aoFechar={() => setEditando(null)}
        />
      )}
    </div>
  );
}

function FormularioCliente({
  cliente,
  tipos,
  aoFechar,
}: {
  cliente: Cliente;
  tipos: Tipo[];
  aoFechar: () => void;
}) {
  const ehNovo = cliente.id === 0;
  return (
    <div className="fixed inset-0 z-10 flex items-start justify-center overflow-y-auto bg-black/40 p-4">
      <div className="my-8 w-full max-w-2xl rounded-xl border border-black/10 bg-white p-6 shadow-xl dark:border-white/10 dark:bg-neutral-950">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">
            {ehNovo ? "Novo cliente" : `Editar — ${cliente.razaoSocial}`}
          </h2>
          <button onClick={aoFechar} className="text-neutral-500 hover:text-neutral-800">
            ✕
          </button>
        </div>

        <form
          action={async (fd) => {
            await salvarCliente(fd);
            aoFechar();
          }}
          className="grid grid-cols-1 gap-4 sm:grid-cols-2"
        >
          {!ehNovo && <input type="hidden" name="id" value={cliente.id} />}

          <Campo label="Código" name="codigo" defaultValue={cliente.codigo ?? ""} type="number" />
          <Campo label="Razão social *" name="razaoSocial" defaultValue={cliente.razaoSocial} required />
          <Campo label="CNPJ" name="cnpj" defaultValue={cliente.cnpj ?? ""} />
          <Campo label="Inscrição estadual" name="inscricaoEstadual" defaultValue={cliente.inscricaoEstadual ?? ""} />
          <Campo label="Forma de envio" name="formaEnvio" defaultValue={cliente.formaEnvio ?? ""} />
          <Campo label="Procuração" name="procuracao" defaultValue={cliente.procuracao ?? ""} />
          <Campo label="Senha NFS-e" name="senhaNfse" defaultValue={cliente.senhaNfse ?? ""} />
          <Campo
            label="Honorário mensal (R$)"
            name="valorHonorario"
            defaultValue={cliente.valorHonorario ?? ""}
            placeholder="ex: 350,00"
          />
          <Campo
            label="WhatsApp"
            name="whatsapp"
            defaultValue={cliente.whatsapp ?? ""}
            placeholder="ex: (11) 99999-9999"
          />
          <Campo
            label="Dia venc. honorário"
            name="diaVencimentoHonorario"
            defaultValue={cliente.diaVencimentoHonorario ?? ""}
            type="number"
            placeholder="ex: 10"
          />

          <label className="flex flex-col gap-1 text-sm sm:col-span-2">
            <span className="text-neutral-600 dark:text-neutral-400">Observação</span>
            <textarea
              name="observacao"
              defaultValue={cliente.observacao ?? ""}
              rows={2}
              className="rounded-lg border border-black/15 bg-transparent px-3 py-2 dark:border-white/15"
            />
          </label>

          <fieldset className="sm:col-span-2">
            <legend className="mb-2 text-sm text-neutral-600 dark:text-neutral-400">
              Obrigações deste cliente
            </legend>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {tipos.map((t) => (
                <label key={t.id} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    name={`obrig_${t.id}`}
                    defaultChecked={cliente.obrigacoes.includes(t.id)}
                  />
                  {t.nome}
                </label>
              ))}
            </div>
          </fieldset>

          <label className="flex items-center gap-2 text-sm sm:col-span-2">
            <input type="checkbox" name="ativo" defaultChecked={cliente.ativo} />
            Cliente ativo
          </label>

          <div className="flex items-center justify-between gap-2 sm:col-span-2">
            {!ehNovo ? (
              <button
                type="button"
                onClick={async () => {
                  if (!confirm("Remover este cliente? Isso apaga seu histórico.")) return;
                  const fd = new FormData();
                  fd.set("id", String(cliente.id));
                  await removerCliente(fd);
                  aoFechar();
                }}
                className="text-sm text-red-600 hover:underline"
              >
                Remover
              </button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={aoFechar}
                className="rounded-lg border border-black/15 px-4 py-2 text-sm dark:border-white/15"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700"
              >
                Salvar
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

function Campo({
  label,
  name,
  defaultValue,
  type = "text",
  required,
  placeholder,
}: {
  label: string;
  name: string;
  defaultValue: string | number;
  type?: string;
  required?: boolean;
  placeholder?: string;
}) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="text-neutral-600 dark:text-neutral-400">{label}</span>
      <input
        name={name}
        type={type}
        defaultValue={defaultValue}
        required={required}
        placeholder={placeholder}
        className="rounded-lg border border-black/15 bg-transparent px-3 py-2 dark:border-white/15"
      />
    </label>
  );
}
