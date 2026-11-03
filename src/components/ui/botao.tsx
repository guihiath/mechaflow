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

/** Ação fantasma (DESIGN §13): texto sublinhado, 48 px de área de toque, sem caixa. */
export const classesFantasma =
  "inline-flex min-h-toque items-center gap-2 rounded-md px-1 text-left text-base font-bold text-texto underline underline-offset-4";

/**
 * Botão de foto feito com `<label htmlFor>` + `<input type="file" className="sr-only">`:
 * o input invisível recebe o foco, então o anel (mesmo do `:focus-visible` do globals.css)
 * aparece no rótulo. Input dentro do label: `has-[:focus-visible]`. Input fora (em outro
 * lugar da tela): marcar o label com `data-foco` enquanto o input estiver com foco visível.
 */
const focoArquivo =
  "cursor-pointer has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-foco data-foco:outline-3 data-foco:outline-offset-2 data-foco:outline-foco";

export function classesBotaoArquivo(variante: VarianteBotao = "secundario", extra?: string) {
  return classesBotao(variante, extra ? `${focoArquivo} ${extra}` : focoArquivo);
}

type BotaoProps =ComponentProps<"button"> & { variante?: VarianteBotao };

export function Botao({ variante = "primario", className, type = "button", ...props }: BotaoProps) {
  return <button type={type} className={classesBotao(variante, className)} {...props} />;
}

type BotaoLinkProps = ComponentProps<typeof Link> & { variante?: VarianteBotao };

export function BotaoLink({ variante = "primario", className, ...props }: BotaoLinkProps) {
  return <Link className={classesBotao(variante, className)} {...props} />;
}
