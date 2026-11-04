"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { CircleCheckBig, Copy, Eye, Link2, MessageCircle, RefreshCw } from "lucide-react";
import { gerarLinkOrcamento, reenviarLinkOrcamento } from "@/acoes/orcamento";
import { AcaoBalcao } from "@/components/orcamento/acao-balcao";
import { PreviaOrcamento } from "@/components/orcamento/previa-orcamento";
import { BarraAcoesOS } from "@/components/os/barra-acoes-os";
import { Botao, classesBotao, classesFantasma } from "@/components/ui/botao";
import { Campo } from "@/components/ui/campo";
import { Cartao, ChipPlaca } from "@/components/ui/estados";
import { CaixaMensagem } from "@/components/ui/formulario";
import { acrescentarTexto, SugestoesTexto } from "@/components/ui/sugestoes-texto";
import { EH_PRODUCAO } from "@/lib/brand";
import { formatarCentavos, formatarNumeroOS, formatarPlaca } from "@/lib/formato";
import {
  linkWhatsApp,
  mensagemWhatsAppOrcamento,
  SUGESTOES_CONDICOES,
  SUGESTOES_PRAZO,
  TEXTO_ORCAMENTO_MAX,
  type DadosDocumentoOrcamento,
} from "@/lib/orcamento";
import { apagarLinkLocal, assinarLinkLocal, gravarLinkLocal, interpretarLinkLocal, lerLinkLocalBruto, novoLinkLocal, type AcaoLink } from "@/lib/orcamento-link-local";

const nadaNoServidor = () => null;

export type DadosTelaEnviar = {
  osId: string;
  osNumero: number;
  placa: string;
  oficinaNome: string;
  clienteId: string | null;
  clienteNome: string;
  /** Telefone formatado do cadastro ("" = sem telefone). */
  telefone: string;
  /** 55 + DDD, normalizado no servidor; null = sem telefone ou inválido. */
  numeroWhatsApp: string | null;
  totalCentavos: number;
  qtdItens: number;
  /** `enviar`: ainda não há versão vigente. `reenviar`: a versão existe, só falta um link novo. */
  modo: AcaoLink;
  /** O link da versão vigente está valendo. */
  linkAtivo: boolean;
  /** Versão vigente, se houver. */
  versao: number | null;
  /** Só no modo `enviar`: o documento como está agora, para "Ver como o cliente vê". */
  documento: DadosDocumentoOrcamento | null;
  expiraPrevia: string | null;
  prazoInicial: string;
  condicoesIniciais: string;
  /** Só para o dono, no primeiro envio: o cliente ficaria sem como falar com a oficina. */
  oficinaSemTelefone: boolean;
  abrirPrevia: boolean;
};

/**
 * Tela de envio (DESIGN §13.9), em dois toques, de propósito: gerar chama o servidor; abrir é um
 * `<a>` de verdade, já pronto na tela, porque o Safari do iPhone bloqueia abrir o WhatsApp depois
 * de esperar o servidor. Nada de `window.open` nem `await` antes de abrir.
 *
 * O link fica só no aparelho (memória e `sessionStorage`, 15 min), para sobreviver à ida e volta
 * do WhatsApp. A chave vai junto: resposta perdida repete com a mesma, e o banco devolve um token
 * novo sem criar versão nem segundo link ativo.
 */
export function TelaEnviarOrcamento({ dados }: { dados: DadosTelaEnviar }) {
  const { osId, osNumero, placa, oficinaNome, totalCentavos, qtdItens, modo, linkAtivo, versao, documento, expiraPrevia } = dados;
  const router = useRouter();
  const bruto = useSyncExternalStore(assinarLinkLocal, () => lerLinkLocalBruto(osId), nadaNoServidor);
  const local = interpretarLinkLocal(bruto);

  const [prazo, setPrazo] = useState(dados.prazoInicial);
  const [condicoes, setCondicoes] = useState(dados.condicoesIniciais);
  const [outroContato, setOutroContato] = useState(false);
  const [previa, setPrevia] = useState(dados.abrirPrevia && modo === "enviar" && documento !== null);
  const [gerando, setGerando] = useState(false);
  const [gerouAgora, setGerouAgora] = useState(false);
  const [erro, setErro] = useState<string>();
  const [copia, setCopia] = useState<"ok" | "falhou" | null>(null);
  const emEnvio = useRef(false);
  const titulo = useRef<HTMLHeadingElement>(null);
  const campoLink = useRef<HTMLInputElement>(null);

  // Link guardado só vale enquanto o banco disser que ele é o da versão vigente: cliente respondeu,
  // alguém cancelou ou alterou, e o que está no aparelho já não serve para mandar a ninguém.
  const linkPronto = local?.link && local.expiraEm && (gerouAgora || (linkAtivo && local.versao === versao)) ? local.link : undefined;

  // O foco vai para o título quando o link novo chega; "Abrir de novo" não mexe nele.
  useEffect(() => {
    if (linkPronto) titulo.current?.focus();
  }, [linkPronto]);

  useEffect(() => {
    if (copia === "falhou") campoLink.current?.select();
  }, [copia]);

  async function gerar() {
    if (emEnvio.current) return;
    emEnvio.current = true;
    setGerando(true);
    setErro(undefined);
    // Pedido sem resposta guardado: repete com a mesma chave, se ainda fizer sentido para o que o
    // banco diz agora. A chave vai para o aparelho antes de chamar o servidor.
    const repetir =
      local && !local.link && ((local.acao === "enviar" && (modo === "enviar" || linkAtivo)) || (local.acao === "reenviar" && modo === "reenviar"));
    const pedido = repetir ? local : novoLinkLocal(modo);
    gravarLinkLocal(osId, pedido);
    try {
      const r =
        pedido.acao === "reenviar"
          ? await reenviarLinkOrcamento(osId, pedido.chave)
          : await gerarLinkOrcamento(osId, pedido.chave, totalCentavos, prazo, condicoes);
      if ("erro" in r) setErro(r.erro);
      else {
        gravarLinkLocal(osId, { ...pedido, link: r.link, expiraEm: r.expiraEm, versao: r.versao });
        setGerouAgora(true);
        setCopia(null);
      }
    } catch {
      setErro(
        modo === "reenviar"
          ? "Não foi possível reenviar o link. Confira a internet e tente de novo."
          : "Não foi possível gerar o link. Nada foi perdido: confira a internet e tente de novo.",
      );
    }
    emEnvio.current = false;
    setGerando(false);
  }

  function concluir() {
    apagarLinkLocal(osId);
    router.push(`/os/${osId}`);
  }

  async function copiar(link: string) {
    try {
      await navigator.clipboard.writeText(link);
      setCopia("ok");
    } catch {
      setCopia("falhou");
    }
  }

  const numero = outroContato ? null : dados.numeroWhatsApp;

  const destino = (comAcoes: boolean) => (
    <div className="flex flex-col gap-1">
      <p className="text-sm font-bold text-texto-suave">Vai para</p>
      {outroContato ? (
        <>
          <p className="text-lg font-bold">Você escolhe no WhatsApp</p>
          <button type="button" onClick={() => setOutroContato(false)} className={`${classesFantasma} self-start`}>
            Usar o telefone do cliente
          </button>
        </>
      ) : (
        <>
          <p className="text-lg font-bold break-words">{dados.clienteNome}</p>
          {dados.numeroWhatsApp ? (
            <>
              <p className="font-mono text-base">{dados.telefone}</p>
              <button type="button" onClick={() => setOutroContato(true)} className={`${classesFantasma} self-start`}>
                Enviar para outro contato
              </button>
            </>
          ) : (
            <>
              <CaixaMensagem tipo={dados.telefone ? "alerta" : "info"}>
                {dados.telefone
                  ? `O telefone ${dados.telefone} parece incompleto. Você escolhe o contato no WhatsApp.`
                  : `${dados.clienteNome} não tem telefone. Você escolhe o contato no WhatsApp.`}
              </CaixaMensagem>
              {comAcoes && dados.clienteId && (
                <Link href={`/clientes/${dados.clienteId}`} className={`${classesFantasma} self-start`}>
                  {dados.telefone ? "Corrigir telefone" : "Cadastrar telefone"}
                </Link>
              )}
            </>
          )}
        </>
      )}
    </div>
  );

  const resumo: ReactNode = (
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
      <p className="text-base text-texto-suave">
        {qtdItens === 1 ? "1 item" : `${qtdItens} itens`} · Vale por 10 dias
      </p>
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
      reenvio: local.acao === "reenviar",
    });
    return (
      <>
        <Cartao faixa="bg-sucesso">
          <div className="flex flex-col gap-1">
            <h2 ref={titulo} tabIndex={-1} className="flex items-center gap-2 text-xl">
              <CircleCheckBig size={24} strokeWidth={2.25} aria-hidden className="shrink-0 text-sucesso-texto" />
              Link gerado
            </h2>
            <p className="text-base">Falta mandar a mensagem ao cliente.</p>
          </div>
        </Cartao>
        {destino(false)}
        <div className="flex flex-col gap-1">
          <p className="text-sm font-bold">Mensagem</p>
          <p className="rounded-md bg-superficie-2 p-3 text-base [overflow-wrap:anywhere] whitespace-pre-line">{mensagem}</p>
        </div>
        <div className="flex flex-col gap-2">
          <Botao variante="secundario" className="h-toque!" onClick={() => copiar(linkPronto)}>
            <Copy size={20} strokeWidth={2.25} aria-hidden />
            Copiar link
          </Botao>
          {copia === "ok" && (
            <p role="status" className="text-base font-bold">
              Link copiado.
            </p>
          )}
          {copia === "falhou" && (
            <>
              <input
                ref={campoLink}
                readOnly
                value={linkPronto}
                aria-label="Link do orçamento"
                onFocus={(e) => e.currentTarget.select()}
                className="h-toque w-full rounded-md border-2 border-borda bg-superficie px-3 font-mono text-sm text-texto"
              />
              <p role="status" className="text-base font-bold">
                Copie o link acima.
              </p>
            </>
          )}
          <p className="text-sm text-texto-suave">Depois de sair daqui, este link não aparece mais. Para mandar de novo, use Reenviar.</p>
        </div>
        <div className="flex flex-col gap-1">
          <button type="button" onClick={concluir} className={`${classesFantasma} self-start`}>
            Concluir
          </button>
          {/* Link gerado e mandado à pessoa errada: o reflexo é trocar, sem esperar os 15 min. */}
          <button type="button" onClick={() => apagarLinkLocal(osId)} className={`${classesFantasma} self-start`}>
            Trocar por um link novo
          </button>
        </div>
        <BarraAcoesOS
          acima={
            !EH_PRODUCAO || local.abriu ? (
              <div className="flex flex-col gap-1">
                {!EH_PRODUCAO && <p className="text-sm font-bold">Ambiente de teste: confira se o número é o seu.</p>}
                {local.abriu && <p className="text-base">A mensagem saiu? Toque em Concluir.</p>}
              </div>
            ) : undefined
          }
          primario={
            <a
              data-abrir-whatsapp
              href={linkWhatsApp(numero, mensagem)}
              target="_blank"
              rel="noopener noreferrer"
              className={classesBotao("primario")}
              onClick={() => gravarLinkLocal(osId, { ...local, abriu: true })}
            >
              <MessageCircle size={24} strokeWidth={2.25} aria-hidden className="shrink-0" />
              {local.abriu ? "Abrir WhatsApp de novo" : numero ? "Abrir WhatsApp" : "Escolher contato no WhatsApp"}
            </a>
          }
        />
      </>
    );
  }

  const barraGerar = (rotulo: string, rotuloEnviando: string, Icone: typeof Link2) => (
    <BarraAcoesOS
      acima={erro ? <CaixaMensagem tipo="erro">{erro}</CaixaMensagem> : undefined}
      primario={
        <Botao onClick={gerar} disabled={gerando} aria-busy={gerando || undefined}>
          <Icone size={24} strokeWidth={2.25} aria-hidden className="shrink-0" />
          {gerando ? rotuloEnviando : rotulo}
        </Botao>
      }
    />
  );

  // Reenviar: sem campos, a versão é a mesma.
  if (modo === "reenviar") {
    return (
      <>
        <h2 className="text-2xl">Reenviar link</h2>
        {resumo}
        <CaixaMensagem tipo="alerta">O link anterior para de funcionar assim que você gerar o novo. A validade recomeça: 10 dias a partir de hoje.</CaixaMensagem>
        {destino(true)}
        {versao !== null && <AcaoBalcao gatilho={`/os/${osId}/orcamento/${versao}`}>Ver como o cliente vê</AcaoBalcao>}
        {barraGerar("Gerar link novo", "Gerando link…", RefreshCw)}
      </>
    );
  }

  // Passo 1: conferir e gerar.
  const comPrazo = prazo.trim() || null;
  const comCondicoes = condicoes.trim() || null;
  return (
    <>
      {resumo}
      {destino(true)}
      {dados.oficinaSemTelefone && (
        <div className="flex flex-col gap-1">
          <CaixaMensagem tipo="info">A oficina está sem telefone. O cliente não vai ver como falar com você nem o botão de avisar pelo WhatsApp.</CaixaMensagem>
          <Link href="/configuracoes" className={`${classesFantasma} self-start`}>
            Cadastrar telefone
          </Link>
        </div>
      )}
      <div className="flex flex-col gap-2">
        <SugestoesTexto
          rotulo="Prazos prontos"
          sugestoes={SUGESTOES_PRAZO}
          aoEscolher={(s) => setPrazo((v) => acrescentarTexto(v, s).slice(0, TEXTO_ORCAMENTO_MAX))}
        />
        <Campo rotulo="Prazo estimado" opcional value={prazo} onChange={(e) => setPrazo(e.target.value)} maxLength={TEXTO_ORCAMENTO_MAX} autoComplete="off" enterKeyHint="next" />
      </div>
      <div className="flex flex-col gap-2">
        <SugestoesTexto
          rotulo="Condições prontas"
          sugestoes={SUGESTOES_CONDICOES}
          aoEscolher={(s) => setCondicoes((v) => acrescentarTexto(v, s).slice(0, TEXTO_ORCAMENTO_MAX))}
        />
        <Campo
          rotulo="Condições de pagamento"
          opcional
          value={condicoes}
          onChange={(e) => setCondicoes(e.target.value)}
          maxLength={TEXTO_ORCAMENTO_MAX}
          autoComplete="off"
          enterKeyHint="done"
        />
        <p className="text-sm text-texto-suave">O cliente vê estes textos.</p>
      </div>
      {documento && expiraPrevia && (
        <>
          <Botao variante="secundario" className="h-toque!" onClick={() => setPrevia(true)}>
            <Eye size={20} strokeWidth={2.25} aria-hidden />
            Ver como o cliente vê
          </Botao>
          <PreviaOrcamento
            aberta={previa}
            aoFechar={() => setPrevia(false)}
            documento={{ ...documento, prazo_estimado: comPrazo, condicoes_pagamento: comCondicoes }}
            expiraEm={expiraPrevia}
          />
        </>
      )}
      {barraGerar("Gerar link", "Gerando link…", Link2)}
    </>
  );
}
