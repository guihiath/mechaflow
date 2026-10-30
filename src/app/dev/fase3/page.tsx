import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { EH_PRODUCAO } from "@/lib/brand";
import { Vitrine } from "./vitrine";

export const metadata: Metadata = {
  title: "Vitrine Fase 3",
  robots: { index: false, follow: false },
};

/**
 * Vitrine dos componentes visuais da Fase 3 (F3-F1), so fora da producao.
 * Dados ficticios, nada de Supabase. Em producao: 404.
 */
export default function PaginaVitrineFase3() {
  if (EH_PRODUCAO) notFound();
  return <Vitrine />;
}
