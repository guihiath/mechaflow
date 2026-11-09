import type { ReactNode } from "react";
import { MessageCircle } from "lucide-react";
import { classesFantasma } from "@/components/ui/botao";

/**
 * Link fantasma para o WhatsApp do suporte (DESIGN §15.2.2 e §15.6).
 * `href` vem de `linkWhatsAppSuporte()`; com null (sem a variável), não desenha nada.
 */
export function LinkWhatsApp({
  href,
  children,
  rotulo,
}: {
  href: string | null;
  children: ReactNode;
  /** aria-label completo, terminando em "(abre o WhatsApp)". */
  rotulo: string;
}) {
  if (!href) return null;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={rotulo}
      className={`${classesFantasma} self-start py-1`}
    >
      <MessageCircle size={24} strokeWidth={2.25} aria-hidden className="shrink-0" />
      {children}
    </a>
  );
}
