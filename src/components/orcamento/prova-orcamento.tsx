"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronDown, Phone, ThumbsDown, ThumbsUp } from "lucide-react";
import { AcaoBalcao, type GatilhoAcao } from "@/components/orcamento/acao-balcao";
import { classesBotao, classesFantasma } from "@/components/ui/botao";
import { ConfirmarAcao } from "@/components/ui/confirmar-acao";
import { Cartao, Etiqueta } from "@/components/ui/estados";
import type { EstadoAcao } from "@/lib/acao";
import { formatarCentavos, formatarDiaHora } from "@/lib/formato";
import { formatarDataEHora } from "@/lib/orcamento";
import { CANAL_NA_FRASE, type CanalResposta } from "@/lib/os";

/**
 * Prova da aprovação (DESIGN §13.12). "Nome informado", nunca "assinado": quem tinha o link
 * digitou esse nome. IP e navegador não aparecem na tela. Só dono e atendente.
 */
export function ProvaOrcamento({
  osNumero,
  canal,
  nome,
  respondidoEm,
  marcadoPor,
  versao,
  valorCentavos,
  codigoConferencia,
  aoVerAprovado,
  aoDesfazer,
}: {
  osNumero: number;
  canal: CanalResposta;
  nome: string | null;
  respondidoEm: string;
  /** Quem marcou, na aprovação à mão. */
  marcadoPor?: string | null;
  versao: number;
  valorCentavos: number;
  codigoConferencia: string;
  aoVerAprovado?: GatilhoAcao;
  /** Só com a OS em `aprovada`. */
  aoDesfazer?: () => Promise<EstadoAcao>;
}) {
  const peloLink = canal === "link";
  return (
    <Cartao faixa="bg-sucesso">
      <section aria-label="Prova da aprovação" className="flex flex-col gap-1">
        <p className="flex items-start gap-2 text-lg font-bold">
          <ThumbsUp size={22} strokeWidth={2.25} aria-hidden className="mt-0.5 shrink-0 text-sucesso-texto" />
          Aprovado pelo cliente {peloLink ? "no link" : CANAL_NA_FRASE[canal]}
        </p>
        {nome && (
          <p className="text-base break-words">
            {peloLink ? "Nome informado" : "Quem aprovou"}: {nome}
          </p>
        )}
        <p className="text-base">
          {peloLink ? formatarDataEHora(respondidoEm) : formatarDiaHora(respondidoEm)}
          {!peloLink && marcadoPor ? ` · marcado por ${marcadoPor}` : ""} · Versão&nbsp;{versao}
        </p>
        <p className="font-mono text-base font-semibold">Valor aprovado: {formatarCentavos(valorCentavos)}</p>
        <p className="font-mono text-xs">Código de conferência: {codigoConferencia}</p>
        <div className="mt-1 flex flex-col gap-1">
          {aoVerAprovado && <AcaoBalcao gatilho={aoVerAprovado}>Ver o que foi aprovado</AcaoBalcao>}
          {aoDesfazer && <DesfazerAprovacao osNumero={osNumero} aoDesfazer={aoDesfazer} />}
        </div>
      </section>
    </Cartao>
  );
}

/** "Desfazer aprovação" com confirmação (§13.12). Vale para link e para mão, com a OS em `aprovada`. */
export function DesfazerAprovacao({ osNumero, aoDesfazer }: { osNumero: number; aoDesfazer: () => Promise<EstadoAcao> }) {
  return (
    <ConfirmarAcao
      acao={aoDesfazer}
      rotulo="Desfazer aprovação"
      classeAbrir={`${classesFantasma} self-start`}
      pergunta={`Desfazer a aprovação da OS #${osNumero}?`}
      texto="A OS volta para Aguardando orçamento. O registro continua guardado como desfeito e o link não volta a valer: para o cliente responder pelo link, é preciso enviar de novo."
      rotuloVoltar="Voltar sem desfazer"
      rotuloConfirmar="Desfazer aprovação"
      rotuloEnviando="Desfazendo…"
    />
  );
}

export type LinhaRespostaVersao = {
  versao: number;
  resposta: "aprovou" | "recusou" | "enviada";
  canal?: CanalResposta;
  nome?: string | null;
  em?: string | null;
  motivo?: string | null;
  desfeitaPor?: string | null;
  desfeitaEm?: string | null;
  href: string;
};

/** "Ver respostas e versões (3)": expande no lugar, mais recente primeiro (§13.12). */
export function RespostasVersoes({ linhas }: { linhas: LinhaRespostaVersao[] }) {
  const [aberta, setAberta] = useState(false);
  if (linhas.length === 0) return null;
  return (
    <div className="flex flex-col gap-2">
      <button type="button" aria-expanded={aberta} onClick={() => setAberta(!aberta)} className={`${classesFantasma} self-start`}>
        <ChevronDown size={20} strokeWidth={2.25} aria-hidden className={`shrink-0 ${aberta ? "rotate-180" : ""}`} />
        Ver respostas e versões ({linhas.length})
      </button>
      {aberta && (
        <ul className="flex flex-col gap-2">
          {linhas.map((l) => (
            <li key={`${l.versao}-${l.resposta}-${l.em ?? ""}`}>
              <Link
                href={l.href}
                className="flex min-h-toque flex-col items-start justify-center gap-1 rounded-md border border-borda-sutil bg-superficie p-3 text-sm active:bg-superficie-2"
              >
                <span className="[overflow-wrap:anywhere]">{textoLinha(l)}</span>
                {l.desfeitaEm && (
                  <span className="flex flex-wrap items-center gap-2">
                    <Etiqueta>Desfeita</Etiqueta>
                    <strong className="font-bold">
                      Desfeita{l.desfeitaPor ? ` por ${l.desfeitaPor}` : ""} em {formatarDiaHora(l.desfeitaEm)}
                    </strong>
                  </span>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function textoLinha(l: LinhaRespostaVersao) {
  const inicio = `Versão ${l.versao}`;
  if (l.resposta === "enviada") return `${inicio} · Enviada · sem resposta`;
  const verbo = l.resposta === "aprovou" ? "Aprovou" : "Recusou";
  return [inicio, `${verbo} ${CANAL_NA_FRASE[l.canal ?? "link"]}`, l.nome, l.em ? formatarDiaHora(l.em) : null, l.motivo ? `Motivo: ${l.motivo}` : null]
    .filter(Boolean)
    .join(" · ");
}

/**
 * Recusa pelo link em destaque, logo depois do topo do detalhe (§13.13). Mesmo desenho da
 * `CaixaMensagem alerta grande`, que não comporta botões. O motivo é texto puro do cliente.
 */
export function RecusaDestaque({
  motivo,
  respondidoEm,
  versao,
  telefoneCliente,
  aoRegistrarResposta,
}: {
  motivo: string | null;
  respondidoEm: string;
  versao: number;
  /** Só dono e atendente; sem telefone, o botão de ligar some. */
  telefoneCliente?: string | null;
  aoRegistrarResposta?: GatilhoAcao;
}) {
  return (
    <section aria-label="Recusa do cliente" className="flex flex-col gap-2 rounded-md border-l-4 border-alerta bg-superficie p-4">
      <p className="flex items-start gap-2 text-xl font-bold">
        <ThumbsDown size={24} strokeWidth={2.25} aria-hidden className="mt-0.5 shrink-0 text-alerta-texto" />
        Cliente recusou pelo link
      </p>
      <p className={`text-lg [overflow-wrap:anywhere] ${motivo ? "font-bold" : "text-texto-suave"}`}>{motivo ? `"${motivo}"` : "Sem motivo informado."}</p>
      <p className="text-xs text-texto-suave">
        {formatarDataEHora(respondidoEm)} · Versão&nbsp;{versao}
      </p>
      <p className="text-base">Negocie, ajuste os itens e envie de novo, ou cancele a OS.</p>
      {telefoneCliente && (
        <a href={`tel:${telefoneCliente}`} className={classesBotao("secundario", "h-toque! mt-1")}>
          <Phone size={20} strokeWidth={2.25} aria-hidden />
          Ligar para o cliente
        </a>
      )}
      {aoRegistrarResposta && <AcaoBalcao gatilho={aoRegistrarResposta}>Cliente aceitou? Registrar resposta</AcaoBalcao>}
    </section>
  );
}
