import { Link } from "wouter";

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-20">
      <h1 className="text-4xl font-bold">404</h1>
      <p className="text-neutral-500">Página não encontrada.</p>
      <Link href="/" className="text-blue-600 hover:underline">
        Voltar ao painel
      </Link>
    </div>
  );
}
