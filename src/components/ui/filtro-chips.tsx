import Link from "next/link";
import { Check } from "lucide-react";

export type OpcaoFiltro = {
  valor: string;
  rotulo: string;
  /** Destino do chip (GET, ex.: `/os?status=prontas&q=abc`). */
  href: string;
  /** Contagem opcional: "Prontas (3)". */
  contagem?: number;
};

/**
 * Filtro por chips (DESIGN §10.3): links GET, entao o voltar do navegador funciona.
 * Celular: uma linha com rolagem horizontal, o ultimo chip cortado pela borda da tela
 * (mostra que ha mais). Desktop: quebra linha.
 * Ativo: fundo amarelo + icone Check (nao so cor) + aria-current.
 */
export function FiltroChips({
  opcoes,
  ativo,
  rotulo = "Filtrar por status",
}: {
  opcoes: OpcaoFiltro[];
  ativo: string;
  rotulo?: string;
}) {
  return (
    <nav aria-label={rotulo} className="-mx-4 lg:mx-0">
      <ul className="flex snap-x gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] lg:flex-wrap lg:overflow-visible lg:px-0">
        {opcoes.map((o) => {
          const eAtivo = o.valor === ativo;
          return (
            <li key={o.valor} className="shrink-0 snap-start scroll-ml-4">
              <Link
                href={o.href}
                scroll={false}
                aria-current={eAtivo ? "true" : undefined}
                className={`inline-flex h-toque items-center gap-1.5 rounded-md border-2 px-3.5 text-base font-bold whitespace-nowrap transition-colors ${
                  eAtivo
                    ? "border-grafite bg-primaria text-primaria-texto"
                    : "border-borda bg-superficie text-texto active:bg-superficie-2"
                }`}
              >
                {eAtivo && <Check size={18} strokeWidth={2.5} aria-hidden className="shrink-0" />}
                {o.rotulo}
                {typeof o.contagem === "number" && <span className="font-medium">({o.contagem})</span>}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
