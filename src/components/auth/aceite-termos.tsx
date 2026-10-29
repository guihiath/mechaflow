"use client";

import Link from "next/link";
import { CaixaMarcar } from "@/components/ui/campo";

/** Checkbox de aceite dos termos (LGPD). Link abre /termos em outra aba para nao perder o formulario. */
export function AceiteTermos({ erro }: { erro?: string }) {
  return (
    <CaixaMarcar name="termos" value="sim" erro={erro}>
      Li e aceito os{" "}
      <Link href="/termos" target="_blank" className="font-bold text-info-texto underline">
        Termos de Uso e a Política de Privacidade
      </Link>
      , incluindo o uso anonimizado dos dados para melhorar o sistema.
    </CaixaMarcar>
  );
}

export const ERRO_TERMOS = "Para continuar, marque que aceita os termos.";
