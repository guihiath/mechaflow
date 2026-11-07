"use client";

import { useSyncExternalStore } from "react";
import { FaixaSemInternet } from "@/components/painel/cartao-numero";
import { ListaServicos, type ServicoRanking } from "@/components/painel/lista-servicos";
import { SeletorMes } from "@/components/painel/seletor-mes";
import { hrefListaPainel } from "@/lib/origem-os";
import type { Mes } from "@/lib/painel";

/**
 * Peças de navegador do painel (F7-B4). O servidor não pode passar função para componente de
 * cliente, então o `hrefDoMes` do `SeletorMes` mora aqui. A URL guarda o mês (DESIGN §14.2.1);
 * o mês atual fica sem `?mes=`.
 */
export function SeletorMesPainel({ mes, hoje, primeiroMes, mesAtual }: { mes: Mes; hoje: string; primeiroMes: Mes; mesAtual: Mes }) {
  return <SeletorMes mes={mes} hoje={hoje} primeiroMes={primeiroMes} hrefDoMes={(m) => (m === mesAtual ? "/painel" : `/painel?mes=${m}`)} />;
}

/**
 * "Serviços mais feitos" (F7-B6, DESIGN §14.8). `ListaServicos` é de navegador (expande no
 * lugar) e recebe funções de link, que o servidor não pode passar: elas moram aqui.
 */
export function ServicosPainel({ mes, mesNaUrl, servicos }: { mes: Mes; mesNaUrl: Mes | null; servicos: ServicoRanking[] }) {
  return (
    <ListaServicos
      mes={mes}
      servicos={servicos}
      hrefServico={(id) => hrefListaPainel({ ver: "servico", chave: id, mes: mesNaUrl })}
      hrefForaCatalogo={hrefListaPainel({ ver: "fora_catalogo", mes: mesNaUrl })}
    />
  );
}

function assinar(aviso: () => void) {
  window.addEventListener("online", aviso);
  window.addEventListener("offline", aviso);
  return () => {
    window.removeEventListener("online", aviso);
    window.removeEventListener("offline", aviso);
  };
}

/**
 * Faixa "Sem internet" (DESIGN §14.2, estado "Sem internet"): número velho sem aviso é pior que
 * nenhum. No servidor e na primeira pintura, considera conectado (não mostra nada).
 */
export function AvisoSemInternet() {
  const offline = useSyncExternalStore(
    assinar,
    () => navigator.onLine === false,
    () => false,
  );
  return offline ? <FaixaSemInternet /> : null;
}
