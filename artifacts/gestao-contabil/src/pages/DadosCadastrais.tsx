import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListarClientes,
  getListarClientesQueryKey,
  useCriarCliente,
  useAtualizarCliente,
  useRemoverCliente,
} from "@workspace/api-client-react";
import { REGIMES, rotuloRegime } from "@/lib/formato";

type Cliente = {
  id: number;
  codigo: number | null;
  razaoSocial: string;
  cnpj: string | null;
  cnaePrincipal: string | null;
  regime: string | null;
  inscricaoEstadual: string | null;
  inscricaoMunicipal: string | null;
  socioNome: string | null;
  socioCpf: string | null;
  senhaGov: string | null;
  senhaNfse: string | null;
  procuracaoVencimento: string | null;
  valorHonorario: string | null;
  diaVencimentoHonorario: number | null;
  contatoNome: string | null;
  whatsapp: string | null;
  email: string | null;
  observacao: string | null;
  ativo: boolean;
};

type Campo = keyof Omit<Cliente, "id" | "ativo">;

type Coluna = {
  campo: Campo;
  rotulo: string;
  largura: string;
  tipo?: "number" | "date" | "email";
  senha?: boolean;
  placeholder?: string;
  /** Quando presente, a célula vira um <select> em vez de <input> livre. */
  opcoes?: readonly { valor: string; rotulo: string }[];
};

// Ordem das colunas da planilha. `largura` entra como classe Tailwind para as
// células manterem o alinhamento entre <thead> e <tbody>.
const COLUNAS: Coluna[] = [
  { campo: "cnpj", rotulo: "CNPJ", largura: "w-44", placeholder: "00.000.000/0001-00" },
  { campo: "cnaePrincipal", rotulo: "CNAE principal", largura: "w-40", placeholder: "0000-0/00" },
  { campo: "regime", rotulo: "Regime tributário", largura: "w-44", opcoes: REGIMES },
  { campo: "inscricaoMunicipal", rotulo: "Inscr. municipal", largura: "w-40" },
  { campo: "inscricaoEstadual", rotulo: "Inscr. estadual", largura: "w-40" },
  { campo: "socioNome", rotulo: "Sócio principal", largura: "w-56" },
  { campo: "socioCpf", rotulo: "CPF do sócio", largura: "w-40", placeholder: "000.000.000-00" },
  { campo: "senhaGov", rotulo: "Senha gov.br", largura: "w-40", senha: true },
  { campo: "procuracaoVencimento", rotulo: "Vencimento da procuração", largura: "w-48", tipo: "date" },
  { campo: "valorHonorario", rotulo: "Honorário (R$)", largura: "w-32", placeholder: "350,00" },
  { campo: "diaVencimentoHonorario", rotulo: "Dia venc. honorário", largura: "w-36", tipo: "number" },
  { campo: "contatoNome", rotulo: "Contato (WhatsApp)", largura: "w-48" },
  { campo: "whatsapp", rotulo: "WhatsApp", largura: "w-44", placeholder: "(11) 99999-9999" },
  { campo: "email", rotulo: "E-mail de contato", largura: "w-64", tipo: "email" },
  { campo: "senhaNfse", rotulo: "Senha portal NFS-e", largura: "w-44", senha: true },
  { campo: "observacao", rotulo: "Observação", largura: "w-64" },
];

const HOJE = new Date().toISOString().slice(0, 10);

/** Converte o texto digitado no tipo que a API espera para aquele campo. */
function normalizar(campo: Campo, bruto: string): string | number | null {
  const v = bruto.trim();
  if (campo === "codigo" || campo === "diaVencimentoHonorario") return v ? Number(v) : null;
  if (campo === "razaoSocial") return v;
  // "1.350,00" (pt-BR) → "1350.00", que é o formato que o numeric do Postgres aceita.
  if (campo === "valorHonorario") return v ? v.replace(/\./g, "").replace(",", ".") : null;
  return v || null;
}

function paraCsv(linhas: string[][]): string {
  const escapar = (v: string) => `"${v.replace(/"/g, '""')}"`;
  // BOM + separador ";" para o Excel pt-BR abrir em colunas sem pedir importação.
  return "﻿" + linhas.map((l) => l.map(escapar).join(";")).join("\r\n");
}

function baixarCsv(clientes: Cliente[]) {
  const cabecalho = ["Cód.", "Empresa", ...COLUNAS.map((c) => c.rotulo), "Ativo"];
  const corpo = clientes.map((c) => [
    String(c.codigo ?? ""),
    c.razaoSocial,
    // Colunas de lista exportam o rótulo legível, não o valor do enum.
    ...COLUNAS.map((col) =>
      col.opcoes ? rotuloRegime(c[col.campo] as string) : String(c[col.campo] ?? "")
    ),
    c.ativo ? "Sim" : "Não",
  ]);
  const blob = new Blob([paraCsv([cabecalho, ...corpo])], {
    type: "text/csv;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `dados-cadastrais-${HOJE}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function DadosCadastrais() {
  const qc = useQueryClient();
  const { data: clientes = [], isLoading } = useListarClientes();
  const criar = useCriarCliente();
  const atualizar = useAtualizarCliente();
  const remover = useRemoverCliente();

  const [busca, setBusca] = useState("");
  const [revelarSenhas, setRevelarSenhas] = useState(false);
  const [salvo, setSalvo] = useState(false);

  function invalidar() {
    qc.invalidateQueries({ queryKey: getListarClientesQueryKey() });
  }

  async function salvarCampo(id: number, campo: Campo | "ativo", valor: unknown) {
    await atualizar.mutateAsync({ id, data: { [campo]: valor } as never });
    invalidar();
    setSalvo(true);
    window.setTimeout(() => setSalvo(false), 1500);
  }

  async function adicionarEmpresa() {
    const nome = prompt("Razão social da nova empresa:");
    if (!nome?.trim()) return;
    await criar.mutateAsync({
      data: { razaoSocial: nome.trim(), ativo: true, obrigacoes: [] } as never,
    });
    invalidar();
  }

  async function removerEmpresa(c: Cliente) {
    if (!confirm(`Remover "${c.razaoSocial}"? Isso apaga também o histórico dela.`)) return;
    await remover.mutateAsync({ id: c.id });
    invalidar();
  }

  const lista = clientes as unknown as Cliente[];
  const filtrados = lista.filter((c) => {
    const t = busca.trim().toLowerCase();
    if (!t) return true;
    return [c.razaoSocial, c.cnpj, c.socioNome, c.contatoNome, c.email, String(c.codigo ?? "")]
      .some((v) => (v ?? "").toLowerCase().includes(t));
  });

  const celula = "border-r border-black/10 p-0 dark:border-white/10";
  const entrada =
    "h-9 w-full bg-transparent px-2 text-sm outline-none focus:bg-blue-50 focus:ring-2 focus:ring-inset focus:ring-blue-500 dark:focus:bg-blue-950/40";
  const fixa = "bg-white dark:bg-neutral-950";
  // Selects precisam de fundo próprio: com `bg-transparent` o navegador desenha a
  // lista suspensa em branco e o texto claro some.
  const selecao =
    "h-9 w-full bg-neutral-900 px-2 text-sm text-white outline-none focus:ring-2 focus:ring-inset focus:ring-blue-500";

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Dados cadastrais</h1>
          <p className="text-sm text-neutral-500">
            {filtrados.length} empresa(s) · clique em qualquer célula para editar — salva sozinho ao sair do campo
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {salvo && <span className="text-xs text-green-600">✓ salvo</span>}
          <button
            onClick={() => setRevelarSenhas((v) => !v)}
            className="rounded-lg border border-black/15 px-3 py-2 text-sm dark:border-white/15"
          >
            {revelarSenhas ? "🙈 Ocultar senhas" : "👁 Mostrar senhas"}
          </button>
          <button
            onClick={() => baixarCsv(filtrados)}
            className="rounded-lg border border-black/15 px-3 py-2 text-sm dark:border-white/15"
          >
            ⬇ Exportar Excel (.csv)
          </button>
          <button
            onClick={adicionarEmpresa}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            + Nova empresa
          </button>
        </div>
      </div>

      <input
        value={busca}
        onChange={(e) => setBusca(e.target.value)}
        placeholder="Buscar por empresa, CNPJ, sócio, contato ou e-mail…"
        className="mb-4 w-full rounded-lg border border-black/15 bg-transparent px-3 py-2 text-sm dark:border-white/15 sm:w-96"
      />

      {isLoading ? (
        <p className="text-sm text-neutral-500">Carregando...</p>
      ) : (
        <div className="max-h-[calc(100vh-16rem)] overflow-auto rounded-xl border border-black/10 dark:border-white/10">
          <table className="border-collapse text-left text-sm">
            <thead className="sticky top-0 z-30">
              <tr className="bg-neutral-100 dark:bg-neutral-900">
                <th className={`sticky left-0 z-40 w-16 bg-neutral-100 px-2 py-2 font-medium dark:bg-neutral-900 ${celula}`}>
                  Cód.
                </th>
                <th className={`sticky left-16 z-40 w-64 bg-neutral-100 px-2 py-2 font-medium dark:bg-neutral-900 ${celula}`}>
                  Empresa
                </th>
                {COLUNAS.map((col) => (
                  <th key={col.campo} className={`${col.largura} px-2 py-2 font-medium ${celula}`}>
                    {col.rotulo}
                  </th>
                ))}
                <th className="w-20 px-2 py-2 text-center font-medium">Ativo</th>
                <th className="w-10" />
              </tr>
            </thead>
            <tbody className="divide-y divide-black/10 dark:divide-white/10">
              {filtrados.map((c) => {
                const vencida = !!c.procuracaoVencimento && c.procuracaoVencimento < HOJE;
                return (
                  <tr key={c.id} className={c.ativo ? "" : "bg-black/[0.03] dark:bg-white/[0.03]"}>
                    <td className={`sticky left-0 z-20 w-16 ${fixa} ${celula}`}>
                      <input
                        type="number"
                        name="codigo"
                        defaultValue={c.codigo ?? ""}
                        onBlur={(e) => {
                          if (String(c.codigo ?? "") !== e.target.value.trim())
                            salvarCampo(c.id, "codigo", normalizar("codigo", e.target.value));
                        }}
                        className={entrada}
                      />
                    </td>
                    <td className={`sticky left-16 z-20 w-64 ${fixa} ${celula}`}>
                      <input
                        name="razaoSocial"
                        defaultValue={c.razaoSocial}
                        onBlur={(e) => {
                          const v = e.target.value.trim();
                          if (!v) {
                            e.target.value = c.razaoSocial; // razão social é obrigatória
                            return;
                          }
                          if (v !== c.razaoSocial) salvarCampo(c.id, "razaoSocial", v);
                        }}
                        className={`${entrada} font-medium`}
                      />
                    </td>
                    {COLUNAS.map((col) => {
                      const atual = c[col.campo];
                      const alerta = col.campo === "procuracaoVencimento" && vencida;
                      if (col.opcoes) {
                        return (
                          <td key={col.campo} className={`${col.largura} ${celula}`}>
                            <select
                              name={col.campo}
                              value={(atual as string | null) ?? ""}
                              onChange={(e) => salvarCampo(c.id, col.campo, e.target.value || null)}
                              className={selecao}
                            >
                              <option value="" className="bg-neutral-900 text-white">
                                —
                              </option>
                              {col.opcoes.map((o) => (
                                <option key={o.valor} value={o.valor} className="bg-neutral-900 text-white">
                                  {o.rotulo}
                                </option>
                              ))}
                            </select>
                          </td>
                        );
                      }
                      return (
                        <td key={col.campo} className={`${col.largura} ${celula}`}>
                          <input
                            type={col.senha && !revelarSenhas ? "password" : col.tipo ?? "text"}
                            name={col.campo}
                            defaultValue={(atual as string | number | null) ?? ""}
                            placeholder={col.placeholder}
                            title={alerta ? "Procuração vencida" : undefined}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") e.currentTarget.blur();
                              if (e.key === "Escape") {
                                e.currentTarget.value = String(atual ?? "");
                                e.currentTarget.blur();
                              }
                            }}
                            onBlur={(e) => {
                              if (String(atual ?? "") !== e.target.value.trim())
                                salvarCampo(c.id, col.campo, normalizar(col.campo, e.target.value));
                            }}
                            className={`${entrada} ${alerta ? "font-medium text-red-600" : ""}`}
                          />
                        </td>
                      );
                    })}
                    <td className="w-20 px-2 py-2 text-center">
                      <input
                        type="checkbox"
                        checked={c.ativo}
                        onChange={(e) => salvarCampo(c.id, "ativo", e.target.checked)}
                      />
                    </td>
                    <td className="w-10 px-2 py-2 text-center">
                      <button
                        onClick={() => removerEmpresa(c)}
                        title="Remover empresa"
                        className="text-neutral-400 hover:text-red-600"
                      >
                        ✕
                      </button>
                    </td>
                  </tr>
                );
              })}
              {filtrados.length === 0 && (
                <tr>
                  <td colSpan={COLUNAS.length + 4} className="px-3 py-8 text-center text-neutral-500">
                    Nenhuma empresa encontrada.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <p className="mt-3 text-xs text-neutral-500">
        Senhas ficam gravadas em texto no banco — use só em ambiente de confiança. Procuração vencida aparece em vermelho.
      </p>
    </div>
  );
}
