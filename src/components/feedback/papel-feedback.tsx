"use client";

import { useEffect } from "react";
import { definirPapelFeedback, type PapelFeedback as Papel } from "@/lib/feedback";

/** Conta ao "Enviar feedback" o papel de quem está logado. Não desenha nada; fora do pacote em produção. */
export const PapelFeedback = process.env.NEXT_PUBLIC_AMBIENTE === "producao" ? () => null : RegistrarPapel;

function RegistrarPapel({ papel }: { papel: Papel }) {
  useEffect(() => {
    definirPapelFeedback(papel);
    return () => definirPapelFeedback(null);
  }, [papel]);
  return null;
}
