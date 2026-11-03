"use client";

import { ArrowDown } from "lucide-react";
import { classesFantasma } from "@/components/ui/botao";

export const ID_SUA_RESPOSTA = "sua-resposta";

/**
 * "Ir para a resposta" (DESIGN §13.2). Com JavaScript rola sem mexer no histórico, para o
 * voltar do Android continuar saindo do passo de confirmação. Sem JavaScript, é a âncora.
 */
export function AtalhoResposta({ quantidadeItens }: { quantidadeItens: number }) {
  return (
    <a
      href={`#${ID_SUA_RESPOSTA}`}
      className={classesFantasma}
      onClick={(e) => {
        const alvo = document.getElementById(ID_SUA_RESPOSTA);
        if (!alvo) return;
        e.preventDefault();
        alvo.scrollIntoView({ block: "start" });
        alvo.focus({ preventScroll: true });
      }}
    >
      <ArrowDown size={20} strokeWidth={2.25} aria-hidden className="shrink-0" />
      Ir para a resposta ({quantidadeItens} itens no orçamento)
    </a>
  );
}
