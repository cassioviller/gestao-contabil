import { useEffect, useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  getGetPerfilQueryKey,
  getGetSessaoAtualQueryKey,
  useGetPerfil,
  useSalvarPerfil,
} from "@workspace/api-client-react";
import type { Perfil as PerfilDados } from "@workspace/api-client-react";

const CAMPOS = [
  { nome: "nome", rotulo: "Razão social", obrigatorio: true, dica: "AZ Contabilidade" },
  { nome: "cnpj", rotulo: "CNPJ", dica: "00.000.000/0000-00" },
  { nome: "responsavel", rotulo: "Contadora responsável", dica: "Nome de quem assina" },
  { nome: "crc", rotulo: "CRC", dica: "Registro no conselho" },
  { nome: "telefone", rotulo: "Telefone / WhatsApp", dica: "(00) 00000-0000" },
  { nome: "email", rotulo: "E-mail", dica: "contato@escritorio.com.br" },
  { nome: "endereco", rotulo: "Endereço", dica: "Rua, número, bairro, cidade" },
] as const;

type Campo = (typeof CAMPOS)[number]["nome"];

export default function Perfil() {
  const qc = useQueryClient();
  const { data: perfil, isLoading } = useGetPerfil();
  const salvar = useSalvarPerfil();

  const [form, setForm] = useState<Record<Campo, string>>({
    nome: "",
    cnpj: "",
    responsavel: "",
    crc: "",
    telefone: "",
    email: "",
    endereco: "",
  });
  const [salvo, setSalvo] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  // O formulário só é preenchido quando o perfil chega — antes disso os campos
  // ficariam controlados por "undefined" e o React reclamaria da troca.
  useEffect(() => {
    if (!perfil) return;
    const p = perfil as PerfilDados;
    setForm({
      nome: p.nome ?? "",
      cnpj: p.cnpj ?? "",
      responsavel: p.responsavel ?? "",
      crc: p.crc ?? "",
      telefone: p.telefone ?? "",
      email: p.email ?? "",
      endereco: p.endereco ?? "",
    });
  }, [perfil]);

  async function enviar(evento: FormEvent) {
    evento.preventDefault();
    setErro(null);
    try {
      // Campo em branco vai como null, não como "": o banco distingue "não
      // preenchido" de "preenchido com nada", e as telas checam por nulo.
      const dados = Object.fromEntries(
        CAMPOS.map((c) => [c.nome, form[c.nome].trim() || null]),
      ) as unknown as PerfilDados;
      await salvar.mutateAsync({ data: { ...dados, nome: form.nome.trim() } as never });
      qc.invalidateQueries({ queryKey: getGetPerfilQueryKey() });
      // O menu mostra o nome do escritório vindo da sessão — sem isto ele só
      // mudaria no próximo login.
      qc.invalidateQueries({ queryKey: getGetSessaoAtualQueryKey() });
      setSalvo(true);
      window.setTimeout(() => setSalvo(false), 2000);
    } catch (e) {
      setErro(e instanceof Error && e.message ? e.message : "Não foi possível salvar.");
    }
  }

  const campo =
    "w-full rounded-lg border border-black/15 bg-transparent px-3 py-2 text-sm dark:border-white/15";

  if (isLoading) return <p className="text-sm text-neutral-500">Carregando...</p>;

  return (
    <div className="max-w-2xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Perfil do escritório</h1>
        <p className="text-sm text-neutral-500">
          Os dados da contabilidade — aparecem no menu e nos textos de cobrança.
        </p>
      </div>

      {erro && (
        <p role="alert" className="mb-4 rounded-lg bg-red-600/10 px-3 py-2 text-sm text-red-700 dark:text-red-400">
          {erro}
        </p>
      )}

      <form onSubmit={enviar} className="grid gap-4 sm:grid-cols-2">
        {CAMPOS.map((c) => (
          <label key={c.nome} className={c.nome === "endereco" ? "sm:col-span-2" : ""}>
            <span className="mb-1 block text-sm font-medium">
              {c.rotulo}
              {"obrigatorio" in c && c.obrigatorio ? " *" : ""}
            </span>
            <input
              name={c.nome}
              value={form[c.nome]}
              onChange={(e) => setForm((f) => ({ ...f, [c.nome]: e.target.value }))}
              placeholder={c.dica}
              required={"obrigatorio" in c && c.obrigatorio}
              className={campo}
            />
          </label>
        ))}

        <div className="flex items-center gap-3 sm:col-span-2">
          <button
            type="submit"
            disabled={salvar.isPending || !form.nome.trim()}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {salvar.isPending ? "Salvando..." : "Salvar perfil"}
          </button>
          {salvo && <span className="text-sm text-green-600">✓ salvo</span>}
        </div>
      </form>
    </div>
  );
}
