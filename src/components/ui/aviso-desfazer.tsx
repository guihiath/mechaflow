"use client";

import { useEffect, useRef, useState, useTransition } from "react";

/**
 * Aviso "Status: Pronta. Desfazer" (DESIGN §5.5 e §10.5): faixa grafite fixa logo acima
 * da barra de acoes / navegacao (64px + safe area), some em 6 s.
 * O tempo PAUSA enquanto o aviso tem foco ou o dedo/mouse em cima (WCAG 2.2.1).
 * Para reiniciar o tempo com outro aviso, troque a `key` no pai.
 */
export function AvisoDesfazer({
  mensagem,
  aoDesfazer,
  aoSumir,
  duracaoMs = 6000,
  rotuloDesfazer = "Desfazer",
}: {
  mensagem: string;
  /** Pode ser assincrono (Server Action); o botao mostra "Desfazendo…" enquanto roda. */
  aoDesfazer: () => void | Promise<void>;
  /** Chamado quando o tempo acaba (o pai tira o aviso da tela). */
  aoSumir: () => void;
  duracaoMs?: number;
  rotuloDesfazer?: string;
}) {
  const [focado, setFocado] = useState(false);
  const [emCima, setEmCima] = useState(false);
  const [desfazendo, iniciar] = useTransition();
  const restante = useRef(duracaoMs);
  const aoSumirRef = useRef(aoSumir);
  const pausado = focado || emCima || desfazendo;

  useEffect(() => {
    aoSumirRef.current = aoSumir;
  }, [aoSumir]);

  useEffect(() => {
    if (pausado) return;
    const inicio = Date.now();
    const t = setTimeout(() => aoSumirRef.current(), restante.current);
    return () => {
      clearTimeout(t);
      restante.current = Math.max(1000, restante.current - (Date.now() - inicio));
    };
  }, [pausado]);

  return (
    <div
      role="status"
      aria-live="polite"
      onFocus={() => setFocado(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFocado(false);
      }}
      onPointerEnter={() => setEmCima(true)}
      onPointerLeave={() => setEmCima(false)}
      onTouchStart={() => setEmCima(true)}
      onTouchEnd={() => setEmCima(false)}
      className="fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-50 flex min-h-14 items-center gap-3 bg-grafite py-1 pr-2 pl-4 text-base text-[#EDEBE6] lg:inset-x-auto lg:bottom-6 lg:left-[calc(15rem+2rem)] lg:min-w-96 lg:rounded-md"
    >
      <p className="min-w-0 flex-1">{mensagem}</p>
      <button
        type="button"
        disabled={desfazendo}
        onClick={() =>
          iniciar(async () => {
            await aoDesfazer();
          })
        }
        className="inline-flex min-h-toque shrink-0 items-center rounded-md px-3 text-base font-bold text-primaria underline underline-offset-4 disabled:opacity-60"
      >
        {desfazendo ? "Desfazendo…" : rotuloDesfazer}
      </button>
    </div>
  );
}
