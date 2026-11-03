import { CalendarX, CircleAlert, Clock, Link2Off, RefreshCw, SearchX, type LucideIcon } from "lucide-react";
import { BotaoRecarregar } from "@/components/orcamento/botao-recarregar";
import type { SituacaoSemAcesso } from "@/lib/orcamento";

const ESTADOS: Record<SituacaoSemAcesso | "erro_abrir", { icone: LucideIcon; titulo: string; frase: string }> = {
  vencido: {
    icone: CalendarX,
    titulo: "Este link venceu",
    frase: "O orçamento não aparece mais por aqui. Fale com a oficina na mesma conversa em que recebeu o link.",
  },
  substituido: {
    icone: Link2Off,
    titulo: "Este link foi substituído",
    frase: "Use o link mais recente que a oficina mandou ou fale com ela.",
  },
  atualizado: {
    icone: RefreshCw,
    titulo: "Este orçamento foi atualizado",
    frase: "Fale com a oficina para receber o novo link.",
  },
  encerrado: {
    icone: Link2Off,
    titulo: "Este link não está mais ativo",
    frase: "Se ainda tiver dúvida sobre o orçamento, fale com a oficina.",
  },
  nao_encontrado: {
    icone: SearchX,
    titulo: "Não encontramos este orçamento",
    frase: "Confira se o link está completo ou peça um novo à oficina.",
  },
  limite: {
    icone: Clock,
    titulo: "Muitas tentativas agora",
    frase: "Espere alguns minutos e abra o link de novo.",
  },
  erro_abrir: {
    icone: CircleAlert,
    titulo: "Não foi possível abrir o orçamento",
    frase: "Confira a internet e tente de novo.",
  },
};

/**
 * Telas sem acesso (DESIGN §13.5). De propósito só recebe o motivo: sem oficina, placa,
 * cliente, número da OS, valor ou data, não há como vazar dado por aqui.
 */
export function EstadoLinkPublico({ motivo }: { motivo: SituacaoSemAcesso | "erro_abrir" }) {
  const { icone: Icone, titulo, frase } = ESTADOS[motivo];
  return (
    <section className="flex flex-col items-start gap-3" data-estado-publico={motivo}>
      <Icone size={48} strokeWidth={2} aria-hidden className="text-texto-suave" />
      <h1 data-titulo-orcamento tabIndex={-1} className="text-2xl">
        {titulo}
      </h1>
      <p className="text-base text-texto-suave">{frase}</p>
      {motivo === "erro_abrir" && <BotaoRecarregar />}
    </section>
  );
}

/** Carregando (DESIGN §13.5): skeleton neutro, sem nenhum dado. */
export function CarregandoOrcamento() {
  return (
    <div aria-busy="true" className="flex flex-col gap-5">
      <p role="status" className="text-base text-texto-suave">
        Abrindo orçamento…
      </p>
      <div className="flex animate-pulse flex-col gap-5" aria-hidden>
        <div className="h-8 w-3/4 rounded-sm bg-superficie-2" />
        <div className="h-16 w-1/2 rounded-sm bg-superficie-2" />
        <div className="flex flex-col gap-3">
          <div className="h-12 rounded-sm bg-superficie-2" />
          <div className="h-12 rounded-sm bg-superficie-2" />
          <div className="h-12 rounded-sm bg-superficie-2" />
        </div>
      </div>
    </div>
  );
}
