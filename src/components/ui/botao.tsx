import Link from "next/link";
import type { ComponentProps } from "react";

/**
 * Botoes base do MechaFlow (DESIGN.md, secao 5.1).
 * Texto do botao: verbo + objeto ("Enviar orcamento"), nunca "OK" sozinho.
 * No celular, botoes empilhados: primario embaixo, secundario em cima.
 */
export type VarianteBotao = "primario" | "secundario" | "perigo";

const base =
  "inline-flex h-toque-principal w-full items-center justify-center gap-2 rounded-md px-4 text-lg font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-50";

const variantes: Record<VarianteBotao, string> = {
  primario:
    "border-b-[3px] border-grafite bg-primaria text-primaria-texto active:translate-y-px active:bg-primaria-forte",
  secundario: "border-2 border-borda bg-superficie text-texto active:bg-superficie-2",
  perigo: "bg-erro text-white active:opacity-90",
};

export function classesBotao(variante: VarianteBotao = "primario", extra?: string) {
  return [base, variantes[variante], extra].filter(Boolean).join(" ");
}

type BotaoProps = ComponentProps<"button"> & { variante?: VarianteBotao };

export function Botao({ variante = "primario", className, type = "button", ...props }: BotaoProps) {
  return <button type={type} className={classesBotao(variante, className)} {...props} />;
}

type BotaoLinkProps = ComponentProps<typeof Link> & { variante?: VarianteBotao };

export function BotaoLink({ variante = "primario", className, ...props }: BotaoLinkProps) {
  return <Link className={classesBotao(variante, className)} {...props} />;
}
