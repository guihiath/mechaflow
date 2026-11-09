import type { Metadata } from "next";
import { DocumentoLegal } from "@/components/legal/documento-legal";
import { secoesTermos } from "@/components/legal/textos";
import { EH_PRODUCAO } from "@/lib/brand";
import { linkWhatsAppSuporte } from "@/lib/suporte";
import { TERMOS_VERSAO } from "@/lib/termos";

export const metadata: Metadata = {
  title: "Termos de uso",
  // Fase 8A: sem indexar (DESIGN §15.2.4).
  robots: { index: false, follow: false },
};

/**
 * Termos de uso (DESIGN §15.3). TEXTO PROVISÓRIO (RASCUNHO) em src/components/legal/textos.tsx.
 * Mudou o texto? Trocar TERMOS_VERSAO (src/lib/termos.ts) + migração nova em
 * private.versao_termos_vigente(), para todos aceitarem de novo (F8-B4).
 */
export default function TermosPage() {
  return (
    <DocumentoLegal
      titulo="Termos de uso"
      versao={TERMOS_VERSAO}
      rascunho
      secoes={secoesTermos({ teste: !EH_PRODUCAO })}
      perguntaFim="Dúvidas sobre os termos?"
      whatsapp={linkWhatsAppSuporte("Olá! Tenho uma dúvida sobre os termos de uso do MechaFlow: ")}
      outra={{ href: "/privacidade", rotulo: "Política de privacidade" }}
      teste={!EH_PRODUCAO}
    />
  );
}
