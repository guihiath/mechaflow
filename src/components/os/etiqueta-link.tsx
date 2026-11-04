import { CalendarX, ThumbsDown, ThumbsUp } from "lucide-react";
import { Etiqueta } from "@/components/ui/estados";
import type { EtiquetaLinkOS } from "@/lib/os-status";

const ICONE = { size: 18, strokeWidth: 2.25, "aria-hidden": true } as const;

/** Texto para o `aria-label` do cartão da lista (DESIGN §13.13). */
export const ROTULO_ETIQUETA_LINK: Record<EtiquetaLinkOS, string> = {
  aprovou: "cliente aprovou pelo link",
  recusou: "cliente recusou pelo link",
  vencido: "link vencido",
};

/** Etiqueta do link na lista de OS. Só dono e atendente: o mecânico nunca recebe esse dado. */
export function EtiquetaLink({ tipo }: { tipo: EtiquetaLinkOS }) {
  if (tipo === "aprovou") {
    return (
      <Etiqueta tom="sucesso">
        <ThumbsUp {...ICONE} />
        Cliente aprovou
      </Etiqueta>
    );
  }
  if (tipo === "recusou") {
    return (
      <Etiqueta tom="alerta">
        <ThumbsDown {...ICONE} />
        Cliente recusou
      </Etiqueta>
    );
  }
  return (
    <Etiqueta tom="alerta">
      <CalendarX {...ICONE} />
      Link vencido
    </Etiqueta>
  );
}
