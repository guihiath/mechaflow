"use client";

import { useSyncExternalStore } from "react";
import { Check } from "lucide-react";
import { TEMA_STORAGE_KEY, type Tema } from "@/lib/tema";

type Escolha = Tema | "sistema";

const OPCOES: { valor: Escolha; rotulo: string }[] = [
  { valor: "claro", rotulo: "Claro" },
  { valor: "escuro", rotulo: "Escuro" },
  { valor: "sistema", rotulo: "Igual ao celular" },
];

const EVENTO = "mf-tema-mudou";

function lerEscolha(): Escolha {
  try {
    const t = localStorage.getItem(TEMA_STORAGE_KEY);
    return t === "claro" || t === "escuro" ? t : "sistema";
  } catch {
    return "sistema";
  }
}

function assinar(aviso: () => void) {
  window.addEventListener(EVENTO, aviso);
  window.addEventListener("storage", aviso);
  return () => {
    window.removeEventListener(EVENTO, aviso);
    window.removeEventListener("storage", aviso);
  };
}

function aplicar(escolha: Escolha) {
  try {
    if (escolha === "sistema") localStorage.removeItem(TEMA_STORAGE_KEY);
    else localStorage.setItem(TEMA_STORAGE_KEY, escolha);
  } catch {
    /* sem localStorage: aplica so nesta tela */
  }
  const escuro =
    escolha === "escuro" || (escolha === "sistema" && window.matchMedia?.("(prefers-color-scheme: dark)").matches);
  document.documentElement.dataset.tema = escuro ? "escuro" : "claro";
  window.dispatchEvent(new Event(EVENTO));
}

/** Tema escolhido a mao (DESIGN 2.2). Grava em localStorage "mf-tema"; o script do <head> le antes da pintura. */
export function EscolherTema() {
  const atual = useSyncExternalStore(assinar, lerEscolha, () => "sistema" as Escolha);

  return (
    <fieldset className="flex flex-col gap-1.5">
      <legend className="mb-1.5 text-sm font-bold">Aparência</legend>
      <div className="grid grid-cols-3 gap-2">
        {OPCOES.map((o) => {
          const ativo = o.valor === atual;
          return (
            <button
              key={o.valor}
              type="button"
              aria-pressed={ativo}
              onClick={() => aplicar(o.valor)}
              className={`flex min-h-toque items-center justify-center gap-1.5 rounded-md border-2 px-2 text-center text-base font-bold ${
                ativo ? "border-grafite bg-primaria text-primaria-texto" : "border-borda bg-superficie text-texto"
              }`}
            >
              {ativo && <Check size={20} strokeWidth={2.5} aria-hidden className="shrink-0" />}
              {o.rotulo}
            </button>
          );
        })}
      </div>
      <p className="text-sm text-texto-suave">No sol, o claro é o mais fácil de ler.</p>
    </fieldset>
  );
}
