import { Router, type IRouter } from "express";
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

const router: IRouter = Router();

router.use(healthRouter);
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

export default router;
