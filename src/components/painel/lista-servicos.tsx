"use client";

import Link from "next/link";
import { useId, useState } from "react";
import { ChevronRight } from "lucide-react";
import { classesFantasma } from "@/components/ui/botao";
import { CaixaErro } from "@/components/ui/estados";
import { TEXTO_PAINEL, nomeMesCurto, textoOS, type Mes } from "@/lib/painel";

export type ServicoRanking = {
  /** `servico_id` do catálogo; `null` = "Fora do catálogo" (como vem de `painel_mes.servicos`). */
  id: string | null;
  /** Nome atual no catálogo (mesmo desativado ou renomeado). */
  nome: string;
  /** OS distintas em que o serviço aparece. */
  quantidadeOS: number;
};

const PRIMEIROS = 5;

/** Mais OS primeiro; empate em ordem alfabética (DESIGN §14.8). */
export function ordenarServicos(lista: readonly ServicoRanking[]): (ServicoRanking & { id: string })[] {
  return lista
    .filter((s): s is ServicoRanking & { id: string } => s.id !== null && s.quantidadeOS > 0)
    .sort((a, b) => b.quantidadeOS - a.quantidadeOS || a.nome.localeCompare(b.nome, "pt-BR"));
}

function LinhaServico({ nome, quantidadeOS, href }: { nome: string; quantidadeOS: number; href: string }) {
  return (
    <li className="border-b border-borda-sutil last:border-b-0">
      <Link
        href={href}
        aria-label={`${nome}: ${textoOS(quantidadeOS)}. Ver as OS.`}
        className="flex min-h-14 items-center gap-3 py-2 active:bg-superficie-2"
      >
        <span className="min-w-0 flex-1 text-lg font-bold break-words">{nome}</span>
        <span className="shrink-0 font-mono text-base font-semibold whitespace-nowrap">{textoOS(quantidadeOS)}</span>
        <ChevronRight size={24} strokeWidth={2.25} aria-hidden className="shrink-0 text-texto-suave" />
      </Link>
    </li>
  );
}

/**
 * Serviços mais feitos (DESIGN §14.8, `ListaServicos`): ranking só de texto, sem barra, medalha,
 * porcentagem ou R$. 5 primeiros + "Mostrar todos (N)" expandindo no lugar. "Fora do catálogo"
 * fica fora da ordem: sempre a última, depois de um divisor, mesmo com a lista fechada.
 * `erro`: `CaixaErro` no lugar, sem derrubar o resto do painel.
 */
export function ListaServicos({
  mes,
  servicos,
  hrefServico,
  hrefForaCatalogo,
  erro,
  tentarDeNovo,
}: {
  mes: Mes;
  /** Lista do mês, inteira, como vem do banco. A linha com `id: null` vira "Fora do catálogo". */
  servicos: readonly ServicoRanking[];
  hrefServico: (id: string) => string;
  hrefForaCatalogo: string;
  erro?: boolean;
  tentarDeNovo?: string;
}) {
  const [todos, setTodos] = useState(false);
  const idLista = useId();
  const idTitulo = useId();
  const ordenados = ordenarServicos(servicos);
  const foraCatalogoOS = servicos.find((s) => s.id === null)?.quantidadeOS ?? 0;
  const mostrados = todos ? ordenados : ordenados.slice(0, PRIMEIROS);
  const vazio = ordenados.length === 0 && foraCatalogoOS === 0;

  return (
    <section aria-labelledby={idTitulo} className="flex flex-col gap-2" data-teste="lista-servicos">
      <h2 id={idTitulo} className="text-2xl">
        Serviços mais feitos
      </h2>
      {erro ? (
        <CaixaErro titulo="Não foi possível carregar os serviços." tentarDeNovo={tentarDeNovo} />
      ) : vazio ? (
        <p className="text-base text-texto-suave">Nenhum serviço nas OS entregues em {nomeMesCurto(mes)}.</p>
      ) : (
        <>
          <p className="text-sm text-texto-suave">
            Nas OS entregues em {nomeMesCurto(mes)}. Uma OS com vários serviços conta em cada um.
          </p>
          <div className="flex flex-col rounded-lg border border-borda-sutil bg-superficie px-4 py-1">
            {mostrados.length > 0 && (
              <ul id={idLista} className="flex flex-col">
                {mostrados.map((s) => (
                  <LinhaServico key={s.id} nome={s.nome} quantidadeOS={s.quantidadeOS} href={hrefServico(s.id)} />
                ))}
              </ul>
            )}
            {ordenados.length > PRIMEIROS && (
              <button
                type="button"
                aria-expanded={todos}
                aria-controls={idLista}
                onClick={() => setTodos((v) => !v)}
                className={`${classesFantasma} self-start`}
              >
                {todos ? "Mostrar só os 5 primeiros" : `Mostrar todos (${ordenados.length})`}
              </button>
            )}
            {foraCatalogoOS > 0 && (
              <ul className={mostrados.length > 0 ? "border-t-2 border-borda-sutil" : ""}>
                <LinhaServico nome={TEXTO_PAINEL.foraCatalogo} quantidadeOS={foraCatalogoOS} href={hrefForaCatalogo} />
              </ul>
            )}
          </div>
        </>
      )}
    </section>
  );
}
