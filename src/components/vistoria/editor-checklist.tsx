"use client";

import Link from "next/link";
import { useId, useLayoutEffect, useRef, useState } from "react";
import { ArrowDown, ArrowUp, ChevronRight, CircleAlert, PenLine, RotateCcw } from "lucide-react";

export type ItemEditorChecklist = { id: string; descricao: string };
export type Direcao = "subir" | "descer";

const botaoSeta =
  "inline-flex size-12 shrink-0 items-center justify-center rounded-md border-2 border-borda bg-superficie text-texto transition-colors active:bg-superficie-2 disabled:cursor-not-allowed disabled:opacity-40";

/**
 * Linha do editor do checklist (DESIGN §12.16), sem arrastar (SC 2.5.7): 64 px, posicao +
 * nome (botao que abre "Editar item") + Subir/Descer 48 x 48 com nome acessivel
 * ("Subir Estepe"). Primeiro sem Subir e ultimo sem Descer: DESABILITADOS, nao somem.
 */
export function LinhaEditorChecklist({
  item,
  posicao,
  primeiro,
  ultimo,
  aoMover,
  aoEditar,
}: {
  item: ItemEditorChecklist;
  posicao: number;
  primeiro: boolean;
  ultimo: boolean;
  aoMover: (direcao: Direcao) => void;
  aoEditar: () => void;
}) {
  return (
    <li className="flex min-h-16 items-center gap-2 border-b border-borda-sutil py-2 pr-2 pl-1 last:border-b-0">
      <button
        type="button"
        onClick={aoEditar}
        aria-label={`${item.descricao}, ${posicao}º. Editar item`}
        className="flex min-h-toque min-w-0 flex-1 items-center gap-3 rounded-md px-2 text-left active:bg-superficie-2"
      >
        <span aria-hidden className="w-6 shrink-0 text-right font-mono text-base text-texto-suave">
          {posicao}
        </span>
        <span className="min-w-0 flex-1 text-lg leading-snug font-bold break-words">{item.descricao}</span>
        <PenLine size={18} strokeWidth={2.25} aria-hidden className="shrink-0 text-texto-suave" />
      </button>
      <button
        type="button"
        data-mover={`${item.id}:subir`}
        disabled={primeiro}
        onClick={() => aoMover("subir")}
        aria-label={`Subir ${item.descricao}`}
        className={botaoSeta}
      >
        <ArrowUp size={22} strokeWidth={2.5} aria-hidden />
      </button>
      <button
        type="button"
        data-mover={`${item.id}:descer`}
        disabled={ultimo}
        onClick={() => aoMover("descer")}
        aria-label={`Descer ${item.descricao}`}
        className={botaoSeta}
      >
        <ArrowDown size={22} strokeWidth={2.5} aria-hidden />
      </button>
    </li>
  );
}

/** Troca o item com o vizinho (o banco faz o mesmo em `mover_item_checklist`). */
export function moverNaLista<T extends { id: string }>(lista: T[], id: string, direcao: Direcao): T[] {
  const i = lista.findIndex((x) => x.id === id);
  const j = direcao === "subir" ? i - 1 : i + 1;
  if (i < 0 || j < 0 || j >= lista.length) return lista;
  const nova = [...lista];
  [nova[i], nova[j]] = [nova[j], nova[i]];
  return nova;
}

/**
 * Lista do editor (DESIGN §12.16): "Ativos (16)" com as linhas e "Desativados (2)" com
 * "Reativar". Ao mover, o FOCO FICA no mesmo botao da linha movida (da para tocar "Subir"
 * 3 vezes seguidas); se ele ficou desabilitado (chegou ao topo/fim), vai para a outra seta.
 * `role="status"` diz "Estepe agora é o 1º.". O pai troca a ordem (otimista) e, se o banco
 * recusar, volta a ordem e passa `erro`.
 */
export function ListaEditorChecklist({
  ativos,
  desativados = [],
  aoMover,
  aoEditar,
  aoReativar,
  erro,
}: {
  ativos: ItemEditorChecklist[];
  desativados?: ItemEditorChecklist[];
  aoMover: (id: string, direcao: Direcao) => void;
  aoEditar: (item: ItemEditorChecklist) => void;
  aoReativar?: (item: ItemEditorChecklist) => void;
  erro?: string;
}) {
  const lista = useRef<HTMLOListElement>(null);
  const [focar, setFocar] = useState<{ id: string; direcao: Direcao; n: number } | null>(null);
  const [aviso, setAviso] = useState("");
  const id = useId();

  // Depois de trocar a ordem: o React move o <li> no DOM e o navegador pode tirar o foco.
  useLayoutEffect(() => {
    if (!focar || !lista.current) return;
    const outra: Direcao = focar.direcao === "subir" ? "descer" : "subir";
    const mesmo = lista.current.querySelector<HTMLButtonElement>(`[data-mover="${focar.id}:${focar.direcao}"]`);
    const alvo =
      mesmo && !mesmo.disabled
        ? mesmo
        : lista.current.querySelector<HTMLButtonElement>(`[data-mover="${focar.id}:${outra}"]`);
    alvo?.focus();
    // So quando ha um movimento novo: `focar` muda no mesmo toque que a ordem otimista do pai.
    // Depender da lista roubaria o foco de uma Folha aberta a cada render do pai.
  }, [focar]);

  function mover(item: ItemEditorChecklist, direcao: Direcao) {
    const i = ativos.findIndex((x) => x.id === item.id);
    const nova = direcao === "subir" ? i - 1 : i + 1;
    if (nova < 0 || nova >= ativos.length) return;
    aoMover(item.id, direcao);
    setFocar((f) => ({ id: item.id, direcao, n: (f?.n ?? 0) + 1 }));
    setAviso(`${item.descricao} agora é o ${nova + 1}º.`);
  }

  return (
    <div className="flex flex-col gap-4">
      <p role="status" className="sr-only">
        {aviso}
      </p>
      {erro && (
        <p role="alert" className="flex items-start gap-1.5 text-base font-bold text-erro-texto">
          <CircleAlert size={20} strokeWidth={2.25} aria-hidden className="mt-0.5 shrink-0" />
          {erro}
        </p>
      )}
      <section aria-labelledby={`${id}-ativos`} className="flex flex-col gap-2">
        <h2 id={`${id}-ativos`} className="text-xl">
          Ativos ({ativos.length})
        </h2>
        {ativos.length === 0 ? (
          <p className="flex items-start gap-2 rounded-md border-l-4 border-alerta bg-superficie p-3 text-base font-bold">
            <CircleAlert size={20} strokeWidth={2.25} aria-hidden className="mt-0.5 shrink-0 text-alerta-texto" />
            Com o checklist vazio, a vistoria pula este passo.
          </p>
        ) : (
          <ol ref={lista} className="rounded-lg border border-borda-sutil bg-superficie">
            {ativos.map((item, i) => (
              <LinhaEditorChecklist
                key={item.id}
                item={item}
                posicao={i + 1}
                primeiro={i === 0}
                ultimo={i === ativos.length - 1}
                aoMover={(d) => mover(item, d)}
                aoEditar={() => aoEditar(item)}
              />
            ))}
          </ol>
        )}
      </section>
      {desativados.length > 0 && (
        <section aria-labelledby={`${id}-desativados`} className="flex flex-col gap-2">
          <h2 id={`${id}-desativados`} className="text-xl">
            Desativados ({desativados.length})
          </h2>
          <ul className="rounded-lg border border-borda-sutil bg-superficie">
            {desativados.map((item) => (
              <li
                key={item.id}
                className="flex min-h-16 items-center gap-2 border-b border-borda-sutil py-2 pr-2 pl-3 last:border-b-0"
              >
                <span className="min-w-0 flex-1 text-lg break-words text-texto-suave">{item.descricao}</span>
                {aoReativar && (
                  <button
                    type="button"
                    onClick={() => aoReativar(item)}
                    aria-label={`Reativar ${item.descricao}`}
                    className="inline-flex min-h-toque shrink-0 items-center gap-1.5 rounded-md px-3 text-base font-bold text-texto underline underline-offset-4"
                  >
                    <RotateCcw size={18} strokeWidth={2.5} aria-hidden />
                    Reativar
                  </button>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

/** Linha-link "Checklist da vistoria · 16 itens ativos" das configuracoes (DESIGN §12.16 item 4). */
export function LinhaLinkChecklist({ ativos, href }: { ativos: number; href: string }) {
  return (
    <Link
      href={href}
      className="flex min-h-16 items-center gap-3 rounded-lg border border-borda-sutil bg-superficie px-4 py-2 active:bg-superficie-2"
    >
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="text-lg font-bold">Checklist da vistoria</span>
        <span className="text-xs text-texto-suave">
          {ativos} {ativos === 1 ? "item ativo" : "itens ativos"}
        </span>
      </span>
      <ChevronRight size={24} strokeWidth={2.25} aria-hidden className="shrink-0 text-texto-suave" />
    </Link>
  );
}
