"use client";

import { Check, CircleAlert, Clock, WifiOff } from "lucide-react";

/** Os 5 passos da vistoria (DESIGN §12.0 nº 2 e §12.3). */
export const PASSOS_VISTORIA = [
  { numero: 1, curto: "KM", nome: "KM e combustível" },
  { numero: 2, curto: "Checklist", nome: "Checklist" },
  { numero: 3, curto: "Avarias", nome: "Avarias" },
  { numero: 4, curto: "Painel", nome: "Painel e objetos" },
  { numero: 5, curto: "Assinar", nome: "Conferir e assinar" },
] as const;

export type NumeroPasso = (typeof PASSOS_VISTORIA)[number]["numero"];

/**
 * Estado de cada passo: "feito" (Check verde), "pendente" (ponto alerta + "faltam N" no nome
 * acessivel), "visto" (visitado, sem pendencia contada) ou "nao_visto".
 */
export type EstadoPasso = { estado: "feito" | "pendente" | "visto" | "nao_visto"; faltam?: number };

/**
 * Faixa de 5 botoes de passo (DESIGN §12.3): 48 px, numero ou Check em cima + rotulo curto.
 * Atual: fundo primaria, borda inferior 3 px grafite, `aria-current="step"`. Tocar leva ao passo.
 */
export function PassosVistoria({
  atual,
  estados,
  aoIr,
}: {
  atual: NumeroPasso;
  estados: Partial<Record<NumeroPasso, EstadoPasso>>;
  aoIr: (passo: NumeroPasso) => void;
}) {
  return (
    <nav aria-label="Passos da vistoria">
      <ol className="grid grid-cols-5 gap-1">
        {PASSOS_VISTORIA.map((p) => {
          const e = estados[p.numero] ?? { estado: "nao_visto" };
          const ehAtual = p.numero === atual;
          const feito = e.estado === "feito";
          const pendente = e.estado === "pendente";
          const nome = `${p.nome}${feito ? ", feito" : ""}${
            pendente ? (e.faltam ? `, ${e.faltam === 1 ? "falta 1" : `faltam ${e.faltam}`}` : ", com pendência") : ""
          }`;
          return (
            <li key={p.numero} className="min-w-0">
              <button
                type="button"
                onClick={() => aoIr(p.numero)}
                aria-current={ehAtual ? "step" : undefined}
                aria-label={`Passo ${p.numero}: ${nome}`}
                className={`relative flex h-12 w-full min-w-0 flex-col items-center justify-center rounded-md px-0 leading-none transition-colors ${
                  ehAtual
                    ? "border-b-[3px] border-grafite bg-primaria text-primaria-texto"
                    : e.estado === "nao_visto"
                      ? "border-[1.5px] border-borda bg-superficie text-texto active:bg-superficie-2"
                      : "border-[1.5px] border-borda-sutil bg-superficie text-texto active:bg-superficie-2"
                }`}
              >
                {feito ? (
                  <Check
                    size={18}
                    strokeWidth={3}
                    aria-hidden
                    className={ehAtual ? "text-primaria-texto" : "text-sucesso-texto"}
                  />
                ) : (
                  <span aria-hidden className="font-mono text-base leading-[18px] font-bold">
                    {p.numero}
                  </span>
                )}
                <span aria-hidden className="mt-0.5 text-[clamp(11px,3.3vw,13px)] font-bold tracking-[-0.01em] whitespace-nowrap">
                  {p.curto}
                </span>
                {pendente && (
                  <span aria-hidden className="absolute top-1 right-1 size-2 rounded-full bg-alerta ring-2 ring-superficie" />
                )}
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

export type EstadoSalvo = "salvo" | "salvando" | "sem_internet" | "falhou";

/**
 * Indicador de salvamento (DESIGN §12.3), a direita da linha "Passo 2 de 5". `role="status"`
 * so com texto que muda de verdade: "Salvo" e "Salvando…" ficam fora da regiao viva (nao fala
 * a cada toque); "Guardado no celular" e a falha sao anunciados.
 */
export function IndicadorSalvo({ estado, aoTentarDeNovo }: { estado: EstadoSalvo; aoTentarDeNovo?: () => void }) {
  return (
    <div className="flex shrink-0 items-center">
      {estado === "salvo" && (
        <span className="inline-flex items-center gap-1 text-sm text-texto-suave">
          <Check size={18} strokeWidth={2.5} aria-hidden />
          Salvo
        </span>
      )}
      {estado === "salvando" && (
        <span className="inline-flex items-center gap-1 text-sm text-texto-suave">
          <Clock size={18} strokeWidth={2.5} aria-hidden />
          Salvando…
        </span>
      )}
      <span role="status" className="contents">
        {estado === "sem_internet" && (
          <span className="inline-flex items-center gap-1 text-sm font-bold text-alerta-texto">
            <WifiOff size={18} strokeWidth={2.5} aria-hidden />
            Guardado no celular
          </span>
        )}
        {estado === "falhou" && (
          <button
            type="button"
            onClick={aoTentarDeNovo}
            className="inline-flex min-h-toque items-center gap-1 rounded-md px-1 text-sm font-bold text-erro-texto underline underline-offset-4"
          >
            <CircleAlert size={18} strokeWidth={2.5} aria-hidden />
            Não salvou. Tentar de novo
          </button>
        )}
      </span>
    </div>
  );
}

/** "Passo 2 de 5 · Checklist" + indicador (linha de baixo da faixa de passos). */
export function LinhaPasso({
  atual,
  salvo,
  aoTentarSalvar,
}: {
  atual: NumeroPasso;
  salvo: EstadoSalvo;
  aoTentarSalvar?: () => void;
}) {
  const p = PASSOS_VISTORIA[atual - 1];
  return (
    <div className="flex min-h-toque items-center justify-between gap-2">
      <h2 className="min-w-0 text-sm font-bold font-sans">
        Passo {atual} de 5 · {p.nome}
      </h2>
      <IndicadorSalvo estado={salvo} aoTentarDeNovo={aoTentarSalvar} />
    </div>
  );
}
