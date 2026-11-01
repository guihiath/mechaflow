"use client";

import { useEffect } from "react";
import { apagarRascunho } from "@/lib/vistoria/rascunho";

/**
 * Vistoria já concluída: o rascunho deste usuário no aparelho não serve mais (DESIGN §12.14:
 * apagado quando o banco confirma a conclusão; aqui cobre a conclusão feita em outro aparelho).
 */
export function LimparRascunhoVistoria({ usuarioId, vistoriaId }: { usuarioId: string; vistoriaId: string }) {
  useEffect(() => {
    apagarRascunho(usuarioId, vistoriaId);
  }, [usuarioId, vistoriaId]);
  return null;
}
