import type { Metadata } from "next";
import { PaginaInicial } from "@/components/publico/pagina-inicial";
import { EH_PRODUCAO } from "@/lib/brand";
import { linkWhatsAppSuporte, MENSAGEM_SUPORTE_PUBLICO } from "@/lib/suporte";

export const metadata: Metadata = {
  title: { absolute: "MechaFlow · Ordens de serviço para oficina diesel" },
  description:
    "Ordem de serviço, vistoria com fotos, orçamento por link no WhatsApp e contas a receber para oficina diesel. Pelo celular, mesmo com internet fraca.",
  // Fase 8A: cadastro aberto sem divulgar (DESIGN §15.2.4). Na 8B, a página de vendas passa a index.
  robots: { index: false, follow: false },
};

/**
 * Página inicial pública (DESIGN §15.2). Quem tem sessão nunca chega aqui:
 * src/lib/supabase/proxy.ts desvia "/" para "/entrar" com Cache-Control private, no-store (F5-E-3).
 */
export default function Home() {
  return <PaginaInicial whatsapp={linkWhatsAppSuporte(MENSAGEM_SUPORTE_PUBLICO)} teste={!EH_PRODUCAO} />;
}
