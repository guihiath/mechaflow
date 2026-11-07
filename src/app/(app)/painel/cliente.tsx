"use client";

import { useSyncExternalStore } from "react";
import { FaixaSemInternet } from "@/components/painel/cartao-numero";
import { SeletorMes } from "@/components/painel/seletor-mes";
import type { Mes } from "@/lib/painel";

/**
 * Peças de navegador do painel (F7-B4). O servidor não pode passar função para componente de
 * cliente, então o `hrefDoMes` do `SeletorMes` mora aqui. A URL guarda o mês (DESIGN §14.2.1);
 * o mês atual fica sem `?mes=`.
 */
export function SeletorMesPainel({ mes, hoje, primeiroMes, mesAtual }: { mes: Mes; hoje: string; primeiroMes: Mes; mesAtual: Mes }) {
  return <SeletorMes mes={mes} hoje={hoje} primeiroMes={primeiroMes} hrefDoMes={(m) => (m === mesAtual ? "/painel" : `/painel?mes=${m}`)} />;
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
