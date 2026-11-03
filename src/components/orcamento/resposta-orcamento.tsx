"use client";

import { useEffect, useRef, type FocusEvent, type KeyboardEvent, type RefObject } from "react";
import { ArrowLeft, Check, ThumbsDown, ThumbsUp } from "lucide-react";
import { ID_SUA_RESPOSTA } from "@/components/orcamento/atalho-resposta";
import { Botao, classesFantasma } from "@/components/ui/botao";
import { AreaTexto, Campo } from "@/components/ui/campo";
import { CaixaErro, ChipPlaca } from "@/components/ui/estados";
import { acrescentarTexto, SugestoesTexto } from "@/components/ui/sugestoes-texto";
import { formatarCentavos, formatarNumeroOS, formatarPlaca } from "@/lib/formato";
import {
  MOTIVO_CONTADOR_A_PARTIR,
  MOTIVO_MAX,
  NOME_MAX,
  SUGESTOES_MOTIVO_CLIENTE,
  type DadosDocumentoOrcamento,
  type TipoResposta,
} from "@/lib/orcamento";

/** 56 px, e cresce em vez de cortar com texto a 200% (DESIGN §13.17). */
const ALTURA_FLEXIVEL = "h-auto! min-h-toque-principal py-2";

/**
 * "Sua resposta" (DESIGN §13.2): Aprovar em cima, Recusar embaixo, 24 px entre eles, sem barra
 * fixa. `desativado` é a prévia do balcão: aparecem como o cliente vê e não respondem.
 */
export function BotoesResposta({ aoEscolher, desativado = false }: { aoEscolher?: (tipo: TipoResposta) => void; desativado?: boolean }) {
  const tocar = (tipo: TipoResposta) => {
    if (!desativado) aoEscolher?.(tipo);
  };
  return (
    <section aria-labelledby={ID_SUA_RESPOSTA} className="flex flex-col gap-3">
      <h2 id={ID_SUA_RESPOSTA} tabIndex={-1} className="text-xl">
        Sua resposta
      </h2>
      <noscript>
        <p className="text-base font-bold">Para responder por aqui, ative o JavaScript do navegador ou fale com a oficina.</p>
        {/* Sem JavaScript os botões não fariam nada: não mostrar. */}
        <style dangerouslySetInnerHTML={{ __html: "[data-so-com-js]{display:none!important}" }} />
      </noscript>
      <div data-so-com-js className="flex flex-col gap-6">
        <Botao className={ALTURA_FLEXIVEL} aria-disabled={desativado || undefined} onClick={() => tocar("aprovou")}>
          <ThumbsUp size={24} strokeWidth={2.25} aria-hidden />
          Aprovar orçamento
        </Botao>
        <Botao variante="secundario" className={ALTURA_FLEXIVEL} aria-disabled={desativado || undefined} onClick={() => tocar("recusou")}>
          <ThumbsDown size={24} strokeWidth={2.25} aria-hidden />
          Recusar orçamento
        </Botao>
      </div>
      {desativado && <p className="text-sm text-texto-suave">Na prévia, os botões não funcionam.</p>}
    </section>
  );
}

/** Falha ao enviar (§13.4): "rede" = sem internet ou 20 s sem retorno; "servidor" = erro do servidor. */
export type FalhaEnvio = "rede" | "servidor";

/** Teclado: "OK" só fecha, nunca envia (§13.3). */
function fecharTecladoNoEnter(e: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) {
  if (e.key !== "Enter") return;
  e.preventDefault();
  e.currentTarget.blur();
}

/** Campo com foco vai para o meio da área visível, depois que o teclado acabar de subir (§13.17). */
function centralizarCampo(e: FocusEvent<HTMLInputElement | HTMLTextAreaElement>) {
  const campo = e.currentTarget;
  setTimeout(() => campo.scrollIntoView({ block: "center" }), 300);
}

/**
 * Passo de confirmação (§13.3 e §13.4). Só desenha: quem guarda o digitado e fala com o servidor
 * é `PaginaOrcamentoPublico`. Sem <form> de propósito: nada aqui envia sem o toque no botão.
 */
export function ConfirmarResposta({
  tipo,
  documento,
  nome,
  aoMudarNome,
  erroNome,
  motivo,
  aoMudarMotivo,
  erroMotivo,
  enviando,
  lento,
  falha,
  aoVoltar,
  aoEnviar,
  refNome,
}: {
  tipo: TipoResposta;
  documento: DadosDocumentoOrcamento;
  nome: string;
  aoMudarNome: (nome: string) => void;
  erroNome?: string;
  motivo: string;
  aoMudarMotivo: (motivo: string) => void;
  erroMotivo?: string;
  enviando: boolean;
  lento: boolean;
  falha: FalhaEnvio | null;
  aoVoltar: () => void;
  aoEnviar: () => void;
  refNome: RefObject<HTMLInputElement | null>;
}) {
  const aprovar = tipo === "aprovou";
  const total = formatarCentavos(documento.total_centavos);
  const caixaFalha = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (falha) caixaFalha.current?.focus();
  }, [falha]);

  const tituloFalha =
    falha === "servidor"
      ? "Não foi possível confirmar sua resposta."
      : aprovar
        ? "Sua aprovação ainda não foi confirmada."
        : "Sua recusa ainda não foi confirmada.";

  const rotuloFinal = enviando
    ? aprovar
      ? "Enviando aprovação…"
      : "Enviando recusa…"
    : falha
      ? "Tentar de novo"
      : aprovar
        ? `Aprovar ${total}`
        : "Recusar orçamento";

  return (
    <section className="flex flex-col gap-4">
      <button type="button" onClick={aoVoltar} disabled={enviando} className={`${classesFantasma} self-start disabled:opacity-50`}>
        <ArrowLeft size={20} strokeWidth={2.25} aria-hidden className="shrink-0" />
        Voltar ao orçamento
      </button>

      <div className="flex flex-col gap-2">
        <h1 data-titulo-orcamento tabIndex={-1} className="text-2xl">
          {aprovar ? "Aprovar este orçamento?" : "Recusar este orçamento?"}
        </h1>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="font-mono text-base font-semibold">{formatarNumeroOS(documento.os_numero)}</span>
          <span aria-hidden>·</span>
          <ChipPlaca placa={formatarPlaca(documento.veiculo_placa)} />
        </div>
        {aprovar && (
          <p className="text-2xl">
            <span className="font-bold">Total: </span>
            <span className="font-mono font-semibold whitespace-nowrap">{total}</span>
          </p>
        )}
      </div>

      {aprovar ? (
        <>
          <Campo
            ref={refNome}
            rotulo="Seu nome"
            value={nome}
            onChange={(e) => aoMudarNome(e.target.value)}
            onKeyDown={fecharTecladoNoEnter}
            onFocus={centralizarCampo}
            erro={erroNome}
            ajuda="Quem está aprovando. Pode ser o dono, o gerente ou o motorista."
            autoComplete="name"
            autoCapitalize="words"
            enterKeyHint="done"
            maxLength={NOME_MAX}
            disabled={enviando}
          />
          <p className="text-base">
            Ao aprovar, a oficina fica autorizada a fazer os serviços e usar as peças deste orçamento. Depois de enviar,
            para mudar só falando com a oficina.
          </p>
          <p className="text-sm text-texto-suave">Vamos registrar seu nome, data e hora, IP e navegador como comprovante.</p>
        </>
      ) : (
        <>
          <p className="text-base">A oficina recebe sua resposta e pode falar com você para combinar outro valor ou serviço.</p>
          {!enviando && (
            <SugestoesTexto
              rotulo="Motivos prontos"
              sugestoes={SUGESTOES_MOTIVO_CLIENTE}
              aoEscolher={(s) => aoMudarMotivo(acrescentarTexto(motivo, s).slice(0, MOTIVO_MAX))}
            />
          )}
          <div className="flex flex-col gap-1">
            <AreaTexto
              rotulo="Quer dizer o motivo? (opcional)"
              value={motivo}
              onChange={(e) => aoMudarMotivo(e.target.value)}
              onKeyDown={fecharTecladoNoEnter}
              onFocus={centralizarCampo}
              erro={erroMotivo}
              ajuda="A oficina vê este texto."
              enterKeyHint="done"
              maxLength={MOTIVO_MAX}
              disabled={enviando}
            />
            {motivo.length >= MOTIVO_CONTADOR_A_PARTIR && (
              <p className="text-right font-mono text-sm text-texto-suave" aria-live="polite">
                {motivo.length}/{MOTIVO_MAX}
              </p>
            )}
          </div>
          <p className="text-sm text-texto-suave">Vamos registrar data e hora, IP e navegador como comprovante.</p>
        </>
      )}

      {falha && (
        <div ref={caixaFalha} tabIndex={-1}>
          <CaixaErro titulo={tituloFalha} texto="Confira a internet e tente de novo. Não vai ficar repetida." />
        </div>
      )}

      <div className="flex flex-col gap-3">
        <Botao variante="secundario" className="h-auto! min-h-toque py-1" onClick={aoVoltar} disabled={enviando}>
          Voltar sem responder
        </Botao>
        <Botao
          variante={aprovar ? "primario" : "secundario"}
          className={`${ALTURA_FLEXIVEL} ${aprovar ? "" : "border-texto!"}`}
          onClick={aoEnviar}
          disabled={enviando}
          aria-busy={enviando || undefined}
        >
          {!enviando && !falha && aprovar && <Check size={24} strokeWidth={2.5} aria-hidden className="shrink-0" />}
          {rotuloFinal}
        </Botao>
        {enviando && lento && (
          <p role="status" className="text-base font-bold">
            Internet lenta, ainda enviando. Não feche esta página.
          </p>
        )}
      </div>
    </section>
  );
}
