import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { EH_PRODUCAO } from "@/lib/brand";
import { Vitrine } from "./vitrine";

export const metadata: Metadata = {
  title: "Vitrine Fase 8",
  robots: { index: false, follow: false },
};

/**
 * Vitrine dos componentes visuais da Fase 8A (F8-F1), só fora da produção.
 * Dados fictícios, nada de Supabase. Em produção: 404.
 */
export default function PaginaVitrineFase8() {
  if (EH_PRODUCAO) notFound();
  return <Vitrine />;
}
