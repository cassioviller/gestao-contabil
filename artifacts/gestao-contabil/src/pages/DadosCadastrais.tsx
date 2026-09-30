import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListarClientes,
  getListarClientesQueryKey,
  useCriarCliente,
  useAtualizarCliente,
  useRemoverCliente,
  getSegredosCliente,
} from "@workspace/api-client-react";
import { REGIMES, formatarNumeroBR, hojeBR, paraDecimalAPI, rotuloRegime } from "@/lib/formato";
import { paraCsv } from "@workspace/dominio";
import { mensagemDeErro } from "@/lib/erros";

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
  /** A listagem só diz se há senha; o valor vem de /clientes/:id/segredos. */
  temSenhaGov: boolean;
  temSenhaNfse: boolean;
  procuracaoVencimento: string | null;
  valorHonorario: string | null;
  diaVencimentoHonorario: number | null;
  contatoNome: string | null;
  whatsapp: string | null;
  email: string | null;
  observacao: string | null;
  ativo: boolean;
};

type CampoSenha = "senhaGov" | "senhaNfse";
type Campo = keyof Omit<Cliente, "id" | "ativo" | "temSenhaGov" | "temSenhaNfse"> | CampoSenha;
type Segredos = { senhaGov: string | null; senhaNfse: string | null };

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

/** Converte o texto digitado no tipo que a API espera para aquele campo. */
function normalizar(campo: Campo, bruto: string): string | number | null {
  const v = bruto.trim();
  if (campo === "codigo" || campo === "diaVencimentoHonorario") return v ? Number(v) : null;
  if (campo === "razaoSocial") return v;
  // "1.350,00" (pt-BR) → "1350.00", que é o formato que o numeric do Postgres aceita.
  if (campo === "valorHonorario") return paraDecimalAPI(v);
  return v || null;
}

function baixarCsv(clientes: Cliente[]) {
  // Senhas nunca vão para o arquivo: um CSV circula por e-mail e pendrive.
  const colunas = COLUNAS.filter((c) => !c.senha);
  const cabecalho = ["Cód.", "Empresa", ...colunas.map((c) => c.rotulo), "Ativo"];
  const corpo = clientes.map((c) => [
    String(c.codigo ?? ""),
    c.razaoSocial,
    // Colunas de lista exportam o rótulo legível, não o valor do enum.
    ...colunas.map((col) => {
      const valor = (c as unknown as Record<string, unknown>)[col.campo];
      return col.opcoes ? rotuloRegime(valor as string) : String(valor ?? "");
    }),
    c.ativo ? "Sim" : "Não",
  ]);
  const blob = new Blob([paraCsv([cabecalho, ...corpo])], {
    type: "text/csv;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `dados-cadastrais-${hojeBR()}.csv`;
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
  // Senhas reveladas nesta tela, por cliente. Cada revelação é um pedido à API
  // que fica na auditoria — por isso é por linha, não um botão "mostrar todas".
  const [reveladas, setReveladas] = useState<Record<number, Segredos>>({});
  const [erro, setErro] = useState<string | null>(null);
  const [salvo, setSalvo] = useState(false);
  const hoje = hojeBR();

  async function revelar(id: number) {
    setErro(null);
    try {
      const segredos = await getSegredosCliente(id);
      setReveladas((r) => ({ ...r, [id]: segredos }));
    } catch (e) {
      setErro(mensagemDeErro(e, "Não foi possível revelar a senha."));
    }
  }

  function ocultar(id: number) {
    setReveladas((r) => {
      const { [id]: _fora, ...resto } = r;
      return resto;
    });
  }

  async function salvarSenha(id: number, campo: CampoSenha, digitado: string) {
    const valor = digitado.trim() || null;
    await salvarCampo(id, campo, valor);
    setReveladas((r) => (r[id] ? { ...r, [id]: { ...r[id], [campo]: valor } } : r));
  }

  function invalidar() {
    qc.invalidateQueries({ queryKey: getListarClientesQueryKey() });
  }

  async function salvarCampo(id: number, campo: Campo | "ativo", valor: unknown) {
    setErro(null);
    try {
      await atualizar.mutateAsync({ id, data: { [campo]: valor } as never });
      invalidar();
      setSalvo(true);
      window.setTimeout(() => setSalvo(false), 1500);
    } catch (e) {
      setErro(mensagemDeErro(e, "Não foi possível salvar."));
    }
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

  const celula = "border-r border-black/10 p-0";
  const entrada =
    "h-9 w-full bg-transparent px-2 text-sm outline-none focus:bg-blue-50 focus:ring-2 focus:ring-inset focus:ring-blue-500";
  const fixa = "bg-white";
  // Fundo explícito no select: com `bg-transparent` o navegador desenha a lista
  // suspensa com a cor herdada e o texto pode sumir.
  const selecao =
    "h-9 w-full bg-white px-2 text-sm text-black outline-none focus:ring-2 focus:ring-inset focus:ring-blue-500";

  return (
    // Esta tela é sempre clara, independente do tema. O `-m-8 p-8` anula o
    // padding do <main> para o branco cobrir a área toda, sem moldura escura.
    <div data-tela="cadastro" className="-m-8 min-h-screen bg-white p-8 text-black">
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
            onClick={() => baixarCsv(filtrados)}
            className="rounded-lg border border-black/15 px-3 py-2 text-sm"
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

      {erro && (
        <p role="alert" className="mb-3 rounded-lg bg-red-600/10 px-3 py-2 text-sm text-red-700">
          {erro}
        </p>
      )}

      <input
        value={busca}
        onChange={(e) => setBusca(e.target.value)}
        placeholder="Buscar por empresa, CNPJ, sócio, contato ou e-mail…"
        className="mb-4 w-full rounded-lg border border-black/15 bg-transparent px-3 py-2 text-sm sm:w-96"
      />

      {isLoading ? (
        <p className="text-sm text-neutral-500">Carregando...</p>
      ) : (
        <div className="max-h-[calc(100vh-16rem)] overflow-auto rounded-xl border border-black/10">
          <table className="border-collapse text-left text-sm">
            <thead className="sticky top-0 z-30">
              <tr className="border-b-2 border-black/20 bg-white">
                <th className={`sticky left-0 z-40 w-16 bg-white px-2 py-2 font-medium ${celula}`}>
                  Cód.
                </th>
                <th className={`sticky left-16 z-40 w-64 bg-white px-2 py-2 font-medium ${celula}`}>
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
            <tbody className="divide-y divide-black/10">
              {filtrados.map((c) => {
                const vencida = !!c.procuracaoVencimento && c.procuracaoVencimento < hoje;
                return (
                  <tr key={c.id} className={c.ativo ? "" : "bg-black/[0.03]"}>
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
                      if (col.senha) {
                        const campo = col.campo as CampoSenha;
                        const revelada = reveladas[c.id];
                        const tem = campo === "senhaGov" ? c.temSenhaGov : c.temSenhaNfse;
                        const valor = revelada ? (revelada[campo] ?? "") : "";
                        const rotulo = col.rotulo.toLowerCase();
                        return (
                          <td key={col.campo} className={`${col.largura} ${celula}`}>
                            <div className="flex items-center">
                              <input
                                // Remonta ao revelar/ocultar para o defaultValue valer de novo.
                                key={revelada ? "aberta" : "fechada"}
                                type={revelada ? "text" : "password"}
                                name={col.campo}
                                defaultValue={valor}
                                placeholder={revelada ? "—" : tem ? "••••••••" : "—"}
                                autoComplete="new-password"
                                title={tem && !revelada ? "Há senha gravada; digite para substituir ou revele" : undefined}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") e.currentTarget.blur();
                                  if (e.key === "Escape") {
                                    e.currentTarget.value = valor;
                                    e.currentTarget.blur();
                                  }
                                }}
                                onBlur={(e) => {
                                  const digitado = e.target.value;
                                  // Fechada: só grava se algo foi digitado (vazio = não mexer).
                                  if (revelada ? digitado !== valor : digitado !== "") {
                                    salvarSenha(c.id, campo, digitado);
                                  }
                                }}
                                className={entrada}
                              />
                              <button
                                type="button"
                                title={revelada ? `Ocultar ${rotulo}` : `Revelar ${rotulo}`}
                                onClick={() => (revelada ? ocultar(c.id) : revelar(c.id))}
                                className="px-1 text-neutral-500 hover:text-black"
                              >
                                {revelada ? "🙈" : "👁"}
                              </button>
                            </div>
                          </td>
                        );
                      }
                      const atual = c[col.campo as keyof Cliente];
                      const alerta = col.campo === "procuracaoVencimento" && vencida;
                      // Dinheiro é exibido em pt-BR ("350,00") e comparado já
                      // normalizado: assim reeditar sem mexer não grava nada.
                      const ehMoeda = col.campo === "valorHonorario";
                      const exibido = ehMoeda
                        ? formatarNumeroBR(atual as string | null)
                        : ((atual as string | number | null) ?? "");
                      const mudou = (digitado: string) =>
                        ehMoeda
                          ? paraDecimalAPI(digitado) !== ((atual as string | null) ?? null)
                          : String(atual ?? "") !== digitado.trim();
                      if (col.opcoes) {
                        return (
                          <td key={col.campo} className={`${col.largura} ${celula}`}>
                            <select
                              name={col.campo}
                              value={(atual as string | null) ?? ""}
                              onChange={(e) => salvarCampo(c.id, col.campo, e.target.value || null)}
                              className={selecao}
                            >
                              <option value="" className="bg-white text-black">
                                —
                              </option>
                              {col.opcoes.map((o) => (
                                <option key={o.valor} value={o.valor} className="bg-white text-black">
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
                            type={col.tipo ?? "text"}
                            name={col.campo}
                            defaultValue={exibido}
                            placeholder={col.placeholder}
                            title={alerta ? "Procuração vencida" : undefined}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") e.currentTarget.blur();
                              if (e.key === "Escape") {
                                e.currentTarget.value = String(exibido);
                                e.currentTarget.blur();
                              }
                            }}
                            onBlur={(e) => {
                              if (mudou(e.target.value))
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
        Senhas ficam cifradas no banco; cada revelação (👁) fica registrada com usuário, data e IP. Procuração vencida aparece em vermelho.
      </p>
    </div>
  );
}
