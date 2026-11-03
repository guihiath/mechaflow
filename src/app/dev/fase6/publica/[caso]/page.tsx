import type { Metadata, Viewport } from "next";
import { notFound } from "next/navigation";
import { EH_PRODUCAO } from "@/lib/brand";
import { CASOS, type CasoPublico } from "./casos";
import { SimulacaoPublica } from "./simulacao";

export const metadata: Metadata = {
  title: "Orçamento para sua aprovação",
  robots: { index: false, follow: false },
};

/** Só para modo claro. O F6-B2 repete isto na rota real `/orcamento/[token]`. */
export const viewport: Viewport = {
  colorScheme: "only light",
  themeColor: "#F2F0EB",
};

export function generateStaticParams() {
  return Object.keys(CASOS).map((caso) => ({ caso }));
}

/**
 * Página pública simulada em tela inteira, para testar como será `/orcamento/[token]`
 * (a rota real é do F6-B2). Dados fictícios, resposta simulada, nada de Supabase. Em produção: 404.
 */
export default async function PaginaPublicaSimulada({ params }: { params: Promise<{ caso: string }> }) {
  const { caso } = await params;
  if (EH_PRODUCAO || !(caso in CASOS)) notFound();
  return <SimulacaoPublica caso={caso as CasoPublico} />;
}
