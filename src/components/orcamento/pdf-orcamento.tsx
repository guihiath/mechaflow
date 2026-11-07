"use client";

import { BotaoBaixarPdf, MensagensPdf, usePdfArquivo, type ErroPdf } from "@/components/pdf/compartilhar-pdf";

/*
 * "Baixar PDF" da versão congelada do orçamento (F7-B9, DESIGN §14.10): botão secundário na
 * consulta `/os/[id]/orcamento/[versao]`. Só dono e atendente (a página dá 404 ao mecânico e a
 * rota também). OS cancelada: a página não monta o botão; se cancelar com a tela aberta, 409.
 * O conteúdo da versão nunca muda, então a chave do arquivo guardado é só a versão.
 */

const TEXTOS: Partial<Record<ErroPdf, string>> = {
  nao_encontrada: "Este orçamento não está disponível para você.",
  cancelada: "Esta OS foi cancelada. O PDF não está mais disponível.",
};

export function BotaoPdfOrcamento({ osId, versao, numeroOS, placaNormalizada }: { osId: string; versao: number; numeroOS: number; placaNormalizada: string }) {
  const pdf = usePdfArquivo({
    rota: `/api/os/${osId}/orcamento/${versao}/pdf`,
    chave: String(versao),
    nomeReserva: `orcamento-v${versao}-OS${numeroOS}-${placaNormalizada || "sem-placa"}.pdf`,
    textos: TEXTOS,
    conflitoCancelada: true,
  });
  return (
    <div className="flex w-full max-w-[560px] flex-col gap-2" data-teste="pdf-orcamento">
      <BotaoBaixarPdf pdf={pdf} className="h-auto! min-h-toque py-2" />
      <MensagensPdf pdf={pdf} />
    </div>
  );
}
