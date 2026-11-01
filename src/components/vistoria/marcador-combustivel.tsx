"use client";

import { useId, useRef, type KeyboardEvent } from "react";
import { Check, CircleAlert } from "lucide-react";
import {
  FRACAO_COMBUSTIVEL,
  NIVEIS_COMBUSTIVEL,
  ROTULO_COMBUSTIVEL,
  ROTULO_COMBUSTIVEL_LONGO,
  type NivelCombustivel,
} from "@/lib/formato";

/**
 * Medidor horizontal 36 x 14 px (DESIGN §12.4): borda 2 px, enchimento proporcional
 * (reserva = 1/8 em alerta). `marcado` = dentro do botao marcado (amarelo): tudo grafite.
 */
export function MedidorCombustivel({
  nivel,
  marcado = false,
  className,
}: {
  nivel: NivelCombustivel;
  marcado?: boolean;
  className?: string;
}) {
  const reserva = nivel === "reserva";
  const borda = marcado ? "border-[#14161A]" : "border-texto";
  const cheio = marcado ? "bg-[#14161A]" : reserva ? "bg-alerta-texto" : "bg-texto";
  return (
    <span aria-hidden className={`inline-flex h-3.5 w-9 shrink-0 rounded-[3px] border-2 p-px ${borda} ${className ?? ""}`}>
      <span className={`h-full rounded-[1px] ${cheio}`} style={{ width: `${FRACAO_COMBUSTIVEL[nivel] * 100}%` }} />
    </span>
  );
}

/**
 * Marcador de combustivel (DESIGN §12.4): `radiogroup` com 5 `radio` de 64 px, setas mudam
 * (foco movel: so o marcado, ou o primeiro, entra no Tab). Sem padrao marcado de proposito.
 * Marcado: fundo primaria, borda grafite, Check no canto. Igual nos dois temas.
 */
export function MarcadorCombustivel({
  valor,
  aoMudar,
  erro,
  rotulo = "Combustível",
}: {
  valor: NivelCombustivel | null;
  aoMudar: (nivel: NivelCombustivel) => void;
  erro?: string;
  rotulo?: string;
}) {
  const id = useId();
  const botoes = useRef<(HTMLButtonElement | null)[]>([]);
  const indiceAtual = valor ? NIVEIS_COMBUSTIVEL.indexOf(valor) : -1;

  function teclado(e: KeyboardEvent<HTMLDivElement>) {
    const passo = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
    let novo = -1;
    if (passo) novo = ((indiceAtual < 0 ? (passo > 0 ? -1 : 0) : indiceAtual) + passo + 5) % 5;
    else if (e.key === "Home") novo = 0;
    else if (e.key === "End") novo = 4;
    if (novo < 0) return;
    e.preventDefault();
    aoMudar(NIVEIS_COMBUSTIVEL[novo]);
    botoes.current[novo]?.focus();
  }

  return (
    <div className="flex flex-col gap-1.5">
      <p id={`${id}-r`} className="text-sm font-bold text-texto">
        {rotulo}
      </p>
      <div
        role="radiogroup"
        aria-labelledby={`${id}-r`}
        aria-describedby={erro ? `${id}-e` : undefined}
        aria-invalid={erro ? true : undefined}
        onKeyDown={teclado}
        className="grid grid-cols-5 gap-1"
      >
        {NIVEIS_COMBUSTIVEL.map((n, i) => {
          const marcado = n === valor;
          const focavel = marcado || (indiceAtual < 0 && i === 0);
          return (
            <button
              key={n}
              ref={(el) => {
                botoes.current[i] = el;
              }}
              type="button"
              role="radio"
              aria-checked={marcado}
              aria-label={`${rotulo}: ${ROTULO_COMBUSTIVEL_LONGO[n]}`}
              tabIndex={focavel ? 0 : -1}
              onClick={() => aoMudar(n)}
              className={`relative flex h-16 min-w-0 flex-col items-center justify-center gap-1.5 rounded-md border-2 px-1 pt-3 transition-colors ${
                marcado
                  ? "border-grafite bg-primaria text-primaria-texto"
                  : erro
                    ? "border-erro bg-superficie text-texto active:bg-superficie-2"
                    : "border-borda bg-superficie text-texto active:bg-superficie-2"
              }`}
            >
              {marcado && (
                <Check size={16} strokeWidth={3} aria-hidden className="absolute top-0.5 right-0.5 text-[#14161A]" />
              )}
              <MedidorCombustivel nivel={n} marcado={marcado} />
              <span className="text-xs leading-none font-bold whitespace-nowrap [hyphens:none]">{ROTULO_COMBUSTIVEL[n]}</span>
            </button>
          );
        })}
      </div>
      {erro && (
        <p id={`${id}-e`} className="flex items-start gap-1.5 text-sm font-bold text-erro-texto">
          <CircleAlert size={18} strokeWidth={2.25} aria-hidden className="mt-0.5 shrink-0" />
          {erro}
        </p>
      )}
    </div>
  );
}

/** Leitura (vistoria concluida e resumo): medidor + "1/4". */
export function CombustivelLeitura({ nivel }: { nivel: NivelCombustivel | null }) {
  if (!nivel) return <span className="text-texto-suave">Não informado</span>;
  return (
    <span className="inline-flex items-center gap-2" aria-label={`Combustível: ${ROTULO_COMBUSTIVEL_LONGO[nivel]}`}>
      <MedidorCombustivel nivel={nivel} />
      <span aria-hidden>{ROTULO_COMBUSTIVEL[nivel]}</span>
    </span>
  );
}
