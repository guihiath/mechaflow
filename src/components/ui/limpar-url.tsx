"use client";

import { useEffect } from "react";

/**
 * Tira da URL os avisos de uso unico (?salvo=1, ?aviso=...) sem recarregar a tela:
 * a mensagem continua visivel agora, mas nao volta depois de editar ou recarregar.
 */
export function LimparUrl({ manter }: { manter?: string } = {}) {
  useEffect(() => {
    // `manter`: parte da busca que continua (ex.: "?ver=<id>" da vistoria anulada).
    window.history.replaceState(window.history.state, "", window.location.pathname + (manter ?? ""));
  }, [manter]);
  return null;
}
