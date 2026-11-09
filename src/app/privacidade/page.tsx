import type { Metadata } from "next";
import { DocumentoLegal } from "@/components/legal/documento-legal";
import { CONTATO_ENCARREGADO_RASCUNHO, SECOES_PRIVACIDADE } from "@/components/legal/textos";
import { EH_PRODUCAO } from "@/lib/brand";
import { linkWhatsAppSuporte } from "@/lib/suporte";
import { TERMOS_VERSAO } from "@/lib/termos";

export const metadata: Metadata = {
  title: "Política de privacidade",
  // Fase 8A: sem indexar (DESIGN §15.2.4).
  robots: { index: false, follow: false },
};

/**
 * Política de privacidade (DESIGN §15.3), pública (ROTAS_PUBLICAS do proxy).
 * TEXTO PROVISÓRIO (RASCUNHO) em src/components/legal/textos.tsx, estrutura do mapa LGPD
 * (ARQUITETURA §16) com marcadores "[texto do advogado]" até o F8-B4.
 */
export default function PrivacidadePage() {
  return (
    <DocumentoLegal
      titulo="Política de privacidade"
      versao={TERMOS_VERSAO}
      rascunho
      secoes={SECOES_PRIVACIDADE}
      perguntaFim="Dúvidas sobre seus dados?"
      contatoEncarregado={CONTATO_ENCARREGADO_RASCUNHO}
      whatsapp={linkWhatsAppSuporte("Olá! Tenho uma dúvida sobre os meus dados no MechaFlow: ")}
      outra={{ href: "/termos", rotulo: "Termos de uso" }}
      teste={!EH_PRODUCAO}
    />
  );
}
