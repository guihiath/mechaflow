"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import type { SituacaoEnvio } from "@/components/os/faixa-envio-fotos";
import { aoConfirmarFoto, assinarFila, lerFila, lerFilaServidor, type ItemFila } from "@/lib/fotos/fila";

/** Estado da fila de fotos (o mesmo para a seção da OS e para a faixa global). */
export function useFila() {
  return useSyncExternalStore(assinarFila, lerFila, lerFilaServidor);
}

/**
 * Situação da faixa de envio (DESIGN §11.6) para um conjunto de itens da fila.
 * Conta as fotos confirmadas "neste lote" para "Enviando foto 2 de 5…" e "5 fotos enviadas.".
 * `filtro` diz quais itens entram (ex.: só os desta OS).
 */
export function useSituacaoEnvio(itens: ItemFila[], filtro: (i: ItemFila) => boolean, numeroOS?: number | string | null) {
  const [enviadas, setEnviadas] = useState(0);

  useEffect(
    () =>
      aoConfirmarFoto((_osId, id) => {
        const i = lerFila().itens.find((x) => x.id === id);
        if (i && filtro(i)) setEnviadas((n) => n + 1);
      }),
    // o filtro muda a cada render; o que importa é o conjunto de itens
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const meus = itens.filter((i) => i.categoria !== null && filtro(i));
  const andando = meus.filter((i) => i.estado === "preparando" || i.estado === "na_fila" || i.estado === "enviando");
  const semRede = meus.filter((i) => i.estado === "sem_internet");
  const falhas = meus.filter((i) => i.estado === "falhou" || i.estado === "nao_enviavel");

  let situacao: SituacaoEnvio | null = null;
  if (andando.length) {
    const total = enviadas + andando.length;
    const atual = andando.find((i) => i.estado === "enviando");
    const progresso = ((enviadas * 100 + (atual?.progresso ?? 0)) / Math.max(total, 1)) | 0;
    const retomando = numeroOS != null && meus.every((i) => i.retomada);
    situacao = retomando
      ? { tipo: "retomando", quantidade: andando.length, numeroOS, progresso }
      : { tipo: "enviando", atual: Math.min(enviadas + 1, total), total, progresso };
  } else if (semRede.length) situacao = { tipo: "sem_internet", guardadas: semRede.length };
  else if (falhas.length) situacao = { tipo: "falhou", quantidade: falhas.length };
  else if (enviadas > 0) situacao = { tipo: "concluido", total: enviadas };

  return {
    situacao,
    falhas,
    zerar: () => setEnviadas(0),
  };
}

export function useSemInternet() {
  return useSyncExternalStore(
    (f) => {
      window.addEventListener("online", f);
      window.addEventListener("offline", f);
      return () => {
        window.removeEventListener("online", f);
        window.removeEventListener("offline", f);
      };
    },
    () => !navigator.onLine,
    () => false,
  );
}
