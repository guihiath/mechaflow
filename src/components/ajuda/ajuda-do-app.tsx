"use client";

import { useState } from "react";
import { GrupoAjuda } from "@/components/ajuda/grupo-ajuda";
import { FolhaFeedback } from "@/components/feedback/botao-feedback";

/**
 * Grupo "Ajuda" ligado (F8-B2, DESIGN 15.5): o link do suporte vem pronto do servidor e o
 * "Enviar feedback" abre a mesma folha do cabeçalho, sem navegar.
 */
export function AjudaDoApp({ whatsapp }: { whatsapp: string | null }) {
  const [feedback, setFeedback] = useState(false);
  return (
    <>
      <GrupoAjuda whatsapp={whatsapp} aoEnviarFeedback={() => setFeedback(true)} />
      {feedback && <FolhaFeedback aoFechar={() => setFeedback(false)} />}
    </>
  );
}
