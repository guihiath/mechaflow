"use client";

import { usePathname } from "next/navigation";
import { useSyncExternalStore } from "react";

const semAssinatura = () => () => {};

/**
 * Caminho da rota para componentes do layout que hidratam tarde (dentro de Suspense).
 *
 * Por quê (F4-P1, erro React #418): a barra de navegação mora num Suspense do layout que só
 * chega quando o papel do usuário é lido. Se a pessoa toca num link antes de esse pedaço hidratar
 * (internet fraca, celular lento), o `usePathname()` já devolve o caminho NOVO na hidratação,
 * enquanto o HTML veio do servidor com o caminho ANTIGO (ex.: "Início" marcado) → #418.
 *
 * Aqui, durante o render do servidor e a hidratação, usamos o caminho com que o servidor
 * renderizou (`caminhoServidor`, lido do cabeçalho `CABECALHO_CAMINHO` que o proxy põe); logo depois de hidratar o React
 * renderiza de novo com o `usePathname()` atual. Sem `caminhoServidor`, é o `usePathname()` puro.
 */
export function useCaminhoHidratado(caminhoServidor: string | null): string {
  const rota = usePathname();
  const hidratado = useSyncExternalStore(semAssinatura, () => true, () => false);
  return hidratado || !caminhoServidor ? rota : caminhoServidor;
}
