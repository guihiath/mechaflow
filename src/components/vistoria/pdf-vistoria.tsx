"use client";

import { usePdfArquivo, type ErroPdf } from "@/components/pdf/compartilhar-pdf";

/*
 * PDF da vistoria na tela de leitura (F4-B6, DESIGN §12.17). A lógica de gerar, compartilhar e
 * baixar ficou genérica em `components/pdf/compartilhar-pdf.tsx` (F7-B3, DESIGN §14.10), com o
 * mesmo comportamento; aqui só a rota e os textos da vistoria.
 */

export { BotaoBaixarPdf, BotaoEnviarPdf, MensagensPdf, type EstadoPdf } from "@/components/pdf/compartilhar-pdf";

const ROTA = (id: string) => `/api/vistorias/${id}/pdf`;

const TEXTOS: Partial<Record<ErroPdf, string>> = {
  nao_encontrada: "Esta vistoria não está disponível para você.",
};

/**
 * Estado e ações do PDF. `chave` muda quando a vistoria ganha complemento (o PDF guardado
 * na memória deixa de valer). `nomeReserva` = nome do arquivo se o servidor não mandar.
 */
export function usePdfVistoria({ vistoriaId, chave, nomeReserva }: { vistoriaId: string; chave: string; nomeReserva: string }) {
  return usePdfArquivo({ rota: ROTA(vistoriaId), chave, nomeReserva, textos: TEXTOS });
}
