"use client";

import { useId, useState } from "react";
import { MessageSquareText } from "lucide-react";
import { BadgeStatus } from "@/components/os/badge-status";
import { formatarDiaHora } from "@/lib/formato";
import type { StatusOS } from "@/lib/os-status";

/**
 * Evento do historico da OS. Mudanca de status mostra o badge; os demais
 * (troca de mecanico, recusa de orcamento, autorizacao...) mostram texto.
 */
export type EventoOS =
  | { id: string; tipo: "status"; status: StatusOS; em: string; por?: string | null; observacao?: string | null }
  | { id: string; tipo: "texto"; texto: string; em: string; por?: string | null };

/**
 * Historico da OS (DESIGN §10.5): lista vertical, mais recente primeiro (o pai ordena).
 * Mostra `visiveis` e um botao "Ver histórico completo (N)" que expande no lugar.
 */
export function LinhaTempo({
  eventos,
  visiveis = 3,
  titulo = "Histórico",
}: {
  eventos: EventoOS[];
  visiveis?: number;
  titulo?: string;
}) {
  const [completo, setCompleto] = useState(false);
  const idLista = useId();
  const mostrados = completo ? eventos : eventos.slice(0, visiveis);
  const sobra = eventos.length > visiveis;

  return (
    <section aria-label={titulo} className="flex flex-col gap-3">
      <h2 className="text-2xl">{titulo}</h2>
      {eventos.length === 0 ? (
        <p className="text-base text-texto-suave">Nada registrado ainda.</p>
      ) : (
        <ol id={idLista} className="flex flex-col border-l-2 border-borda-sutil">
          {mostrados.map((e) => (
            <li key={e.id} className="relative flex flex-col gap-1 py-2 pl-4">
              <span aria-hidden className="absolute top-4 -left-[5px] size-2 rounded-full bg-borda" />
              {e.tipo === "status" ? (
                <span className="flex flex-wrap items-center gap-2">
                  <BadgeStatus status={e.status} />
                </span>
              ) : (
                <span className="flex items-start gap-2 text-base font-bold">
                  <MessageSquareText size={20} strokeWidth={2.25} aria-hidden className="mt-0.5 shrink-0 text-texto-suave" />
                  {e.texto}
                </span>
              )}
              {e.tipo === "status" && e.observacao && <span className="text-base">{e.observacao}</span>}
              <span className="text-xs text-texto-suave">
                <time dateTime={e.em}>{formatarDiaHora(e.em)}</time>
                {e.por && ` · ${e.por}`}
              </span>
            </li>
          ))}
        </ol>
      )}
      {sobra && (
        <button
          type="button"
          aria-expanded={completo}
          aria-controls={idLista}
          onClick={() => setCompleto((v) => !v)}
          className="inline-flex min-h-toque items-center self-start text-base font-bold text-info-texto underline underline-offset-4"
        >
          {completo ? "Mostrar menos" : `Ver histórico completo (${eventos.length})`}
        </button>
      )}
    </section>
  );
}
