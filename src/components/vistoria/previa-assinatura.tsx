"use client";

import type { Ref } from "react";
import { PenLine, RotateCcw } from "lucide-react";
import { Botao } from "@/components/ui/botao";

/**
 * Previa da assinatura no passo ⑤ (DESIGN §12.8 item 4). Caixa 100 % x 160 px, BRANCA nos dois
 * temas, borda tracejada. Sem assinatura: o botao "Toque para assinar" (abre o CampoAssinatura).
 * Assinado: a imagem + "Assinado por Carlos" + "Assinar de novo".
 * O `ref` vai para o botao que abre, para o foco voltar a ele ao fechar a tela cheia.
 */
export function PreviaAssinatura({
  src,
  nome,
  aoAssinar,
  desabilitado,
  ref,
}: {
  /** URL (blob: ou assinada) da assinatura; vazio = ainda nao assinou. */
  src?: string | null;
  nome?: string;
  aoAssinar: () => void;
  desabilitado?: boolean;
  ref?: Ref<HTMLButtonElement>;
}) {
  const nomeLimpo = nome?.trim();
  if (!src) {
    return (
      <button
        ref={ref}
        type="button"
        onClick={aoAssinar}
        disabled={desabilitado}
        className="flex h-40 w-full flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-borda bg-white text-[#14161A] transition-colors active:bg-[#F2F0EB] disabled:cursor-not-allowed disabled:opacity-50"
      >
        <PenLine size={28} strokeWidth={2.25} aria-hidden />
        <span className="text-lg font-bold">Toque para assinar</span>
      </button>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      <div className="flex h-40 w-full items-center justify-center overflow-hidden rounded-lg border border-borda-sutil bg-white p-2">
        {/* blob: local ou URL assinada do Storage: sem otimizador do Next. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={nomeLimpo ? `Assinatura de ${nomeLimpo}` : "Assinatura"}
          className="max-h-full max-w-full object-contain"
          draggable={false}
        />
      </div>
      {nomeLimpo && <p className="text-xs text-texto-suave">Assinado por {nomeLimpo}</p>}
      <Botao ref={ref} variante="secundario" onClick={aoAssinar} disabled={desabilitado} className="h-toque!">
        <RotateCcw size={20} strokeWidth={2.25} aria-hidden />
        Assinar de novo
      </Botao>
    </div>
  );
}
