import { test, expect, request as apiRequest } from "@playwright/test";
import { apagarCliente } from "./apoio";
import { CONTA_E2E } from "./global-setup";

// Fase 2: inativar em vez de excluir, painel de alertas, envio de guia com
// protocolo, produtividade, avisos automáticos e configurações de rotina.
const TOKEN = "token-jobs-e2e";
// "Hoje" em Brasília, como a API calcula (perto da meia-noite o UTC já é amanhã).
const hojeBR = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
const maisDias = (n: number) => {
  const d = new Date(`${hojeBR}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

test.describe.serial("fase 2", () => {
  test("cliente com competência gerada é inativado, não apagado", async ({ request }) => {
    const { id } = await (
      await request.post("/api/clientes", { data: { razaoSocial: "Inativar LTDA" } })
    ).json();
    const tipo = await (
      await request.post("/api/tipos", { data: { nome: "Guia Inativar" } })
    ).json();
    await request.post("/api/clientes", {
      data: { id, razaoSocial: "Inativar LTDA", obrigacoes: [tipo.id] },
    });
    const comp = await (
      await request.post("/api/competencias", { data: { ano: 2088, mes: 1 } })
    ).json();

    const apagar = await request.delete(`/api/clientes/${id}`);
    expect(apagar.status()).toBe(409);
    expect((await apagar.json()).codigo).toBe("tem_historico");

    const inativado = await (await request.post(`/api/clientes/${id}/inativar`)).json();
    expect(inativado.ativo).toBe(false);
    expect(inativado.inativadoEm).toBeTruthy();

    // Inativo não entra no mês seguinte.
    const comp2 = await (
      await request.post("/api/competencias", { data: { ano: 2088, mes: 2 } })
    ).json();
    const itens = await (await request.get(`/api/competencias/${comp2.id}/checklist`)).json();
    expect(itens.some((i: { clienteId: number }) => i.clienteId === id)).toBe(false);

    const reativado = await (await request.post(`/api/clientes/${id}/reativar`)).json();
    expect(reativado.ativo).toBe(true);
    expect(reativado.inativadoEm).toBeNull();

    // Sem histórico, apagar é permitido.
    const { id: semHistorico } = await (
      await request.post("/api/clientes", { data: { razaoSocial: "Sem Histórico" } })
    ).json();
    expect((await request.delete(`/api/clientes/${semHistorico}`)).status()).toBe(204);

    await request.delete(`/api/competencias/${comp.id}`);
    await request.delete(`/api/competencias/${comp2.id}`);
    await apagarCliente(request, id);
    await request.delete(`/api/tipos/${tipo.id}`);
  });

  test("o painel traz os alertas e eles reagem aos dados", async ({ request, page }) => {
    const { id } = await (
      await request.post("/api/clientes", {
        data: { razaoSocial: "Alertas LTDA", procuracaoVencimento: maisDias(10) },
      })
    ).json();
    const processo = await (
      await request.post("/api/processos", {
        data: { clienteId: id, tipo: "Alvará", prazo: "2020-01-01" },
      })
    ).json();

    const painel = await (await request.get("/api/painel")).json();
    expect(typeof painel.alertas.competenciaDoMesAberta).toBe("boolean");
    expect(painel.alertas.procuracoesVencendo30Dias).toBeGreaterThanOrEqual(1);
    expect(painel.alertas.processosAtrasados).toBeGreaterThanOrEqual(1);
    expect(painel.alertas.clientesSemObrigacoes).toBeGreaterThanOrEqual(1);
    expect(typeof painel.alertas.honorariosVencidos.total).toBe("string");

    await page.goto("/");
    await expect(page.locator('[data-alerta="Procurações vencendo em 30 dias"]')).toBeVisible();
    await expect(page.locator('[data-alerta="Processos com prazo estourado"]')).toContainText(
      /[1-9]/,
    );

    await request.delete(`/api/processos/${processo.id}`);
    await apagarCliente(request, id);
  });

  test("guia anexada é enviada com protocolo; o link público registra a visualização", async ({
    request,
    baseURL,
    page,
  }) => {
    const { id: clienteId } = await (
      await request.post("/api/clientes", {
        data: {
          razaoSocial: "Protocolo LTDA",
          email: "fiscal@protocolo.com.br",
          formaEnvio: "email",
        },
      })
    ).json();
    const tipo = await (
      await request.post("/api/tipos", { data: { nome: "DAS Protocolo" } })
    ).json();
    await request.post("/api/clientes", {
      data: { id: clienteId, razaoSocial: "Protocolo LTDA", obrigacoes: [tipo.id] },
    });
    const comp = await (
      await request.post("/api/competencias", { data: { ano: 2089, mes: 3 } })
    ).json();
    const itens = await (await request.get(`/api/competencias/${comp.id}/checklist`)).json();
    const item = itens.find((i: { clienteId: number }) => i.clienteId === clienteId);
    expect(item.anexos).toBe(0);

    // Sem anexo não envia.
    const semAnexo = await request.post(`/api/checklist/${item.id}/enviar`, {
      data: { canal: "email" },
    });
    expect(semAnexo.status()).toBe(400);
    expect((await semAnexo.json()).codigo).toBe("sem_arquivo");

    const conteudo = Buffer.from("%PDF-1.4 guia DAS");
    const registro = await (
      await request.post("/api/arquivos", {
        data: {
          entidade: "checklist_item",
          entidadeId: item.id,
          nome: "das.pdf",
          mime: "application/pdf",
          tamanho: conteudo.length,
        },
      })
    ).json();
    await request.put(registro.urlConteudo, {
      data: conteudo,
      headers: { "content-type": "application/pdf" },
    });

    const envio = await request.post(`/api/checklist/${item.id}/enviar`, {
      data: { canal: "email", mensagem: "Segue a guia do mês." },
    });
    expect(envio.status(), await envio.text()).toBe(200);
    const r = await envio.json();
    expect(r.item.status).toBe("enviado");
    expect(r.item.anexos).toBe(1);
    expect(r.item.enviadoEm).toBeTruthy();
    expect(r.protocolo.link).toContain("/api/protocolo/");
    expect(r.linkWhatsapp).toBeNull();

    const protocolos = await (await request.get(`/api/checklist/${item.id}/protocolos`)).json();
    expect(protocolos).toHaveLength(1);
    expect(protocolos[0].visualizadoEm).toBeNull();
    expect(protocolos[0].enviadoPor).toBeTruthy();

    // O aviso ficou na fila com o link; o worker envia.
    const avisos = await (await request.get(`/api/avisos?clienteId=${clienteId}`)).json();
    expect(avisos[0].modelo).toBe("guia_disponivel");
    expect(avisos[0].corpo).toContain("Segue a guia do mês.");
    expect(avisos[0].corpo).toContain(r.protocolo.link);
    await request.post("/api/jobs/executar", {
      headers: { authorization: `Bearer ${TOKEN}` },
      data: { limiteMs: 10000 },
    });
    expect((await (await request.get(`/api/avisos?clienteId=${clienteId}`)).json())[0].status).toBe(
      "enviado",
    );

    // O cliente abre o link sem sessão nenhuma e recebe o arquivo.
    const anonimo = await apiRequest.newContext({
      baseURL,
      storageState: { cookies: [], origins: [] },
    });
    const token = r.protocolo.link.split("/api/protocolo/")[1];
    const aberto = await anonimo.get(`/api/protocolo/${token}`);
    expect(aberto.status()).toBe(200);
    expect(aberto.headers()["content-disposition"]).toContain("attachment");
    expect(Buffer.from(await aberto.body()).equals(conteudo)).toBe(true);
    expect((await anonimo.get("/api/protocolo/token-que-nao-existe-1234567890")).status()).toBe(
      404,
    );
    await anonimo.dispose();

    const depois = await (await request.get(`/api/checklist/${item.id}/protocolos`)).json();
    expect(depois[0].visualizadoEm).toBeTruthy();
    const itemDepois = (
      await (await request.get(`/api/competencias/${comp.id}/checklist`)).json()
    ).find((i: { id: number }) => i.id === item.id);
    expect(itemDepois.visualizadoEm).toBeTruthy();

    // A grade mostra anexos e envio; o modal abre com Esc fechando.
    await page.goto(`/competencias/${comp.id}`);
    await page.getByLabel("Anexos e envio").check();
    const celula = page.getByRole("button", {
      name: "Protocolo LTDA — DAS Protocolo: anexos e envio",
    });
    await expect(celula).toContainText("📎1");
    await celula.click();
    const dialogo = page.getByRole("dialog", { name: "Protocolo LTDA — DAS Protocolo" });
    await expect(dialogo).toBeVisible();
    await expect(dialogo.getByText("das.pdf")).toBeVisible();
    await expect(dialogo.getByText(/visualizado em/)).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialogo).toHaveCount(0);

    // Produtividade: o envio conta para quem enviou.
    const prod = await (await request.get("/api/produtividade?meses=1")).json();
    const eu = prod.porUsuario.find((u: { login: string }) => u.login === CONTA_E2E.login);
    expect(eu.enviados).toBeGreaterThanOrEqual(1);
    await page.goto("/produtividade");
    await expect(page.getByRole("heading", { name: "Produtividade", level: 1 })).toBeVisible();
    await expect(page.locator("tbody tr").filter({ hasText: CONTA_E2E.login })).toHaveCount(1);

    await request.delete(`/api/competencias/${comp.id}`);
    await apagarCliente(request, clienteId);
    await request.delete(`/api/tipos/${tipo.id}`);
  });

  test("avisos automáticos: vencimento em 3 dias e honorário vencido", async ({ request }) => {
    const { id: clienteId } = await (
      await request.post("/api/clientes", {
        data: {
          razaoSocial: "Automático LTDA",
          email: "auto@cliente.com.br",
          formaEnvio: "email",
          valorHonorario: "500.00",
          diaVencimentoHonorario: 10,
        },
      })
    ).json();
    const tipo = await (
      await request.post("/api/tipos", { data: { nome: "Guia Automática" } })
    ).json();
    await request.post("/api/clientes", {
      data: { id: clienteId, razaoSocial: "Automático LTDA", obrigacoes: [tipo.id] },
    });
    const comp = await (
      await request.post("/api/competencias", { data: { ano: 2090, mes: 5 } })
    ).json();
    const itens = await (await request.get(`/api/competencias/${comp.id}/checklist`)).json();
    const item = itens.find((i: { clienteId: number }) => i.clienteId === clienteId);
    await request.patch(`/api/checklist/${item.id}/vencimento`, {
      data: { vencimento: maisDias(3) },
    });
    const pagamentos = await (await request.get(`/api/competencias/${comp.id}/pagamentos`)).json();
    const pagamento = pagamentos.find((p: { clienteId: number }) => p.clienteId === clienteId);
    await request.patch(`/api/pagamentos/${pagamento.id}`, { data: { vencimento: maisDias(-30) } });

    const rodada = await request.post("/api/jobs/executar", {
      headers: { authorization: `Bearer ${TOKEN}` },
      data: { limiteMs: 15000, agora: ["vencimentos-d3", "honorarios-vencidos"] },
    });
    expect(rodada.status(), await rodada.text()).toBe(200);

    const avisos = (await (
      await request.get(`/api/avisos?clienteId=${clienteId}`)
    ).json()) as Array<{
      modelo: string;
      status: string;
      corpo: string;
    }>;
    const d3 = avisos.find((a) => a.modelo === "vencimento_proximo");
    const cobranca = avisos.find((a) => a.modelo === "honorario_vencido");
    expect(d3?.status).toBe("enviado");
    expect(d3?.corpo).toContain("Guia Automática");
    expect(cobranca?.status).toBe("enviado");
    expect(cobranca?.corpo).toContain("R$");

    // Rodar de novo não repete o aviso (a referência já foi avisada).
    await request.post("/api/jobs/executar", {
      headers: { authorization: `Bearer ${TOKEN}` },
      data: { limiteMs: 10000, agora: ["vencimentos-d3", "honorarios-vencidos"] },
    });
    const deNovo = (await (
      await request.get(`/api/avisos?clienteId=${clienteId}`)
    ).json()) as Array<{ modelo: string }>;
    expect(deNovo.filter((a) => a.modelo === "vencimento_proximo")).toHaveLength(1);
    expect(deNovo.filter((a) => a.modelo === "honorario_vencido")).toHaveLength(1);

    await request.delete(`/api/competencias/${comp.id}`);
    await apagarCliente(request, clienteId);
    await request.delete(`/api/tipos/${tipo.id}`);
  });

  test("o perfil guarda chave Pix, abertura automática e dias para cobrar", async ({
    request,
    page,
  }) => {
    const antes = await (await request.get("/api/perfil")).json();
    const salvo = await request.put("/api/perfil", {
      data: {
        ...antes,
        chavePix: "11.222.333/0001-44",
        aberturaAutomatica: true,
        diasParaCobrar: 3,
      },
    });
    expect(salvo.status(), await salvo.text()).toBe(200);
    const depois = await (await request.get("/api/perfil")).json();
    expect(depois.chavePix).toBe("11.222.333/0001-44");
    expect(depois.aberturaAutomatica).toBe(true);
    expect(depois.diasParaCobrar).toBe(3);

    await page.goto("/perfil");
    await expect(page.locator('input[name="aberturaAutomatica"]')).toBeChecked();
    await expect(page.locator('input[name="diasParaCobrar"]')).toHaveValue("3");
    await expect(page.locator('input[name="chavePix"]')).toHaveValue("11.222.333/0001-44");

    // Volta ao padrão: a abertura automática abriria o mês corrente na próxima rodada de jobs.
    await request.put("/api/perfil", {
      data: { ...antes, aberturaAutomatica: false, diasParaCobrar: 5, chavePix: null },
    });
  });
});
