"use client";

import { useEffect, useRef, useState } from "react";
import { MessageSquareWarning } from "lucide-react";
import { Botao } from "@/components/ui/botao";
import { AreaTexto } from "@/components/ui/campo";
import { Folha } from "@/components/ui/folha";
import { CaixaMensagem } from "@/components/ui/formulario";
import { EH_PRODUCAO } from "@/lib/brand";
import { apagarRascunhoFeedback, guardarRascunhoFeedback, lerRascunhoFeedback, montarTextoFeedback } from "@/lib/feedback";

/**
 * Botão "Enviar feedback" do cabeçalho (F5-F1, PLANO §18.1). Desde o F8-B2 também em produção
 * (PLANO 21.12-10, DESIGN 15.5): o piloto precisa dele a um toque em qualquer tela.
 * Abre uma folha por cima da tela, sem navegar, e o texto sai pelo compartilhar do aparelho.
 * A importação é direta (sem carregar sob demanda) para o botão funcionar em modo avião.
 */
export function BotaoFeedback() {
  const [aberta, setAberta] = useState(false);
  return (
    <>
      <button
        type="button"
        aria-label="Enviar feedback"
        aria-haspopup="dialog"
        title="Enviar feedback"
        onClick={() => setAberta(true)}
        className="-ml-1 flex size-12 shrink-0 items-center justify-center rounded-md active:bg-white/10"
      >
        <MessageSquareWarning size={24} strokeWidth={2.25} aria-hidden />
      </button>
      {aberta && <FolhaFeedback aoFechar={() => setAberta(false)} />}
    </>
  );
}

function aparelhoCompartilhaTexto(): boolean {
  if (typeof navigator.share !== "function") return false;
  return typeof navigator.canShare !== "function" || navigator.canShare({ text: "MechaFlow" });
}

/** Área de transferência; sem ela, seleção escondida dentro da folha (fora dela está inerte). */
async function copiarTexto(texto: string, dentro: Element | null): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(texto);
    return true;
  } catch {
    if (!dentro) return false;
  }
  const area = document.createElement("textarea");
  area.value = texto;
  area.readOnly = true;
  area.className = "fixed top-0 left-0 size-px text-base opacity-0";
  dentro.append(area);
  try {
    area.focus();
    area.setSelectionRange(0, texto.length);
    return document.execCommand("copy");
  } catch {
    return false;
  } finally {
    area.remove();
  }
}

/**
 * Só existe depois do toque: pode ler navegador e rascunho já na primeira renderização.
 * Também aberta pelo "Enviar feedback" do grupo Ajuda (F8-B2).
 */
export function FolhaFeedback({ aoFechar }: { aoFechar: () => void }) {
  const [compartilha] = useState(aparelhoCompartilhaTexto);
  const [texto, setTexto] = useState(lerRascunhoFeedback);
  const [recuperado] = useState(() => texto.trim() !== "");
  const [faltaTexto, setFaltaTexto] = useState(false);
  const [compartilharFalhou, setCompartilharFalhou] = useState(false);
  const [copiaManual, setCopiaManual] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [concluido, setConcluido] = useState<"enviado" | "copiado" | null>(null);
  const caixa = useRef<HTMLDivElement>(null);
  const botaoConcluir = useRef<HTMLButtonElement>(null);
  const areaManual = useRef<HTMLTextAreaElement>(null);

  // O botão tocado some ao concluir: o foco fica dentro da folha, em quem fecha.
  useEffect(() => {
    if (concluido) botaoConcluir.current?.focus();
  }, [concluido]);

  // A copia manual nasce abaixo da dobra: leva a pessoa até o texto, já selecionado.
  const temCopiaManual = copiaManual !== null;
  useEffect(() => {
    if (!temCopiaManual) return;
    areaManual.current?.scrollIntoView({ block: "nearest" });
    areaManual.current?.select();
  }, [temCopiaManual]);

  function aoDigitar(valor: string) {
    setTexto(valor);
    guardarRascunhoFeedback(valor);
    if (valor.trim()) setFaltaTexto(false);
    setCopiaManual(null);
  }

  function concluir(como: "enviado" | "copiado") {
    apagarRascunhoFeedback();
    setTexto("");
    setConcluido(como);
  }

  /** Texto pronto para sair, ou null se a pessoa ainda não escreveu nada. */
  function textoParaSair(): string | null {
    if (!texto.trim()) {
      setFaltaTexto(true);
      return null;
    }
    return montarTextoFeedback(texto);
  }

  async function compartilhar() {
    const final = textoParaSair();
    if (!final || ocupado) return;
    setOcupado(true);
    setCompartilharFalhou(false);
    setCopiaManual(null);
    try {
      await navigator.share({ text: final });
      concluir("enviado");
    } catch (erro) {
      // Cancelar a janela de compartilhar não é erro: o texto continua aqui.
      if (!(erro instanceof Error && erro.name === "AbortError")) setCompartilharFalhou(true);
    } finally {
      setOcupado(false);
    }
  }

  async function copiar() {
    const final = textoParaSair();
    if (!final || ocupado) return;
    setOcupado(true);
    setCopiaManual(null);
    if (await copiarTexto(final, caixa.current)) concluir("copiado");
    else setCopiaManual(final);
    setOcupado(false);
  }

  if (concluido) {
    return (
      <Folha aberta aoFechar={aoFechar} titulo="Enviar feedback" rodape={<Botao ref={botaoConcluir} onClick={aoFechar}>Concluir</Botao>}>
        <CaixaMensagem tipo="sucesso">
          {concluido === "enviado" ? "Pronto. Confira no WhatsApp ou no Notas se chegou." : "Feedback copiado. Agora cole no WhatsApp ou no Notas."}
        </CaixaMensagem>
      </Folha>
    );
  }

  return (
    <Folha
      aberta
      aoFechar={aoFechar}
      titulo="Enviar feedback"
      sujo={texto.trim() !== ""}
      aoDescartar={apagarRascunhoFeedback}
      recuperado={recuperado}
      rodape={
        compartilha ? (
          <div className="grid grid-cols-2 gap-3">
            <Botao variante="secundario" onClick={copiar} disabled={ocupado}>
              Copiar
            </Botao>
            <Botao onClick={compartilhar} disabled={ocupado}>
              Enviar
            </Botao>
          </div>
        ) : (
          <Botao onClick={copiar} disabled={ocupado}>
            Copiar
          </Botao>
        )
      }
    >
      <div ref={caixa} className="flex flex-col gap-3">
        {/* DESIGN 15.5: só em produção, acima do campo. */}
        {EH_PRODUCAO && <p className="text-[15px]">Mande para o suporte do MechaFlow pelo WhatsApp.</p>}
        <AreaTexto
          rotulo="O que aconteceu?"
          ajuda="Qual OS ou placa, o que você tentou fazer, o que aconteceu e se perdeu algo."
          erro={faltaTexto ? "Escreva o que aconteceu antes de enviar." : undefined}
          value={texto}
          onChange={(e) => aoDigitar(e.target.value)}
          maxLength={4000}
        />
        <p className="text-sm text-texto-suave">
          O app junta sozinho: tela, papel, versão, data e hora, internet e como foi aberto. Ele não junta <span className="whitespace-nowrap">e-mail</span> nem dado de cliente.
        </p>
        {!compartilha && copiaManual === null && (
          <CaixaMensagem tipo="info">Este aparelho não abre o compartilhar. Copie e cole no WhatsApp ou no Notas.</CaixaMensagem>
        )}
        {compartilharFalhou && (
          <CaixaMensagem tipo="erro">Não deu para abrir o compartilhar. Toque em Copiar e cole no WhatsApp ou no Notas.</CaixaMensagem>
        )}
        {copiaManual !== null && (
          <>
            <CaixaMensagem tipo="erro">Não deu para copiar sozinho. Toque e segure no texto abaixo para selecionar e copiar.</CaixaMensagem>
            <textarea
              ref={areaManual}
              readOnly
              aria-label="Texto para copiar"
              value={copiaManual}
              rows={6}
              className="w-full rounded-md border-2 border-borda bg-superficie-2 p-3 text-base text-texto"
            />
          </>
        )}
      </div>
    </Folha>
  );
}
