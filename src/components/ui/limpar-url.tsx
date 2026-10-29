"use client";

import { useEffect } from "react";

/**
 * Tira da URL os avisos de uso unico (?salvo=1, ?aviso=...) sem recarregar a tela:
 * a mensagem continua visivel agora, mas nao volta depois de editar ou recarregar.
 */
export function LimparUrl() {
  useEffect(() => {
    window.history.replaceState(window.history.state, "", window.location.pathname);
  }, []);
  return null;
}
