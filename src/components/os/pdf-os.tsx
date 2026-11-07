"use client";

import { useId } from "react";
import { BotaoBaixarPdf, BotaoEnviarPdf, MensagensPdf, usePdfArquivo, type ErroPdf } from "@/components/pdf/compartilhar-pdf";
import { Cartao } from "@/components/ui/estados";

/*
 * Cartão "Resumo final para o cliente" / "Ordem de serviço para o cliente" no detalhe da OS
 * (F7-B3, DESIGN §14.10). Só dono e atendente (a página não monta para o mecânico, e a rota
 * devolve 404 para ele). Fora da barra de ações: "Enviar ao cliente (PDF)" é primário só com a OS
 * entregue e paga (barra vazia); nos outros casos, secundário. OS cancelada: o cartão não aparece.
 */

const TEXTOS: Partial<Record<ErroPdf, string>> = {
  nao_encontrada: "Esta OS não está disponível para você.",
  cancelada: "Esta OS foi cancelada. O PDF não está mais disponível.",
};

export function CartaoPdfOS({
  osId,
  numero,
  placaNormalizada,
  entregue,
  pagoEm,
  status,
  totalCentavos,
  qtdItens,
  itensSemPreco,
}: {
  osId: string;
  numero: number;
  placaNormalizada: string;
  entregue: boolean;
  pagoEm: string | null;
  /** Entra na chave do arquivo guardado: mudou o status, gera outro. */
  status: string;
  totalCentavos: number;
  qtdItens: number;
  itensSemPreco: number;
}) {
  const idTitulo = useId();
  const prefixo = entregue ? "resumo-final" : "ordem-de-servico";
  const pdf = usePdfArquivo({
    rota: `/api/os/${osId}/pdf`,
    // Registrou o pagamento ou mudou item/preço: o próximo envio gera outro arquivo (DESIGN §14.10).
    chave: [status, pagoEm ?? "", totalCentavos, qtdItens, itensSemPreco].join(":"),
    nomeReserva: `${prefixo}-OS${numero}-${placaNormalizada || "sem-placa"}.pdf`,
    textos: TEXTOS,
    conflitoCancelada: true,
  });
  const primario = entregue && Boolean(pagoEm);

  return (
    <Cartao>
      <section aria-labelledby={idTitulo} className="flex flex-col gap-3" data-teste="cartao-pdf-os">
        <div className="flex flex-col gap-1">
          <h2 id={idTitulo} className="text-xl">
            {entregue ? "Resumo final para o cliente" : "Ordem de serviço para o cliente"}
          </h2>
          <p className="text-[15px] text-texto-suave">
            Valores, causa e solução. Sem fotos.
            <br />
            Não é documento fiscal.
          </p>
        </div>
        {pdf.podeCompartilhar ? (
          <>
            <BotaoEnviarPdf pdf={pdf} variante={primario ? "primario" : "secundario"} />
            <BotaoBaixarPdf pdf={pdf} className="h-auto! min-h-toque py-2" />
          </>
        ) : (
          // Sem compartilhar de arquivo, o "Enviar" viraria um segundo "Baixar PDF" igual (F7-B11, I4).
          <BotaoBaixarPdf pdf={pdf} variante={primario ? "primario" : "secundario"} />
        )}
        <MensagensPdf pdf={pdf} />
      </section>
    </Cartao>
  );
}
