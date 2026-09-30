import { Router, type IRouter } from "express";
import { exigirSessao } from "../middlewares/autenticacao";
import authRouter from "./auth";
import healthRouter from "./health";
import clientesRouter from "./clientes";
import tiposRouter from "./tipos";
import competenciasRouter from "./competencias";
import checklistRouter from "./checklist";
import pagamentosRouter from "./pagamentos";
import pendenciasRouter from "./pendencias";
import configuracoesRouter from "./configuracoes";
import painelRouter from "./painel";
import processosRouter from "./processos";
import etapasRouter from "./etapas";
import credenciaisRouter from "./credenciais";
import debitosRouter from "./debitos";
import perfilRouter from "./perfil";
import despesasRouter from "./despesas";
import funcionariosRouter from "./funcionarios";
import folhaRouter from "./folha";
import feriasRouter from "./ferias";
import usuariosRouter from "./usuarios";
import arquivosRouter from "./arquivos";
import avisosRouter from "./avisos";
import jobsRouter, { executarJobs, exigirTokenJobs } from "./jobs";
import protocoloRouter from "./protocolo";
import produtividadeRouter from "./produtividade";

const router: IRouter = Router();

// Antes da porta: só o health check (o deploy o consulta sem cookie) e o
// próprio login.
router.use(healthRouter);
router.use("/auth", authRouter);
// O agendador externo dispara a fila com o token de serviço, sem sessão.
router.post("/jobs/executar", exigirTokenJobs, executarJobs);
// Link público da guia enviada: quem tem o token é o cliente.
router.use("/protocolo", protocoloRouter);

// A porta. Tudo o que vem depois só roda com sessão válida e enxerga apenas a
// conta dela — rota nova nasce protegida por estar abaixo desta linha.
router.use(exigirSessao);

router.use("/painel", painelRouter);
router.use("/clientes", clientesRouter);
router.use("/tipos", tiposRouter);
router.use("/competencias", competenciasRouter);
router.use("/checklist", checklistRouter);
router.use("/pagamentos", pagamentosRouter);
router.use("/pendencias", pendenciasRouter);
router.use("/configuracoes", configuracoesRouter);
router.use("/processos", processosRouter);
router.use("/etapas", etapasRouter);
router.use("/credenciais", credenciaisRouter);
router.use("/debitos", debitosRouter);
router.use("/perfil", perfilRouter);
router.use("/despesas", despesasRouter);
router.use("/funcionarios", funcionariosRouter);
router.use("/folha", folhaRouter);
router.use("/ferias", feriasRouter);
router.use("/usuarios", usuariosRouter);
router.use("/arquivos", arquivosRouter);
router.use("/avisos", avisosRouter);
router.use("/jobs", jobsRouter);
router.use("/produtividade", produtividadeRouter);

export default router;
