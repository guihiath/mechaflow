"use client";

import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { Check, CheckCheck, CircleDashed, Minus, Plus, TriangleAlert, type LucideIcon } from "lucide-react";
import { Campo } from "@/components/ui/campo";
import { Botao } from "@/components/ui/botao";
import { SugestoesTexto, acrescentarTexto } from "@/components/ui/sugestoes-texto";
import {
  ROTULO_SITUACAO_ITEM,
  ROTULO_SITUACAO_ITEM_LEITURA,
  SITUACOES_ITEM_VISTORIA,
  type SituacaoItemVistoria,
} from "@/lib/formato";

/** Chips do "Problema" (DESIGN §12.5). */
export const SUGESTOES_PROBLEMA_ITEM = ["Faltando", "Quebrado", "Com defeito", "Vencido"] as const;
/** Observacao do item: ate 120 caracteres na tela (o banco aceita 500). */
export const LIMITE_OBSERVACAO_ITEM = 120;

const ICONE_SITUACAO: Record<SituacaoItemVistoria, LucideIcon> = {
  ok: Check,
  com_problema: TriangleAlert,
  nao_se_aplica: Minus,
};

/** Cor do botao marcado: igual nos dois temas, texto branco (DESIGN §12.5). */
const COR_MARCADO: Record<SituacaoItemVistoria, string> = {
  ok: "border-sucesso bg-sucesso text-white",
  com_problema: "border-alerta bg-alerta text-white",
  nao_se_aplica: "border-[#4A4F57] bg-[#4A4F57] text-white",
};

/**
 * Linha do checklist (DESIGN §12.5): nome do item (18 px, quebra linha) + 3 botoes de 56 px
 * (`radiogroup`, setas mudam). Tocar no marcado NAO desmarca; trocar = tocar em outro.
 * "Problema" abre a observacao logo abaixo (chips + campo); "Ok" e "Não se aplica" escondem a
 * observacao atras do "+ Observação". Controlada: o pai guarda situacao e observacao e salva.
 */
export function LinhaChecklist({
  descricao,
  situacao,
  observacao,
  aoMudarSituacao,
  aoMudarObservacao,
  ajudaProblema = "Risco ou amassado? Registre em Avarias, com foto.",
}: {
  descricao: string;
  situacao: SituacaoItemVistoria | null;
  observacao: string;
  aoMudarSituacao: (s: SituacaoItemVistoria) => void;
  aoMudarObservacao: (texto: string) => void;
  /** Ex.: item "Painel" -> "Fotografe o painel no passo 4." com link. */
  ajudaProblema?: ReactNode;
}) {
  const id = useId();
  const botoes = useRef<(HTMLButtonElement | null)[]>([]);
  const [observacaoAberta, setObservacaoAberta] = useState(false);
  const indiceAtual = situacao ? SITUACOES_ITEM_VISTORIA.indexOf(situacao) : -1;
  const problema = situacao === "com_problema";
  const mostrarObservacao = problema || observacaoAberta || observacao.trim() !== "";

  function teclado(e: KeyboardEvent<HTMLDivElement>) {
    const passo = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
    if (!passo) return;
    e.preventDefault();
    const novo = ((indiceAtual < 0 ? (passo > 0 ? -1 : 0) : indiceAtual) + passo + 3) % 3;
    aoMudarSituacao(SITUACOES_ITEM_VISTORIA[novo]);
    botoes.current[novo]?.focus();
  }

  return (
    <div
      className={`flex flex-col gap-3 border-b border-borda-sutil py-3 ${problema ? "-ml-3 border-l-4 border-l-alerta pl-2" : ""}`}
      data-situacao={situacao ?? "sem"}
    >
      <p id={`${id}-n`} className="text-lg leading-snug font-bold break-words">
        {descricao}
      </p>
      <div role="radiogroup" aria-labelledby={`${id}-n`} onKeyDown={teclado} className="grid grid-cols-3 gap-2">
        {SITUACOES_ITEM_VISTORIA.map((s, i) => {
          const marcado = s === situacao;
          const Icone = ICONE_SITUACAO[s];
          return (
            <button
              key={s}
              ref={(el) => {
                botoes.current[i] = el;
              }}
              type="button"
              role="radio"
              aria-checked={marcado}
              tabIndex={marcado || (indiceAtual < 0 && i === 0) ? 0 : -1}
              onClick={() => {
                if (!marcado) aoMudarSituacao(s);
              }}
              className={`flex h-toque-principal min-w-0 flex-col items-center justify-center gap-0.5 rounded-md border-2 px-1 text-center text-xs leading-tight font-bold transition-colors ${
                marcado ? COR_MARCADO[s] : "border-borda bg-superficie text-texto active:bg-superficie-2"
              }`}
            >
              <Icone size={20} strokeWidth={2.5} aria-hidden className="shrink-0" />
              <span className="[hyphens:none]">{ROTULO_SITUACAO_ITEM[s]}</span>
            </button>
          );
        })}
      </div>

      {mostrarObservacao ? (
        <div className="flex flex-col gap-2">
          {problema && (
            <SugestoesTexto
              sugestoes={SUGESTOES_PROBLEMA_ITEM}
              rotulo={`Sugestões para ${descricao}`}
              aoEscolher={(s) => aoMudarObservacao(acrescentarTexto(observacao, s).slice(0, LIMITE_OBSERVACAO_ITEM))}
            />
          )}
          <Campo
            rotulo={problema ? "O que tem?" : "Observação"}
            opcional
            value={observacao}
            onChange={(e) => aoMudarObservacao(e.target.value)}
            maxLength={LIMITE_OBSERVACAO_ITEM}
            enterKeyHint="done"
            autoComplete="off"
            ajuda={problema ? ajudaProblema : undefined}
            aria-label={`${problema ? "O que tem" : "Observação"}: ${descricao} (opcional)`}
          />
        </div>
      ) : (
        situacao && (
          <button
            type="button"
            onClick={() => setObservacaoAberta(true)}
            aria-label={`Acrescentar observação: ${descricao}`}
            className="inline-flex min-h-toque items-center gap-1.5 self-start rounded-md px-1 text-base font-bold text-texto-suave underline underline-offset-4"
          >
            <Plus size={18} strokeWidth={2.5} aria-hidden />
            Observação
          </button>
        )
      )}
    </div>
  );
}

/**
 * "Marcar o resto como ok (13)" (DESIGN §12.5): secundario 56 px, so enquanto houver item sem
 * marcar (`restantes` 0 = nada). O pai marca e mostra o `AvisoDesfazer`.
 */
export function BotaoMarcarRestoOk({ restantes, aoMarcar }: { restantes: number; aoMarcar: () => void }) {
  if (restantes <= 0) return null;
  return (
    <Botao variante="secundario" onClick={aoMarcar}>
      <CheckCheck size={22} strokeWidth={2.25} aria-hidden />
      Marcar o resto como ok ({restantes})
    </Botao>
  );
}

/** "16 itens · 3 marcados" / "16 itens · todos marcados" (`role="status"`). */
export function ContagemChecklist({ total, marcados }: { total: number; marcados: number }) {
  return (
    <p role="status" className="text-sm font-bold text-texto-suave">
      {total} {total === 1 ? "item" : "itens"} ·{" "}
      {marcados >= total && total > 0 ? "todos marcados" : `${marcados} ${marcados === 1 ? "marcado" : "marcados"}`}
    </p>
  );
}

const COR_LEITURA: Record<SituacaoItemVistoria, string> = {
  ok: "text-sucesso-texto",
  com_problema: "text-alerta-texto",
  nao_se_aplica: "text-texto-suave",
};

/** Ordem da leitura: problemas primeiro, depois ok, depois nao se aplica (DESIGN §12.12). */
export function ordenarParaLeitura<T extends { situacao: SituacaoItemVistoria | null }>(itens: T[]): T[] {
  const peso = (s: SituacaoItemVistoria | null) => (s === "com_problema" ? 0 : s === "ok" ? 1 : s === "nao_se_aplica" ? 2 : 3);
  return itens
    .map((item, i) => ({ item, i }))
    .sort((a, b) => peso(a.item.situacao) - peso(b.item.situacao) || a.i - b.i)
    .map((x) => x.item);
}

/** Linha so leitura (vistoria concluida): icone + item + situacao + observacao. */
export function LinhaChecklistLeitura({
  descricao,
  situacao,
  observacao,
}: {
  descricao: string;
  situacao: SituacaoItemVistoria | null;
  observacao?: string | null;
}) {
  const Icone = situacao ? ICONE_SITUACAO[situacao] : CircleDashed;
  const obs = observacao?.trim();
  return (
    <li className="flex items-start gap-3 border-b border-borda-sutil py-2.5 last:border-b-0">
      <Icone
        size={22}
        strokeWidth={2.5}
        aria-hidden
        className={`mt-0.5 shrink-0 ${situacao ? COR_LEITURA[situacao] : "text-texto-suave"}`}
      />
      <div className="min-w-0 flex-1">
        <p className="text-base font-bold break-words">
          {descricao}
          <span className={`font-medium ${situacao ? COR_LEITURA[situacao] : "text-texto-suave"}`}>
            {" — "}
            {situacao ? ROTULO_SITUACAO_ITEM_LEITURA[situacao].toLowerCase() : "sem marcar"}
          </span>
        </p>
        {obs && <p className="text-base break-words text-texto-suave">{obs}</p>}
      </div>
    </li>
  );
}
