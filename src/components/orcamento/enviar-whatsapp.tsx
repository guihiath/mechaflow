"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { CircleCheckBig, Link2, MessageCircle } from "lucide-react";
import { gerarLinkOrcamento } from "@/acoes/orcamento";
import { CartaoLink, type SituacaoCartaoLink } from "@/components/orcamento/cartao-link";
import { Botao, classesBotao, classesFantasma } from "@/components/ui/botao";
import { Cartao, ChipPlaca } from "@/components/ui/estados";
import { CaixaMensagem } from "@/components/ui/formulario";
import { EH_PRODUCAO } from "@/lib/brand";
import { formatarCentavos, formatarNumeroOS, formatarPlaca } from "@/lib/formato";
import { linkWhatsApp, mensagemWhatsAppOrcamento } from "@/lib/orcamento";
import {
  apagarLinkLocal,
  assinarLinkLocal,
  gravarLinkLocal,
  interpretarLinkLocal,
  lerLinkLocalBruto,
  novoLinkLocal,
} from "@/lib/orcamento-link-local";

const nadaNoServidor = () => null;
const ALTURA_FLEXIVEL = "h-auto! min-h-toque-principal py-2";

/**
 * "Enviar por WhatsApp" no detalhe da OS (DESIGN §13.9), em dois toques, de propósito: gerar chama
 * o servidor; abrir é um `<a>` de verdade, já pronto na tela, porque o Safari do iPhone bloqueia
 * abrir o WhatsApp depois de esperar o servidor. Nada de `window.open` nem `await` antes de abrir.
 */
export function EnviarWhatsApp({
  osId,
  osNumero,
  placa,
  oficinaNome,
  clienteNome,
  telefone,
  numeroWhatsApp,
  totalCentavos,
  qtdItens,
  podeGerar,
  clienteRecusou,
  cartao,
}: {
  osId: string;
  osNumero: number;
  placa: string;
  oficinaNome: string;
  clienteNome: string;
  /** Telefone formatado do cadastro ("" = sem telefone). */
  telefone: string;
  /** 55 + DDD, normalizado no servidor; null = sem telefone ou inválido. */
  numeroWhatsApp: string | null;
  totalCentavos: number;
  qtdItens: number;
  podeGerar: boolean;
  /** O link guardado no aparelho já foi respondido: não oferecer para mandar de novo. */
  clienteRecusou: boolean;
  cartao: SituacaoCartaoLink | null;
}) {
  const bruto = useSyncExternalStore(assinarLinkLocal, () => lerLinkLocalBruto(osId), nadaNoServidor);
  const local = interpretarLinkLocal(bruto);
  const [gerando, setGerando] = useState(false);
  const [erro, setErro] = useState<string>();
  const emEnvio = useRef(false);
  const titulo = useRef<HTMLHeadingElement>(null);
  const linkPronto = local?.link && !clienteRecusou ? local.link : undefined;

  // O foco vai para o título quando o link novo chega; "Abrir de novo" não mexe nele.
  useEffect(() => {
    if (linkPronto) titulo.current?.focus();
  }, [linkPronto]);

  async function gerar() {
    if (emEnvio.current) return;
    emEnvio.current = true;
    setGerando(true);
    setErro(undefined);
    // A chave vai para o aparelho antes de chamar o servidor: resposta perdida repete a mesma.
    const { chave, criadoEm } = local && !local.link ? local : novoLinkLocal();
    gravarLinkLocal(osId, { chave, criadoEm });
    try {
      const r = await gerarLinkOrcamento(osId, chave, totalCentavos);
      if ("erro" in r) setErro(r.erro);
      else gravarLinkLocal(osId, { chave, criadoEm, link: r.link, expiraEm: r.expiraEm, versao: r.versao });
    } catch {
      setErro("Não foi possível gerar o link. Confira a internet e tente de novo.");
    }
    emEnvio.current = false;
    setGerando(false);
  }

  const destino = (
    <div className="flex flex-col gap-1">
      <p className="text-sm font-bold text-texto-suave">Vai para</p>
      <p className="text-lg font-bold">{clienteNome}</p>
      {numeroWhatsApp ? (
        <p className="font-mono text-base">{telefone}</p>
      ) : (
        <CaixaMensagem tipo={telefone ? "alerta" : "info"}>
          {telefone
            ? `O telefone ${telefone} parece incompleto. Você escolhe o contato no WhatsApp.`
            : `${clienteNome} não tem telefone. Você escolhe o contato no WhatsApp.`}
        </CaixaMensagem>
      )}
    </div>
  );

  // Passo 2: o link está na tela, e o WhatsApp abre num toque novo.
  if (local && linkPronto && local.expiraEm) {
    const mensagem = mensagemWhatsAppOrcamento({
      oficinaNome,
      osNumero,
      placa: formatarPlaca(placa),
      link: linkPronto,
      expiraEm: local.expiraEm,
      versao: local.versao ?? 1,
    });
    return (
      <Cartao faixa="bg-sucesso">
        <section aria-labelledby={`titulo-link-${osId}`} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <h2 id={`titulo-link-${osId}`} ref={titulo} tabIndex={-1} className="flex items-center gap-2 text-xl">
              <CircleCheckBig size={24} strokeWidth={2.25} aria-hidden className="shrink-0 text-sucesso-texto" />
              Link gerado
            </h2>
            <p className="text-base">Falta mandar a mensagem ao cliente.</p>
          </div>
          {destino}
          <div className="flex flex-col gap-1">
            <p className="text-sm font-bold">Mensagem</p>
            <p className="rounded-md bg-superficie-2 p-3 text-base [overflow-wrap:anywhere] whitespace-pre-line">{mensagem}</p>
          </div>
          {!EH_PRODUCAO && <p className="text-base font-bold">Ambiente de teste: confira se o número é o seu.</p>}
          {local.abriu && <p className="text-base">A mensagem saiu? Toque em Concluir.</p>}
          <a
            data-abrir-whatsapp
            href={linkWhatsApp(numeroWhatsApp, mensagem)}
            target="_blank"
            rel="noopener noreferrer"
            className={classesBotao("primario", ALTURA_FLEXIVEL)}
            onClick={() => gravarLinkLocal(osId, { ...local, abriu: true })}
          >
            <MessageCircle size={24} strokeWidth={2.25} aria-hidden className="shrink-0" />
            {local.abriu ? "Abrir WhatsApp de novo" : numeroWhatsApp ? "Abrir WhatsApp" : "Escolher contato no WhatsApp"}
          </a>
          <button type="button" onClick={() => apagarLinkLocal(osId)} className={`${classesFantasma} self-start`}>
            Concluir
          </button>
          <p className="text-sm text-texto-suave">Depois de sair daqui, este link não aparece mais.</p>
        </section>
      </Cartao>
    );
  }

  // Passo 1. Com a chave guardada e o link já ativo, a resposta se perdeu: repetir é seguro e troca o token.
  if (podeGerar || (local && cartao?.situacao === "ativo")) {
    return (
      <Cartao>
        <section aria-labelledby={`titulo-enviar-${osId}`} className="flex flex-col gap-4">
          <h2 id={`titulo-enviar-${osId}`} className="text-xl">
            Enviar por WhatsApp
          </h2>
          <div className="flex flex-col gap-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="font-mono text-base font-semibold">{formatarNumeroOS(osNumero)}</span>
              <span aria-hidden>·</span>
              <ChipPlaca placa={formatarPlaca(placa)} />
            </div>
            <p className="text-2xl">
              <span className="font-bold">Total: </span>
              <span className="font-mono font-semibold whitespace-nowrap">{formatarCentavos(totalCentavos)}</span>
            </p>
            <p className="text-base text-texto-suave">{qtdItens === 1 ? "1 item" : `${qtdItens} itens`} · Vale por 10 dias</p>
          </div>
          {destino}
          <p className="text-sm text-texto-suave">As descrições vão como estão escritas. Confira se não há anotação interna.</p>
          {erro && <CaixaMensagem tipo="erro">{erro}</CaixaMensagem>}
          <Botao className={ALTURA_FLEXIVEL} onClick={gerar} disabled={gerando} aria-busy={gerando || undefined}>
            <Link2 size={24} strokeWidth={2.25} aria-hidden className="shrink-0" />
            {gerando ? "Gerando link…" : "Gerar link"}
          </Botao>
        </section>
      </Cartao>
    );
  }

  return cartao ? <CartaoLink osNumero={osNumero} dados={cartao} /> : null;
}
