import { test, expect, request as apiRequest } from "@playwright/test";
import { apagarCliente } from "./apoio";

// Portal do cliente (sessão própria por link de e-mail) e cobrança automática
// (provedor de memória + webhook de baixa).
const TOKEN_JOBS = "token-jobs-e2e";
const TOKEN_ASAAS = "token-asaas-e2e";
const EMAIL = "portal@cliente-e2e.com.br";

test.describe.serial("portal do cliente e cobrança", () => {
  test("do link por e-mail ao ciente da guia, solicitação e pedido", async ({
    request,
    baseURL,
    browser,
  }) => {
    const { id: clienteId } = await (
      await request.post("/api/clientes", {
        data: {
          razaoSocial: "Portal LTDA",
          email: EMAIL,
          cnpj: "12.345.678/0001-95",
          formaEnvio: "email",
        },
      })
    ).json();
    const tipo = await (await request.post("/api/tipos", { data: { nome: "DAS Portal" } })).json();
    await request.post("/api/clientes", {
      data: { id: clienteId, razaoSocial: "Portal LTDA", obrigacoes: [tipo.id] },
    });
    const comp = await (
      await request.post("/api/competencias", { data: { ano: 2091, mes: 4 } })
    ).json();
    const item = (await (await request.get(`/api/competencias/${comp.id}/checklist`)).json()).find(
      (i: { clienteId: number }) => i.clienteId === clienteId,
    );

    // Guia emitida com arquivo anexado.
    const conteudo = Buffer.from("%PDF-1.4 guia portal");
    const registro = await (
      await request.post("/api/arquivos", {
        data: {
          entidade: "checklist_item",
          entidadeId: item.id,
          nome: "das-portal.pdf",
          mime: "application/pdf",
          tamanho: conteudo.length,
        },
      })
    ).json();
    await request.put(registro.urlConteudo, {
      data: conteudo,
      headers: { "content-type": "application/pdf" },
    });
    await request.patch(`/api/checklist/${item.id}/status`, { data: { status: "emitido" } });

    // O escritório pede um documento.
    const solicitacao = await (
      await request.post("/api/solicitacoes", {
        data: { clienteId, descricao: "Extrato bancário de março" },
      })
    ).json();
    expect(solicitacao.status).toBe("aberta");

    // Sem sessão de escritório nem de portal, nada responde.
    const anonimo = await apiRequest.newContext({
      baseURL,
      storageState: { cookies: [], origins: [] },
    });
    expect((await anonimo.get("/api/portal/eu")).status()).toBe(401);
    expect((await anonimo.get("/api/portal/guias")).status()).toBe(401);

    // O cliente pede o link: sempre 204, e o aviso com o link vai para a fila.
    expect((await anonimo.post("/api/portal/entrar", { data: { email: EMAIL } })).status()).toBe(
      204,
    );
    expect(
      (await anonimo.post("/api/portal/entrar", { data: { email: "ninguem@nada.com" } })).status(),
    ).toBe(204);
    const avisos = (await (
      await request.get(`/api/avisos?clienteId=${clienteId}`)
    ).json()) as Array<{ modelo: string; corpo: string }>;
    const aviso = avisos.find((a) => a.modelo === "link_portal")!;
    const link = aviso.corpo.match(/https?:\/\/\S+\/api\/portal\/acesso\/[A-Za-z0-9_-]+/)![0];
    const token = link.split("/acesso/")[1];

    // Abrir o link cria a sessão do portal (cookie próprio); o link é de uso único.
    const ctx = await browser.newContext({ baseURL, storageState: { cookies: [], origins: [] } });
    const page = await ctx.newPage();
    await page.goto(`/api/portal/acesso/${token}`);
    await expect(page).toHaveURL(/\/portal$/);
    await expect(page.getByRole("heading", { name: "Guias", level: 1 })).toBeVisible();
    await expect(page.getByText("Portal LTDA")).toBeVisible();
    expect((await anonimo.get(`/api/portal/acesso/${token}`)).status()).toBe(410);

    const portal = ctx.request;
    const eu = await (await portal.get("/api/portal/eu")).json();
    expect(eu.clienteId).toBe(clienteId);
    // A sessão do portal não abre o escritório.
    expect((await portal.get("/api/clientes")).status()).toBe(401);

    // Guias: a emitida aparece com o arquivo; o cliente baixa e dá ciente.
    const guias = await (await portal.get("/api/portal/guias")).json();
    expect(guias).toHaveLength(1);
    expect(guias[0].arquivos[0].nome).toBe("das-portal.pdf");
    const baixado = await portal.get(`/api/portal/arquivos/${guias[0].arquivos[0].id}/conteudo`);
    expect(baixado.status()).toBe(200);
    expect(Buffer.from(await baixado.body()).equals(conteudo)).toBe(true);

    await page.getByRole("button", { name: "Recebi esta guia" }).click();
    await expect(page.getByText("✓ Ciente")).toBeVisible();
    const protocolos = await (await request.get(`/api/checklist/${item.id}/protocolos`)).json();
    expect(protocolos[0].canal).toBe("portal");
    expect(protocolos[0].cienteEm).toBeTruthy();
    const itemDepois = (
      await (await request.get(`/api/competencias/${comp.id}/checklist`)).json()
    ).find((i: { id: number }) => i.id === item.id);
    expect(itemDepois.status).toBe("enviado");

    // Honorários do cliente.
    const honorarios = await (await portal.get("/api/portal/honorarios")).json();
    expect(
      honorarios.some((h: { ano: number; mes: number }) => h.ano === 2091 && h.mes === 4),
    ).toBe(true);

    // Solicitação: o cliente envia um arquivo pelo portal e ela fica respondida.
    await page.getByRole("link", { name: "Solicitações" }).click();
    await expect(page.getByText("Extrato bancário de março")).toBeVisible();
    const criado = await (
      await portal.post(`/api/portal/solicitacoes/${solicitacao.id}/arquivos`, {
        data: { nome: "extrato.pdf", mime: "application/pdf", tamanho: 12 },
      })
    ).json();
    const subido = await portal.put(criado.urlConteudo, {
      data: Buffer.from("%PDF extrato"),
      headers: { "content-type": "application/pdf" },
    });
    expect(subido.status(), await subido.text()).toBe(200);
    const respondida = (
      await (await request.get(`/api/solicitacoes?clienteId=${clienteId}`)).json()
    )[0];
    expect(respondida.status).toBe("respondida");
    expect(respondida.arquivos).toBe(1);
    const arquivosEscritorio = await (
      await request.get(`/api/arquivos?entidade=solicitacao&entidadeId=${solicitacao.id}`)
    ).json();
    expect(arquivosEscritorio[0].origem).toBe("portal");

    // Pedido aberto pelo cliente aparece para o escritório como pedido do portal.
    await page.getByRole("link", { name: "Pedidos" }).click();
    await page.getByLabel("Tipo do pedido").fill("Alteração de endereço");
    await page.getByRole("button", { name: "Abrir pedido" }).click();
    await expect(page.locator("li").filter({ hasText: "Alteração de endereço" })).toBeVisible();
    const pedidos = await (
      await request.get(`/api/processos?categoria=pedido&clienteId=${clienteId}`)
    ).json();
    expect(pedidos[0].origem).toBe("portal");
    expect(pedidos[0].tipo).toBe("Alteração de endereço");

    // Sair encerra a sessão do portal.
    await page.getByRole("button", { name: "Sair" }).click();
    await expect(page.getByRole("heading", { name: "Portal do cliente" })).toBeVisible();
    expect((await portal.get("/api/portal/eu")).status()).toBe(401);

    // Link gerado pelo escritório também abre o portal.
    const linkManual = await (await request.post(`/api/clientes/${clienteId}/link-portal`)).json();
    expect(linkManual.link).toContain("/api/portal/acesso/");

    await ctx.close();
    await anonimo.dispose();
    await request.delete(`/api/processos/${pedidos[0].id}`);
    await request.delete(`/api/competencias/${comp.id}`);
    await apagarCliente(request, clienteId);
    await request.delete(`/api/tipos/${tipo.id}`);
  });

  test("cobrança gera link e Pix; o webhook dá a baixa uma vez só", async ({
    request,
    baseURL,
  }) => {
    const { id: clienteId } = await (
      await request.post("/api/clientes", {
        data: {
          razaoSocial: "Cobrança LTDA",
          cnpj: "98.765.432/0001-10",
          valorHonorario: "450.00",
          diaVencimentoHonorario: 15,
        },
      })
    ).json();
    const comp = await (
      await request.post("/api/competencias", {
        data: { ano: 2092, mes: 6, somenteHonorarios: true },
      })
    ).json();
    const pagamento = (
      await (await request.get(`/api/competencias/${comp.id}/pagamentos`)).json()
    ).find((p: { clienteId: number }) => p.clienteId === clienteId);
    expect(pagamento.linkPagamento).toBeNull();

    const cobrado = await request.post(`/api/pagamentos/${pagamento.id}/cobrar`);
    expect(cobrado.status(), await cobrado.text()).toBe(200);
    const c = await cobrado.json();
    expect(c.cobrancaExternaId).toMatch(/^cob-memoria-/);
    expect(c.linkPagamento).toContain("https://");
    expect(c.qrPix).toContain("BR.GOV.BCB.PIX");
    // Cobrar de novo devolve a mesma cobrança.
    expect(
      (await (await request.post(`/api/pagamentos/${pagamento.id}/cobrar`)).json())
        .cobrancaExternaId,
    ).toBe(c.cobrancaExternaId);

    // Sem valor não cobra.
    const { id: semValor } = await (
      await request.post("/api/clientes", {
        data: { razaoSocial: "Sem Valor LTDA", cnpj: "11.111.111/0001-11" },
      })
    ).json();
    const comp2 = await (
      await request.post("/api/competencias", {
        data: { ano: 2092, mes: 7, somenteHonorarios: true },
      })
    ).json();
    const pg2 = (await (await request.get(`/api/competencias/${comp2.id}/pagamentos`)).json()).find(
      (p: { clienteId: number }) => p.clienteId === semValor,
    );
    const semValorR = await request.post(`/api/pagamentos/${pg2.id}/cobrar`);
    expect(semValorR.status()).toBe(400);
    expect((await semValorR.json()).codigo).toBe("sem_valor");

    // Webhook: token errado não entra; o certo dá a baixa; repetido é ignorado.
    const anonimo = await apiRequest.newContext({
      baseURL,
      storageState: { cookies: [], origins: [] },
    });
    const evento = {
      id: "evt_e2e_1",
      event: "PAYMENT_RECEIVED",
      payment: { id: c.cobrancaExternaId, paymentDate: "2092-06-10" },
    };
    expect(
      (
        await anonimo.post("/api/webhooks/asaas", {
          data: evento,
          headers: { "asaas-access-token": "errado" },
        })
      ).status(),
    ).toBe(401);
    const ok = await anonimo.post("/api/webhooks/asaas", {
      data: evento,
      headers: { "asaas-access-token": TOKEN_ASAAS },
    });
    expect(ok.status(), await ok.text()).toBe(200);
    expect((await ok.json()).ok).toBe(true);
    const repetido = await (
      await anonimo.post("/api/webhooks/asaas", {
        data: evento,
        headers: { "asaas-access-token": TOKEN_ASAAS },
      })
    ).json();
    expect(repetido.duplicado).toBe(true);
    await anonimo.dispose();

    const pago = (await (await request.get(`/api/competencias/${comp.id}/pagamentos`)).json()).find(
      (p: { id: number }) => p.id === pagamento.id,
    );
    expect(pago.status).toBe("pago");
    expect(pago.dataPagamento).toBe("2092-06-10");
    expect(pago.forma).toBe("asaas");

    // A fila continua respondendo com o token de jobs (nada mudou aqui).
    expect(
      (
        await request.post("/api/jobs/executar", {
          headers: { authorization: `Bearer ${TOKEN_JOBS}` },
          data: { limiteMs: 3000 },
        })
      ).status(),
    ).toBe(200);

    await request.delete(`/api/competencias/${comp.id}`);
    await request.delete(`/api/competencias/${comp2.id}`);
    await apagarCliente(request, clienteId);
    await apagarCliente(request, semValor);
  });
});
