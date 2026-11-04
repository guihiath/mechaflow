"use client";

import { CalendarX, Link2, Link2Off, RefreshCw } from "lucide-react";
import { AcaoBalcao, type GatilhoAcao } from "@/components/orcamento/acao-balcao";
import { classesFantasma } from "@/components/ui/botao";
import { ConfirmarAcao } from "@/components/ui/confirmar-acao";
import { Cartao, Etiqueta } from "@/components/ui/estados";
import { CaixaMensagem } from "@/components/ui/formulario";
import type { EstadoAcao } from "@/lib/acao";
import { formatarData, formatarDiaHora } from "@/lib/formato";
import { textoDiasRestantes } from "@/lib/orcamento";

/** Situação do link (DESIGN §13.11). Respondido não passa por aqui: `ProvaOrcamento` ou `RecusaDestaque`. */
export type SituacaoCartaoLink =
  | { situacao: "ativo"; geradoPor: string | null; geradoEm: string; versao: number; expiraEm: string; agora: string }
  | { situacao: "vencido"; versao: number; expiraEm: string }
  | { situacao: "cancelado"; canceladoPor: string | null; canceladoEm: string; versao: number }
  | { situacao: "sem_link" };

/** "Situação do link" no detalhe da OS. Só dono e atendente: o mecânico não vê este cartão (§13.15). */
export function CartaoLink({
  osNumero,
  dados,
  aoReenviar,
  aoVerComoCliente,
  aoCancelarLink,
  aoRegistrarResposta,
  aoEnviarWhatsApp,
}: {
  osNumero: number;
  dados: SituacaoCartaoLink;
  aoReenviar?: GatilhoAcao;
  aoVerComoCliente?: GatilhoAcao;
  aoCancelarLink?: () => Promise<EstadoAcao>;
  aoRegistrarResposta?: GatilhoAcao;
  aoEnviarWhatsApp?: GatilhoAcao;
}) {
  return (
    <Cartao>
      <section aria-label="Orçamento para o cliente" className="flex flex-col gap-3">
        <h2 className="text-xl">Orçamento para o cliente</h2>

        {dados.situacao === "ativo" && (
          <>
            <div>
              <Etiqueta>
                <Link2 size={18} strokeWidth={2.25} aria-hidden />
                Link ativo
              </Etiqueta>
            </div>
            <div className="flex flex-col gap-1 text-base">
              <p>
                Gerado{dados.geradoPor ? ` por ${dados.geradoPor}` : ""} em {formatarDiaHora(dados.geradoEm)} · Versão&nbsp;{dados.versao}
              </p>
              <p>
                Vale até {formatarData(dados.expiraEm)} {textoDiasRestantes(dados.expiraEm, dados.agora)}
              </p>
              <p>Ainda sem resposta.</p>
              <p className="text-xs text-texto-suave">O sistema mostra quando o cliente responde, não quando ele abre.</p>
            </div>
            {aoReenviar && <CaixaMensagem tipo="info">Se a mensagem não saiu, toque em Reenviar: isso gera um link novo e cancela o anterior.</CaixaMensagem>}
            <div className="flex flex-col gap-1">
              {aoReenviar && (
                <AcaoBalcao gatilho={aoReenviar} estilo="secundario" className="mb-1">
                  <RefreshCw size={20} strokeWidth={2.25} aria-hidden />
                  Reenviar
                </AcaoBalcao>
              )}
              {aoVerComoCliente && <AcaoBalcao gatilho={aoVerComoCliente}>Ver como o cliente vê</AcaoBalcao>}
              {aoCancelarLink && (
                <ConfirmarAcao
                  acao={aoCancelarLink}
                  rotulo="Cancelar link"
                  classeAbrir={`${classesFantasma} self-start text-erro-texto!`}
                  pergunta={`Cancelar o link da OS #${osNumero}?`}
                  texto="Quem abrir verá que o link não está mais ativo. Para o cliente responder, envie outro."
                  rotuloVoltar="Voltar sem cancelar"
                  rotuloConfirmar="Cancelar link"
                  rotuloEnviando="Cancelando…"
                />
              )}
            </div>
          </>
        )}

        {dados.situacao === "vencido" && (
          <>
            <div>
              <Etiqueta tom="alerta">
                <CalendarX size={18} strokeWidth={2.25} aria-hidden />
                Link vencido
              </Etiqueta>
            </div>
            <p className="text-base">
              Venceu em {formatarData(dados.expiraEm)} sem resposta · Versão&nbsp;{dados.versao}
            </p>
            <AcoesSemLink aoVerComoCliente={aoVerComoCliente} aoRegistrarResposta={aoRegistrarResposta} />
          </>
        )}

        {dados.situacao === "cancelado" && (
          <>
            <div>
              <Etiqueta>
                <Link2Off size={18} strokeWidth={2.25} aria-hidden />
                Link cancelado
              </Etiqueta>
            </div>
            <p className="text-base">
              Cancelado{dados.canceladoPor ? ` por ${dados.canceladoPor}` : ""} em {formatarDiaHora(dados.canceladoEm)} · Versão&nbsp;{dados.versao}
            </p>
            <AcoesSemLink aoVerComoCliente={aoVerComoCliente} aoRegistrarResposta={aoRegistrarResposta} />
          </>
        )}

        {dados.situacao === "sem_link" && (
          <>
            <div>
              <Etiqueta>Sem link</Etiqueta>
            </div>
            <p className="text-base">Enviado antes do link. Pode continuar à mão ou mandar o link.</p>
            {aoEnviarWhatsApp && (
              <AcaoBalcao gatilho={aoEnviarWhatsApp} estilo="secundario">
                Enviar por WhatsApp
              </AcaoBalcao>
            )}
          </>
        )}
      </section>
    </Cartao>
  );
}

function AcoesSemLink({ aoVerComoCliente, aoRegistrarResposta }: { aoVerComoCliente?: GatilhoAcao; aoRegistrarResposta?: GatilhoAcao }) {
  return (
    <div className="flex flex-col gap-1">
      {aoVerComoCliente && <AcaoBalcao gatilho={aoVerComoCliente}>Ver como o cliente vê</AcaoBalcao>}
      {aoRegistrarResposta && <AcaoBalcao gatilho={aoRegistrarResposta}>Registrar resposta do cliente</AcaoBalcao>}
    </div>
  );
}
