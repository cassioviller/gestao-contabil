import Processos from "./Processos";

/**
 * Pedidos corriqueiros do cliente (atualização de guia, atualização de salário…).
 * Mesma máquina dos processos — muda a categoria gravada e o vocabulário da tela.
 */
export default function Pedidos() {
  return <Processos categoria="pedido" />;
}
