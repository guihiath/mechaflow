import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PaginaInicial } from "@/components/publico/pagina-inicial";
import { EH_PRODUCAO } from "@/lib/brand";
import { linkWhatsAppSuporte, MENSAGEM_SUPORTE_PUBLICO } from "@/lib/suporte";
import { CASOS_INICIAL, NUMERO_FICTICIO, type CasoInicial } from "../../casos";

export const metadata: Metadata = {
  title: "Vitrine Fase 8 · página inicial",
  robots: { index: false, follow: false },
};

export function generateStaticParams() {
  return Object.keys(CASOS_INICIAL).map((caso) => ({ caso }));
}

/** Página inicial em tela inteira, com e sem a variável do WhatsApp e com e sem a faixa TESTE. Em produção: 404. */
export default async function VitrineInicial({ params }: { params: Promise<{ caso: string }> }) {
  const { caso } = await params;
  if (EH_PRODUCAO || !(caso in CASOS_INICIAL)) notFound();
  const c = caso as CasoInicial;
  const whatsapp = c === "sem-whatsapp" ? null : linkWhatsAppSuporte(MENSAGEM_SUPORTE_PUBLICO, NUMERO_FICTICIO);
  return <PaginaInicial whatsapp={whatsapp} teste={c !== "producao"} />;
}
