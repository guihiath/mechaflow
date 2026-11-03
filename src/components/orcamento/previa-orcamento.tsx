"use client";

import { useEffect, useId, useRef, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { DocumentoOrcamento } from "@/components/orcamento/documento-orcamento";
import { BotoesResposta } from "@/components/orcamento/resposta-orcamento";
import { CaixaMensagem } from "@/components/ui/formulario";
import type { DadosDocumentoOrcamento } from "@/lib/orcamento";

const CHAVE_HISTORICO = "mfPreviaOrcamento";
const semAssinatura = () => () => {};

/**
 * "Ver como o cliente vê" antes de enviar (DESIGN §13.9): camada de tela cheia sobre a tela de
 * envio, sempre clara, em qualquer tema do balcão. Mesmo padrão da `FotoTelaCheia`: `<dialog>` no
 * `<body>`, segue o `visualViewport`, voltar do Android e Esc fecham. O digitado fica no pai.
 */
export function PreviaOrcamento({
  aberta,
  aoFechar,
  documento,
  expiraEm,
}: {
  aberta: boolean;
  aoFechar: () => void;
  documento: DadosDocumentoOrcamento;
  expiraEm: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const botaoFechar = useRef<HTMLButtonElement>(null);
  const chave = useId();
  const idTitulo = useId();
  const aoFecharRef = useRef(aoFechar);
  const voltarPendente = useRef<ReturnType<typeof setTimeout> | null>(null);
  const noNavegador = useSyncExternalStore(
    semAssinatura,
    () => true,
    () => false,
  );

  useEffect(() => {
    aoFecharRef.current = aoFechar;
  }, [aoFechar]);

  useEffect(() => {
    const dialogo = ref.current;
    if (!aberta || !dialogo) return;

    const origem = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (!dialogo.open) dialogo.showModal();
    botaoFechar.current?.focus();
    const overflowAntes = document.documentElement.style.overflow;
    document.documentElement.style.overflow = "hidden";

    const vv = window.visualViewport;
    const ajustar = () => {
      if (!vv || vv.scale > 1.01) return;
      dialogo.style.top = `${vv.offsetTop}px`;
      dialogo.style.height = `${vv.height}px`;
    };
    ajustar();
    vv?.addEventListener("resize", ajustar);
    vv?.addEventListener("scroll", ajustar);

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
      vv?.removeEventListener("resize", ajustar);
      vv?.removeEventListener("scroll", ajustar);
      if (dialogo.open) dialogo.close();
      document.documentElement.style.overflow = overflowAntes;
      if (origem?.isConnected) origem.focus({ preventScroll: true });
      voltarPendente.current = setTimeout(() => {
        voltarPendente.current = null;
        if (window.history.state?.[CHAVE_HISTORICO] === chave) window.history.back();
      }, 0);
    };
  }, [aberta, chave, noNavegador]);

  if (!noNavegador) return null;

  return createPortal(
    <dialog
      ref={ref}
      aria-labelledby={idTitulo}
      data-teste="previa"
      onCancel={(e) => {
        e.preventDefault();
        aoFechar();
      }}
      className="papel-claro fixed inset-x-0 top-0 m-0 h-full max-h-none w-full max-w-none flex-col overflow-hidden border-0 bg-fundo p-0 text-texto backdrop:bg-[#14161A] open:flex"
    >
      {aberta && (
        <>
          <div className="bg-grafite shrink-0 pt-[env(safe-area-inset-top)] text-[#EDEBE6]">
            <div className="flex h-14 items-center justify-between gap-2 pr-1 pl-4">
              <p id={idTitulo} className="min-w-0 text-base font-bold">
                Prévia: nada foi enviado
              </p>
              <button
                ref={botaoFechar}
                type="button"
                onClick={aoFechar}
                className="inline-flex min-h-toque shrink-0 items-center gap-1.5 rounded-md px-3 text-base font-bold active:bg-white/10"
              >
                <X size={22} strokeWidth={2.25} aria-hidden />
                Fechar
              </button>
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
            <div className="flex w-full max-w-[560px] flex-col gap-6 px-4 pt-4 pb-[calc(2rem+env(safe-area-inset-bottom))]">
              <CaixaMensagem tipo="alerta">As descrições aparecem como estão escritas. Confira se não há anotação interna.</CaixaMensagem>
              <DocumentoOrcamento documento={documento} expiraEm={expiraEm} variante="previa" resposta={<BotoesResposta desativado />} />
            </div>
          </div>
        </>
      )}
    </dialog>,
    document.body,
  );
}
