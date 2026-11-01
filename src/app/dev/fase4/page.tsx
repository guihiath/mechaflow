import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { EH_PRODUCAO } from "@/lib/brand";
import { Vitrine } from "./vitrine";

export const metadata: Metadata = {
  title: "Vitrine Fase 4",
  robots: { index: false, follow: false },
};

/**
 * Vitrine dos componentes visuais da Fase 4 (F4-F1 e F4-F2), so fora da producao.
 * Dados ficticios, nada de Supabase. Em producao: 404.
 */
export default function PaginaVitrineFase4() {
  if (EH_PRODUCAO) notFound();
  return <Vitrine />;
}
