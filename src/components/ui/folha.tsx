"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { X } from "lucide-react";

const CHAVE_HISTORICO = "mfFolha";

/**
 * Folha (bottom sheet) da Fase 2 (DESIGN §10.6), sobre `<dialog>` nativo com showModal():
 * prende o foco, Esc fecha, fundo inerte, sem biblioteca.
 * - Celular: presa embaixo, raio so em cima, ate 90dvh. Desktop: centralizada, 560px.
 * - Topo fixo com titulo + botao "Fechar" (sem puxador de arrastar).
 * - Meio rola; `rodape` fica fixo embaixo (primario por ultimo, perto do polegar).
 * - Voltar do Android fecha a folha (empurra um estado no historico ao abrir).
 * - Ao fechar, o foco volta para quem abriu.
 *
 * Controlada: o pai guarda `aberta` e fecha em `aoFechar`. O conteudo so existe com a
 * folha aberta (cada abertura comeca limpa).
 */
export function Folha({
  aberta,
  aoFechar,
  titulo,
  children,
  rodape,
  topo,
}: {
  aberta: boolean;
  aoFechar: () => void;
  titulo: string;
  children: ReactNode;
  /** Botoes do rodape fixo (secundario acima, primario embaixo). */
  rodape?: ReactNode;
  /** Algo antes do titulo no topo (ex.: botao "← Escolher outro"). */
  topo?: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const idTitulo = useId();
  const chave = useId();
  const aoFecharRef = useRef(aoFechar);
  const voltarPendente = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    aoFecharRef.current = aoFechar;
  }, [aoFechar]);

  useEffect(() => {
    const dialogo = ref.current;
    if (!aberta || !dialogo) return;

    const origem = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (!dialogo.open) dialogo.showModal();
    const overflowAntes = document.documentElement.style.overflow;
    document.documentElement.style.overflow = "hidden";

    // Reabriu antes do "voltar" agendado (ex.: StrictMode em dev): reaproveita o estado.
    if (voltarPendente.current) {
      clearTimeout(voltarPendente.current);
      voltarPendente.current = null;
    }
    if (window.history.state?.[CHAVE_HISTORICO] !== chave) {
      window.history.pushState({ ...window.history.state, [CHAVE_HISTORICO]: chave }, "");
    }

    const aoVoltar = () => {
      if (window.history.state?.[CHAVE_HISTORICO] !== chave) aoFecharRef.current();
    };
    window.addEventListener("popstate", aoVoltar);

    return () => {
      window.removeEventListener("popstate", aoVoltar);
      if (dialogo.open) dialogo.close();
      document.documentElement.style.overflow = overflowAntes;
      origem?.focus({ preventScroll: true });
      // Fechou pelo botao/Esc: tira o estado que empurramos. Se a pagina navegou
      // (link dentro da folha), o topo do historico ja e outro e nada acontece.
      voltarPendente.current = setTimeout(() => {
        voltarPendente.current = null;
        if (window.history.state?.[CHAVE_HISTORICO] === chave) window.history.back();
      }, 0);
    };
  }, [aberta, chave]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={idTitulo}
      onCancel={(e) => {
        e.preventDefault();
        aoFechar();
      }}
      onClick={(e) => {
        // Toque no fundo escuro (fora do conteudo) fecha.
        if (e.target === e.currentTarget) aoFechar();
      }}
      className="m-0 mt-auto max-h-[90dvh] w-full max-w-none flex-col overflow-hidden rounded-t-xl bg-superficie p-0 text-texto shadow-folha backdrop:bg-[#14161A]/50 open:flex lg:m-auto lg:max-w-[560px] lg:rounded-xl"
    >
      {aberta && (
        <>
          <div className="flex min-h-14 shrink-0 items-center gap-2 border-b-2 border-borda-sutil py-1 pr-2 pl-4">
            {topo}
            <h2 id={idTitulo} className="min-w-0 flex-1 truncate text-xl">
              {titulo}
            </h2>
            <button
              type="button"
              onClick={aoFechar}
              className="inline-flex min-h-toque shrink-0 items-center gap-1.5 rounded-md px-3 text-base font-bold text-texto active:bg-superficie-2"
            >
              <X size={22} strokeWidth={2.25} aria-hidden />
              Fechar
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4">{children}</div>
          {rodape && (
            <div className="flex shrink-0 flex-col gap-3 border-t-2 border-borda-sutil px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
              {rodape}
            </div>
          )}
        </>
      )}
    </dialog>
  );
}
