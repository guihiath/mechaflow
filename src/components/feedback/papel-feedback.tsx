"use client";

import { useEffect } from "react";
import { definirPapelFeedback, type PapelFeedback as Papel } from "@/lib/feedback";

/** Conta ao "Enviar feedback" o papel de quem está logado. Não desenha nada. Também em produção (F8-B2). */
export function PapelFeedback({ papel }: { papel: Papel }) {
  useEffect(() => {
    definirPapelFeedback(papel);
    return () => definirPapelFeedback(null);
  }, [papel]);
  return null;
}
