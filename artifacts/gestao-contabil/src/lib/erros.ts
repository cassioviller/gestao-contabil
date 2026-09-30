/**
 * Mensagem legível de um erro da API. O cliente gerado lança `ApiError` com o
 * corpo JSON em `data`; a API responde `{ error, mensagem?, issues? }`.
 */
export function mensagemDeErro(erro: unknown, padrao = "Não foi possível concluir."): string {
  if (erro && typeof erro === "object") {
    const data = (erro as { data?: unknown }).data;
    if (data && typeof data === "object") {
      const corpo = data as { mensagem?: unknown; error?: unknown; issues?: unknown[] };
      if (typeof corpo.mensagem === "string" && corpo.mensagem) return corpo.mensagem;
      if (typeof corpo.error === "string" && corpo.error) {
        const detalhe = Array.isArray(corpo.issues) && corpo.issues.length
          ? ` (${corpo.issues
              .map((i) => {
                const issue = i as { path?: unknown[]; message?: string };
                const caminho = Array.isArray(issue.path) ? issue.path.join(".") : "";
                return caminho ? `${caminho}: ${issue.message ?? ""}` : issue.message ?? "";
              })
              .filter(Boolean)
              .join("; ")})`
          : "";
        return `${corpo.error}${detalhe}`;
      }
    }
    const status = (erro as { status?: number }).status;
    if (status === 401) return "Sua sessão expirou. Entre de novo.";
    if (status === 403) return "Você não tem permissão para isso.";
    if (status === 404) return "Registro não encontrado.";
    if (status === 409) return "Já existe um registro igual.";
    if (status === 429) return "Muitas tentativas. Aguarde um pouco.";
    if (status && status >= 500) return "O servidor falhou. Tente de novo em instantes.";
  }
  if (erro instanceof TypeError) return "Sem conexão com o servidor.";
  if (erro instanceof Error && erro.message) return erro.message;
  return padrao;
}
