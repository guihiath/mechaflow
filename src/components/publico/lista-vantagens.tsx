import type { LucideIcon } from "lucide-react";

export type Vantagem = { icone: LucideIcon; titulo: string; texto: string };

/**
 * Lista "O que dá para fazer" (DESIGN §15.2.1 e §15.2.2): `ul` simples, sem borda nem link
 * (não há o que tocar). Ícone de 26 px alinhado ao topo do título; o texto quebra embaixo
 * do título, não do ícone.
 */
export function ListaVantagens({ itens }: { itens: Vantagem[] }) {
  return (
    <ul className="flex flex-col gap-5">
      {itens.map(({ icone: Icone, titulo, texto }) => (
        <li key={titulo} className="grid grid-cols-[auto_1fr] items-start gap-x-3">
          <Icone size={26} strokeWidth={2.25} aria-hidden className="mt-0.5 text-texto" />
          <div className="min-w-0">
            <p className="text-lg font-bold">{titulo}</p>
            <p className="text-base text-texto-suave">{texto}</p>
          </div>
        </li>
      ))}
    </ul>
  );
}
