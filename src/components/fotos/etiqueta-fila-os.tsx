"use client";

import { EtiquetaFotosNaoEnviadas } from "@/components/os/etiquetas-fase3";
import { useFila } from "./usar-fila";

/**
 * "2 fotos não enviadas" no cartão da OS (DESIGN §11.10): conta as fotos desta OS que estão
 * na fila do aparelho (guardadas ou enviando) e ainda não foram confirmadas pelo banco.
 * A fila é ligada pelo layout do app (`FilaFotosGlobal`); no servidor não mostra nada.
 */
export function EtiquetaFilaOS({ osId, usuarioId }: { osId: string; usuarioId: string }) {
  const fila = useFila();
  const n = fila.itens.filter((i) => i.osId === osId && i.usuarioId === usuarioId && i.estado !== "confirmada").length;
  return <EtiquetaFotosNaoEnviadas quantidade={n} />;
}
