import { test, expect } from "@playwright/test";

// Arquivos (registro → upload → download), avisos na fila e o worker de jobs
// disparado pelo token de serviço. Sem R2 nem Resend, a suíte usa o disco
// local e o mensageiro de memória; o que se prova é o fluxo e os registros.
const EMPRESA = "Anexos LTDA";
const TOKEN = "token-jobs-e2e";

test.describe("arquivos", () => {
  test("registra, sobe pela API, lista, baixa como anexo e remove", async ({ request }) => {
    const criado = await request.post("/api/clientes", { data: { razaoSocial: EMPRESA } });
    const { id: clienteId } = await criado.json();

    const conteudo = Buffer.from("%PDF-1.4 conteúdo de teste");
    const registro = await request.post("/api/arquivos", {
      data: { entidade: "cliente", entidadeId: clienteId, nome: "contrato ç.pdf", mime: "application/pdf", tamanho: conteudo.length },
    });
    expect(registro.status(), await registro.text()).toBe(200);
    const { arquivo, upload, urlConteudo } = await registro.json();
    expect(arquivo.confirmado).toBe(false);
    expect(arquivo.clienteId).toBe(clienteId);
    // Armazenamento local: sem URL assinada, o conteúdo sobe pela API.
    expect(upload).toBeNull();
    expect(urlConteudo).toBe(`/api/arquivos/${arquivo.id}/conteudo`);

    // Antes do upload o arquivo não aparece nem baixa.
    const antes = await (await request.get(`/api/arquivos?entidade=cliente&entidadeId=${clienteId}`)).json();
    expect(antes).toEqual([]);
    expect((await request.get(`/api/arquivos/${arquivo.id}/download-url`)).status()).toBe(400);

    const subido = await request.put(urlConteudo, {
      data: conteudo,
      headers: { "content-type": "application/pdf" },
    });
    expect(subido.status(), await subido.text()).toBe(200);
    const confirmado = await subido.json();
    expect(confirmado.confirmado).toBe(true);
    expect(confirmado.tamanho).toBe(conteudo.length);
    expect(confirmado.sha256).toMatch(/^[0-9a-f]{64}$/);

    const lista = await (await request.get(`/api/arquivos?entidade=cliente&entidadeId=${clienteId}`)).json();
    expect(lista.map((a: { id: number }) => a.id)).toEqual([arquivo.id]);

    const url = await (await request.get(`/api/arquivos/${arquivo.id}/download-url`)).json();
    expect(url.url).toBe(urlConteudo);

    const baixado = await request.get(urlConteudo);
    expect(baixado.status()).toBe(200);
    expect(baixado.headers()["content-type"]).toContain("application/pdf");
    expect(baixado.headers()["content-disposition"]).toContain("attachment");
    expect(baixado.headers()["content-disposition"]).toContain("filename*=UTF-8''contrato%20%C3%A7.pdf");
    expect(Buffer.from(await baixado.body()).equals(conteudo)).toBe(true);

    expect((await request.delete(`/api/arquivos/${arquivo.id}`)).status()).toBe(204);
    expect((await request.get(urlConteudo)).status()).toBe(404);
  });

  test("recusa tipo não permitido, tamanho acima do limite e entidade de outra conta", async ({ request }) => {
    const { id: clienteId } = await (await request.post("/api/clientes", { data: { razaoSocial: "Anexos Inválidos" } })).json();
    const exe = await request.post("/api/arquivos", {
      data: { entidade: "cliente", entidadeId: clienteId, nome: "virus.exe", mime: "application/x-msdownload", tamanho: 10 },
    });
    expect(exe.status()).toBe(400);
    const grande = await request.post("/api/arquivos", {
      data: { entidade: "cliente", entidadeId: clienteId, nome: "g.pdf", mime: "application/pdf", tamanho: 21 * 1024 * 1024 },
    });
    expect(grande.status()).toBe(400);
    const alheio = await request.post("/api/arquivos", {
      data: { entidade: "checklist_item", entidadeId: 999999, nome: "x.pdf", mime: "application/pdf", tamanho: 10 },
    });
    expect(alheio.status()).toBe(404);
    await request.delete(`/api/clientes/${clienteId}`);
  });
});

test.describe("avisos e fila de jobs", () => {
  test("a fila só roda com o token de serviço", async ({ request }) => {
    expect((await request.post("/api/jobs/executar")).status()).toBe(401);
    expect((await request.post("/api/jobs/executar", { headers: { authorization: "Bearer errado" } })).status()).toBe(401);
  });

  test("aviso avulso entra na fila e o worker o envia", async ({ request }) => {
    const criado = await request.post("/api/clientes", {
      data: { razaoSocial: "Avisos LTDA", email: "financeiro@avisos.com.br" },
    });
    const { id: clienteId } = await criado.json();

    const semWhats = await request.post("/api/avisos", {
      data: { clienteId, canal: "whatsapp", corpo: "Olá" },
    });
    expect(semWhats.status()).toBe(400);
    expect((await semWhats.json()).codigo).toBe("sem_destino");

    const aviso = await request.post("/api/avisos", {
      data: { clienteId, canal: "email", assunto: "Guia disponível", corpo: "Sua guia do mês está pronta." },
    });
    expect(aviso.status(), await aviso.text()).toBe(200);
    const pendente = await aviso.json();
    expect(pendente.status).toBe("pendente");
    expect(pendente.destino).toBe("financeiro@avisos.com.br");
    expect(pendente.clienteNome).toBe("Avisos LTDA");

    const rodada = await request.post("/api/jobs/executar", {
      headers: { authorization: `Bearer ${TOKEN}` },
      data: { limiteMs: 10000 },
    });
    expect(rodada.status(), await rodada.text()).toBe(200);
    const resultado = await rodada.json();
    expect(resultado.executados).toBeGreaterThanOrEqual(1);

    const enviados = await (await request.get(`/api/avisos?clienteId=${clienteId}&status=enviado`)).json();
    expect(enviados.map((a: { id: number }) => a.id)).toContain(pendente.id);
    expect(enviados[0].provedorId).toMatch(/^memoria-email-/);
    expect(enviados[0].enviadoEm).toBeTruthy();

    // Reenviar volta para a fila; a rodada seguinte manda de novo.
    const reenviado = await (await request.post(`/api/avisos/${pendente.id}/reenviar`)).json();
    expect(reenviado.status).toBe("pendente");
    await request.post("/api/jobs/executar", { headers: { authorization: `Bearer ${TOKEN}` }, data: { limiteMs: 10000 } });
    const deNovo = await (await request.get(`/api/avisos?clienteId=${clienteId}`)).json();
    expect(deNovo[0].status).toBe("enviado");

    // A lista de jobs é do admin e mostra a tarefa concluída.
    const jobs = await (await request.get("/api/jobs?status=concluido")).json();
    expect(jobs.some((j: { tipo: string }) => j.tipo === "avisos.enviar")).toBe(true);
    // As recorrentes do dia entram uma vez só, por chave.
    const recorrentes = jobs.filter((j: { tipo: string }) => j.tipo === "limpeza");
    expect(recorrentes.length).toBe(1);

    await request.delete(`/api/clientes/${clienteId}`);
  });
});

test.afterAll(async ({ playwright }) => {
  const api = await playwright.request.newContext({ baseURL: "http://localhost:5179" });
  for (const c of await (await api.get("/api/clientes")).json()) {
    if (c.razaoSocial === EMPRESA) await api.delete(`/api/clientes/${c.id}`);
  }
  await api.dispose();
});
