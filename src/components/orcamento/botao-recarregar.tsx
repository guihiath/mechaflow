"use client";

import { RotateCw } from "lucide-react";
import { Botao } from "@/components/ui/botao";

/** "Tentar de novo" do erro ao abrir: recarrega a página, que relê o que está gravado. */
export function BotaoRecarregar() {
  return (
    <Botao variante="secundario" className="mt-2" onClick={() => window.location.reload()}>
      <RotateCw size={20} strokeWidth={2.25} aria-hidden />
      Tentar de novo
    </Botao>
  );
}
