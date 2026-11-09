"use client";

import Link from "next/link";
import { useId } from "react";
import { ChevronRight, ExternalLink, MessageCircle, MessageSquareWarning } from "lucide-react";

const LINK_DOC = "inline-flex min-h-toque items-center text-base font-bold text-info-texto underline underline-offset-4";
const CARTAO =
  "flex w-full items-center gap-3 rounded-lg border border-borda-sutil bg-superficie p-4 text-left text-texto transition-colors active:bg-superficie-2";

/**
 * Grupo "Ajuda" do /mais (dono e atendente) e do /conta (os 3 papéis), DESIGN §15.5.
 * Termos e privacidade abrem em outra aba (a página legal não tem "voltar").
 * Só apresentação: quem decide o link do suporte e abre a folha do feedback é o F8-B2.
 *
 * `whatsapp`: link de `linkWhatsAppSuporte(mensagemSuporteApp(nome, oficina))`, ou null (o cartão some).
 * `aoEnviarFeedback`: abre a FolhaFeedback do F5-F1, sem navegar. Sem ela, o cartão do feedback não aparece.
 */
export function GrupoAjuda({ whatsapp, aoEnviarFeedback }: { whatsapp: string | null; aoEnviarFeedback?: () => void }) {
  const idTitulo = useId();
  return (
    <section aria-labelledby={idTitulo} className="mt-2 flex flex-col gap-3">
      <h2 id={idTitulo} className="text-2xl">
        Ajuda
      </h2>
      <ul className="flex flex-col gap-3">
        {whatsapp && (
          <li>
            <a
              href={whatsapp}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Falar com o suporte pelo WhatsApp (abre o WhatsApp)"
              className={CARTAO}
            >
              <MessageCircle size={26} strokeWidth={2.25} aria-hidden className="shrink-0" />
              <span className="min-w-0 flex-1">
                <span className="block text-lg font-bold">Falar com o suporte</span>
                <span className="block text-base text-texto-suave">
                  WhatsApp do MechaFlow, para dúvidas e problemas no app
                </span>
              </span>
              <ExternalLink size={20} aria-hidden className="shrink-0 text-texto-suave" />
            </a>
          </li>
        )}
        {aoEnviarFeedback && (
          <li>
            <button type="button" aria-haspopup="dialog" onClick={aoEnviarFeedback} className={CARTAO}>
              <MessageSquareWarning size={26} strokeWidth={2.25} aria-hidden className="shrink-0" />
              <span className="min-w-0 flex-1">
                <span className="block text-lg font-bold">Enviar feedback</span>
                <span className="block text-base text-texto-suave">
                  Conte o que travou ou o que falta, com a OS ou a placa
                </span>
              </span>
              <ChevronRight size={24} aria-hidden className="shrink-0 text-texto-suave" />
            </button>
          </li>
        )}
      </ul>
      <nav aria-label="Documentos" className="flex flex-wrap gap-x-6 gap-y-2">
        <Link href="/termos" target="_blank" className={LINK_DOC}>
          Termos de uso
        </Link>
        <Link href="/privacidade" target="_blank" className={LINK_DOC}>
          Política de privacidade
        </Link>
      </nav>
    </section>
  );
}
