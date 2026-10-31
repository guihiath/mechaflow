"use client";

import { useLayoutEffect, useRef, type ReactNode } from "react";

/**
 * Faixa com rolagem horizontal dos chips (F3-B8, I6): ao abrir com um filtro ligado
 * (ex.: `/os?status=sem_preco` vindo do /inicio), o chip ativo vem para dentro da faixa.
 * So mexe na rolagem da propria faixa (nao rola a pagina), sem animacao, e so quando o
 * chip ativo nao esta inteiro na tela.
 */
export function FaixaChips({ ativo, className, children }: { ativo: string; className?: string; children: ReactNode }) {
  const ref = useRef<HTMLUListElement>(null);
  useLayoutEffect(() => {
    const ul = ref.current;
    const chip = ul?.querySelector<HTMLElement>('[aria-current="true"]');
    if (!ul || !chip || ul.scrollWidth <= ul.clientWidth) return;
    const f = ul.getBoundingClientRect();
    const c = chip.getBoundingClientRect();
    if (c.left >= f.left && c.right <= f.right) return;
    ul.scrollLeft += c.left - f.left - (f.width - c.width) / 2;
  }, [ativo]);
  return (
    <ul ref={ref} className={className}>
      {children}
    </ul>
  );
}
