"use client";

import type { RefObject } from "react";
import { Plus } from "lucide-react";

/** "Luz de injeção acesa" + "Fumaça" -> "Luz de injeção acesa, fumaça". */
export function acrescentarTexto(atual: string, sugestao: string): string {
  const base = atual.trimEnd();
  if (!base) return sugestao;
  const separador = /[,.;:]$/.test(base) ? " " : ", ";
  return `${base}${separador}${sugestao.charAt(0).toLowerCase()}${sugestao.slice(1)}`;
}

type Alvo = HTMLTextAreaElement | HTMLInputElement;

/**
 * Chips que ACRESCENTAM texto a um campo (DESIGN §10.4 e §10.7): mao suja nao digita bem.
 * Duas formas de ligar:
 *  - `alvo`: ref do <textarea>/<input> (AreaTexto/Campo aceitam `ref`). Funciona com campo
 *    controlado ou nao (dispara o evento `input`, entao o onChange do React roda).
 *  - `aoEscolher`: o pai cuida do valor (use `acrescentarTexto`).
 * Nao foca o campo depois (no celular o teclado subiria e cobriria a tela).
 */
export function SugestoesTexto({
  sugestoes,
  alvo,
  aoEscolher,
  rotulo = "Sugestões",
}: {
  sugestoes: readonly string[];
  alvo?: RefObject<Alvo | null>;
  aoEscolher?: (sugestao: string) => void;
  /** Nome do grupo para leitor de tela. */
  rotulo?: string;
}) {
  function escolher(sugestao: string) {
    if (aoEscolher) {
      aoEscolher(sugestao);
      return;
    }
    const el = alvo?.current;
    if (!el) return;
    const novo = acrescentarTexto(el.value, sugestao);
    // Setter nativo + evento "input": o React enxerga a mudanca em campo controlado.
    const prototipo = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(prototipo, "value")?.set?.call(el, novo);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  }

  return (
    <div role="group" aria-label={rotulo} className="flex flex-wrap gap-2">
      {sugestoes.map((s) => (
        <button
          key={s}
          type="button"
          onClick={() => escolher(s)}
          className="inline-flex min-h-toque items-center gap-1 rounded-md border-2 border-borda bg-superficie px-3 text-base font-bold text-texto transition-colors active:bg-superficie-2"
        >
          <Plus size={18} strokeWidth={2.5} aria-hidden className="shrink-0 text-texto-suave" />
          {s}
        </button>
      ))}
    </div>
  );
}

/** Sugestoes padrao do sintoma na abertura da OS (DESIGN §10.4). */
export const SUGESTOES_SINTOMA = [
  "Luz de injeção acesa",
  "Perdendo força",
  "Fumaça",
  "Barulho",
  "Vazamento",
  "Freio",
  "Elétrica",
  "Revisão",
] as const;

/** Motivos de recusa do orcamento (DESIGN §10.7). */
export const SUGESTOES_RECUSA = ["Achou caro", "Vai fazer em outro lugar", "Vai pensar", "Não quer o serviço"] as const;
