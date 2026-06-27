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

export default router;
