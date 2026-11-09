"use client";

import { useRouter } from "next/navigation";
import { useRenovarUrlsAssinadas } from "@/lib/fotos/usar-renovar-urls";

/**
 * Para telas cujas URLs assinadas vêm do servidor (vistoria em rascunho e leitura, F8-P2):
 * perto de vencer, `router.refresh()` busca a página de novo e o servidor assina outra vez.
 * O estado do navegador (passo, rascunho, folhas abertas) fica; só as props mudam.
 * `assinadasEm` vem do servidor a cada render, então cada refresh reinicia a contagem.
 */
export function RenovarUrlsAssinadas({ assinadasEm }: { assinadasEm: number }) {
  const router = useRouter();
  useRenovarUrlsAssinadas(assinadasEm, () => router.refresh());
  return null;
}
