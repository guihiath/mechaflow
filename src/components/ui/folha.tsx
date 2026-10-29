"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Info, X } from "lucide-react";
import { Botao } from "@/components/ui/botao";

const CHAVE_HISTORICO = "mfFolha";

/**
 * Folha (bottom sheet) da Fase 2 (DESIGN §10.6), sobre `<dialog>` nativo com showModal():
 * prende o foco, Esc fecha, fundo inerte, sem biblioteca.
 * - Celular: presa embaixo, raio so em cima, ate 90dvh. Desktop: centralizada, 560px.
 * - Topo fixo com titulo + botao "Fechar" (sem puxador de arrastar).
 * - Meio rola; `rodape` fica fixo embaixo (primario por ultimo, perto do polegar).
 * - Voltar do Android fecha a folha (empurra um estado no historico ao abrir).
 * - Tocar no fundo escuro NAO fecha: e o gesto de baixar o teclado (DESIGN §5.9).
 * - Com `sujo` (algo digitado), Fechar / Esc / voltar pedem confirmacao dentro da folha.
 *   O rascunho fica guardado pelo pai (PainelOS); "Apagar o que escrevi" chama `aoDescartar`.
 * - Ao fechar, o foco volta para quem abriu (ou para a barra de acoes, se ele sumiu).
 *
 * Controlada: o pai guarda `aberta` e fecha em `aoFechar`. O conteudo so existe com a
 * folha aberta; o que foi digitado volta pelo rascunho do pai.
 */
export function Folha({
  aberta,
  aoFechar,
  titulo,
  children,
  rodape,
  topo,
  sujo = false,
  aoDescartar,
  recuperado = false,
}: {
  aberta: boolean;
  aoFechar: () => void;
  titulo: string;
  children: ReactNode;
  /** Botoes do rodape fixo (secundario acima, primario embaixo). */
  rodape?: ReactNode;
  /** Algo antes do titulo no topo (ex.: botao "← Escolher outro"). */
  topo?: ReactNode;
  /** Ha algo digitado: fechar pede confirmacao. */
  sujo?: boolean;
  /** Apaga o rascunho guardado (antes de fechar). */
  aoDescartar?: () => void;
  /** O conteudo veio de um rascunho guardado: mostra o aviso no topo. */
  recuperado?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const caixaConfirmar = useRef<HTMLDivElement>(null);
  const idTitulo = useId();
  const idConfirmar = useId();
  const chave = useId();
  const aoFecharRef = useRef(aoFechar);
  const sujoRef = useRef(sujo);
  const confirmandoRef = useRef(false);
  const voltarPendente = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fechandoPorNos = useRef(false);
  const [confirmando, setConfirmando] = useState(false);

  useEffect(() => {
    aoFecharRef.current = aoFechar;
    sujoRef.current = sujo;
    confirmandoRef.current = confirmando;
  }, [aoFechar, sujo, confirmando]);

  useEffect(() => {
    if (confirmando) caixaConfirmar.current?.focus();
  }, [confirmando]);

  useEffect(() => {
    const dialogo = ref.current;
    if (!aberta || !dialogo) return;

    const origem = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    fechandoPorNos.current = false;
    if (!dialogo.open) dialogo.showModal();
    const overflowAntes = document.documentElement.style.overflow;
    document.documentElement.style.overflow = "hidden";

    // Reabriu antes do "voltar" agendado (ex.: StrictMode em dev): reaproveita o estado.
    if (voltarPendente.current) {
      clearTimeout(voltarPendente.current);
      voltarPendente.current = null;
    }
    const empurrar = () => window.history.pushState({ ...window.history.state, [CHAVE_HISTORICO]: chave }, "");
    if (window.history.state?.[CHAVE_HISTORICO] !== chave) empurrar();

    const aoVoltar = () => {
      if (window.history.state?.[CHAVE_HISTORICO] === chave) return;
      if (sujoRef.current && !confirmandoRef.current) {
        // Voltar com algo digitado: a folha fica e pergunta (o 2º voltar fecha).
        empurrar();
        confirmandoRef.current = true;
        setConfirmando(true);
        return;
      }
      aoFecharRef.current();
    };
    window.addEventListener("popstate", aoVoltar);

    return () => {
      window.removeEventListener("popstate", aoVoltar);
      fechandoPorNos.current = true;
      if (dialogo.open) dialogo.close();
      document.documentElement.style.overflow = overflowAntes;
      if (origem?.isConnected) origem.focus({ preventScroll: true });
      else {
        // A acao mudou o status e o botao que abriu sumiu: foco no primario da barra.
        const alvo =
          document.querySelector<HTMLElement>('[aria-label="Ações da OS"] button, [aria-label="Ações da OS"] a') ??
          document.querySelector<HTMLElement>("h1");
        if (alvo && alvo.tagName === "H1" && !alvo.hasAttribute("tabindex")) alvo.setAttribute("tabindex", "-1");
        alvo?.focus({ preventScroll: true });
      }
      // Fechou pelo botao/Esc: tira o estado que empurramos. Se a pagina navegou
      // (link dentro da folha), o topo do historico ja e outro e nada acontece.
      voltarPendente.current = setTimeout(() => {
        voltarPendente.current = null;
        if (window.history.state?.[CHAVE_HISTORICO] === chave) window.history.back();
      }, 0);
    };
  }, [aberta, chave]);

  function pedirFechar() {
    if (sujo && !confirmando) setConfirmando(true);
    else aoFechar();
  }

  return (
    <dialog
      ref={ref}
      aria-labelledby={idTitulo}
      onCancel={(e) => {
        e.preventDefault();
        pedirFechar();
      }}
      onClose={() => {
        // O navegador fechou sozinho (ex.: 2º Esc/voltar seguido): o rascunho ja esta guardado.
        if (!fechandoPorNos.current) aoFechar();
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
              onClick={pedirFechar}
              className="inline-flex min-h-toque shrink-0 items-center gap-1.5 rounded-md px-3 text-base font-bold text-texto active:bg-superficie-2"
            >
              <X size={22} strokeWidth={2.25} aria-hidden />
              Fechar
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4">
            {recuperado && (
              <p className="mb-4 flex items-start gap-2 rounded-md border-l-4 border-info bg-superficie-2 p-3 text-base text-info-texto">
                <Info size={20} strokeWidth={2.25} aria-hidden className="mt-0.5 shrink-0" />
                Recuperamos o que você tinha escrito.
              </p>
            )}
            {children}
          </div>
          {confirmando ? (
            <div
              ref={caixaConfirmar}
              tabIndex={-1}
              role="group"
              aria-labelledby={idConfirmar}
              className="flex shrink-0 flex-col gap-3 border-t-4 border-alerta bg-superficie px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] outline-none"
            >
              <div>
                <p id={idConfirmar} className="text-lg font-bold">
                  Fechar sem enviar?
                </p>
                <p className="text-base text-texto-suave">O que você escreveu fica guardado e volta quando abrir de novo.</p>
              </div>
              {aoDescartar && (
                <button
                  type="button"
                  onClick={() => {
                    aoDescartar();
                    aoFechar();
                  }}
                  className="inline-flex min-h-toque items-center justify-center text-base font-bold text-erro-texto underline underline-offset-4"
                >
                  Apagar o que escrevi e fechar
                </button>
              )}
              <Botao variante="secundario" onClick={aoFechar}>
                Fechar e guardar
              </Botao>
              <Botao onClick={() => setConfirmando(false)}>Continuar escrevendo</Botao>
            </div>
          ) : (
            rodape && (
              <div className="flex shrink-0 flex-col gap-3 border-t-2 border-borda-sutil px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
                {rodape}
              </div>
            )
          )}
        </>
      )}
    </dialog>
  );
}
