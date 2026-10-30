import Link from "next/link";
import { ChevronRight, TriangleAlert } from "lucide-react";

/**
 * Cartao de pendencia do /inicio do dono (DESIGN §11.10): "3 OS com itens sem preço".
 * Fica abaixo de "Abrir OS" e acima dos atalhos. Sem pendencia, nao renderiza.
 * O numero vem do banco (contagem so para dono/atendente).
 */
export function CartaoOSSemPreco({
  quantidade,
  href = "/os?status=sem_preco",
}: {
  quantidade: number;
  href?: string;
}) {
  if (quantidade <= 0) return null;
  const titulo = quantidade === 1 ? "1 OS com itens sem preço" : `${quantidade} OS com itens sem preço`;
  return (
    <Link
      href={href}
      className="relative flex min-h-toque overflow-hidden rounded-lg border border-borda-sutil bg-superficie transition-colors active:bg-superficie-2"
    >
      <span aria-hidden className="w-1.5 shrink-0 bg-alerta" />
      <span className="flex min-w-0 flex-1 items-center gap-3 p-4">
        <TriangleAlert size={28} strokeWidth={2.25} aria-hidden className="shrink-0 text-alerta-texto" />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="text-lg leading-snug font-bold">{titulo}</span>
          <span className="text-base text-texto-suave">Defina os preços. Sem eles a OS não pode ser entregue.</span>
        </span>
        <ChevronRight size={24} strokeWidth={2.25} aria-hidden className="shrink-0 text-texto-suave" />
      </span>
    </Link>
  );
}
