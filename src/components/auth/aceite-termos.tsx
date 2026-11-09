"use client";

import Link from "next/link";
import { CaixaMarcar } from "@/components/ui/campo";

const LINK = "font-bold text-info-texto underline";

/**
 * Checkbox de aceite dos termos (LGPD, DESIGN §15.3). Os dois links abrem em outra aba para não perder o formulário.
 * A frase do uso anonimizado continua até o advogado decidir (F8-C2 / F8-G5): o aceite grava
 * autoriza_uso_anonimizado = true.
 */
export function AceiteTermos({ erro }: { erro?: string }) {
  return (
    <CaixaMarcar name="termos" value="sim" erro={erro}>
      Li e aceito os{" "}
      <Link href="/termos" target="_blank" className={LINK}>
        Termos de uso
      </Link>{" "}
      e a{" "}
      <Link href="/privacidade" target="_blank" className={LINK}>
        Política de privacidade
      </Link>
      , incluindo o uso anonimizado dos dados para melhorar o sistema.
    </CaixaMarcar>
  );
}

export const ERRO_TERMOS = "Para continuar, marque que aceita os termos.";
