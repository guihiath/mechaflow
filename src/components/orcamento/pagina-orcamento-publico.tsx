"use client";

import { useEffect, useRef, useState } from "react";
import { ID_SUA_RESPOSTA } from "@/components/orcamento/atalho-resposta";
import { DocumentoOrcamento } from "@/components/orcamento/documento-orcamento";
import { EstadoLinkPublico } from "@/components/orcamento/estado-link-publico";
import { BotoesResposta, ConfirmarResposta, type FalhaEnvio } from "@/components/orcamento/resposta-orcamento";
import { ResultadoOrcamento } from "@/components/orcamento/resultado-orcamento";
import {
  MOTIVO_MAX,
  NOME_MAX,
  NOME_MIN,
  type LeituraOrcamento,
  type PedidoRespostaCliente,
  type ResultadoRespostaCliente,
  type TipoResposta,
} from "@/lib/orcamento";

const CHAVE_HISTORICO = "mfOrcamentoPasso";
/** Toque duplo não atravessa: os botões do passo ignoram toques nestes primeiros ms (§13.3). */
const PROTECAO_TOQUE_MS = 500;
const AVISO_LENTO_MS = 3_000;
const ESPERA_MAXIMA_MS = 20_000;

const ERRO_NOME = "Escreva seu nome para aprovar.";

/**
 * Página pública: decide qual tela mostrar e guarda o digitado (DESIGN §13.2 a §13.6).
 * Sem Supabase: `responder` vem de fora (F6-B3: `responder_orcamento`, pelo navegador).
 * Repetir é seguro (a RPC é idempotente), então a falha oferece "Tentar de novo".
 */
export function PaginaOrcamentoPublico({
  leitura,
  responder,
}: {
  leitura: LeituraOrcamento;
  responder: (pedido: PedidoRespostaCliente) => Promise<ResultadoRespostaCliente>;
}) {
  const [dados, setDados] = useState(leitura);
  const [passo, setPasso] = useState<TipoResposta | null>(null);
  const [nome, setNome] = useState("");
  const [motivo, setMotivo] = useState("");
  const [erroNome, setErroNome] = useState<string>();
  const [erroMotivo, setErroMotivo] = useState<string>();
  const [enviando, setEnviando] = useState(false);
  const [lento, setLento] = useState(false);
  const [falha, setFalha] = useState<FalhaEnvio | null>(null);
  const [jaRespondido, setJaRespondido] = useState(false);

  const refNome = useRef<HTMLInputElement>(null);
  const liberadoEm = useRef(0);
  const emEnvio = useRef(false);
  const rolagemAntes = useRef(0);
  const telaAnterior = useRef<string | null>(null);

  const tela = passo ? `confirmar-${passo}` : dados.situacao;

  // Cada troca de tela: volta ao topo e o foco vai para o título. Na volta ao documento,
  // restaura onde a pessoa estava, com o foco em "Sua resposta".
  useEffect(() => {
    const anterior = telaAnterior.current;
    telaAnterior.current = tela;
    if (anterior === null || anterior === tela) return;
    if (tela === "aberto") {
      window.scrollTo(0, rolagemAntes.current);
      document.getElementById(ID_SUA_RESPOSTA)?.focus({ preventScroll: true });
      return;
    }
    window.scrollTo(0, 0);
    document.querySelector<HTMLElement>("[data-titulo-orcamento]")?.focus({ preventScroll: true });
  }, [tela]);

  // Voltar do Android: sai do passo sem perder o digitado. Enviando, fica onde está.
  const aberto = dados.situacao === "aberto";
  useEffect(() => {
    if (!aberto) return;
    const aoVoltar = () => {
      const noHistorico: TipoResposta | undefined = window.history.state?.[CHAVE_HISTORICO];
      if (emEnvio.current) {
        if (!noHistorico) window.history.forward();
        return;
      }
      if (noHistorico) liberadoEm.current = Date.now() + PROTECAO_TOQUE_MS;
      setPasso(noHistorico ?? null);
    };
    window.addEventListener("popstate", aoVoltar);
    return () => window.removeEventListener("popstate", aoVoltar);
  }, [aberto]);

  function abrirPasso(tipo: TipoResposta) {
    rolagemAntes.current = window.scrollY;
    liberadoEm.current = Date.now() + PROTECAO_TOQUE_MS;
    window.history.pushState({ ...window.history.state, [CHAVE_HISTORICO]: tipo }, "");
    setFalha(null);
    setPasso(tipo);
  }

  function dentroDaProtecao() {
    return Date.now() < liberadoEm.current;
  }

  function voltar() {
    if (dentroDaProtecao() || emEnvio.current) return;
    if (window.history.state?.[CHAVE_HISTORICO]) window.history.back();
    else setPasso(null);
  }

  async function enviar() {
    if (dentroDaProtecao() || emEnvio.current || !passo) return;
    const aprovar = passo === "aprovou";
    const nomeLimpo = nome.trim();
    const motivoLimpo = motivo.trim();
    if (aprovar && nomeLimpo.length < NOME_MIN) {
      setErroNome(ERRO_NOME);
      refNome.current?.focus();
      return;
    }
    setErroNome(undefined);
    setErroMotivo(undefined);
    setFalha(null);
    setEnviando(true);
    emEnvio.current = true;
    const avisoLento = setTimeout(() => setLento(true), AVISO_LENTO_MS);
    let estouro: ReturnType<typeof setTimeout> | undefined;

    let r: ResultadoRespostaCliente | { falha: "rede" };
    try {
      r = await Promise.race([
        responder({ aprovou: aprovar, nome: aprovar ? nomeLimpo : null, motivo: aprovar ? null : motivoLimpo || null }),
        new Promise<{ falha: "rede" }>((resolver) => {
          estouro = setTimeout(() => resolver({ falha: "rede" }), ESPERA_MAXIMA_MS);
        }),
      ]);
    } catch {
      // Não usa navigator.onLine (§13.4): quem decide é o resultado do pedido.
      r = { falha: "rede" };
    }
    clearTimeout(avisoLento);
    clearTimeout(estouro);
    emEnvio.current = false;
    setEnviando(false);
    setLento(false);

    if ("falha" in r) {
      setFalha(r.falha);
      return;
    }
    if (r.situacao === "aberto") {
      if (r.erro === "nome_obrigatorio" && aprovar) {
        setErroNome(ERRO_NOME);
      } else if (r.erro === "nome_grande_demais" && aprovar) {
        setErroNome(`O nome pode ter até ${NOME_MAX} letras.`);
      } else if (r.erro === "motivo_grande_demais" && !aprovar) {
        setErroMotivo(`O motivo pode ter até ${MOTIVO_MAX} letras.`);
      } else {
        setFalha("servidor");
      }
      return;
    }
    if (r.situacao === "aprovado" || r.situacao === "recusado") {
      if ("documento" in dados) {
        const { documento, expira_em } = dados;
        setDados({ situacao: r.situacao, documento, expira_em, resposta: r.resposta });
      }
      setJaRespondido(!r.aplicada && r.resposta.tipo !== passo);
      setPasso(null);
      return;
    }
    // O link deixou de valer com a página aberta: o documento some e o digitado é descartado.
    setDados({ situacao: r.situacao });
    setNome("");
    setMotivo("");
    setPasso(null);
  }

  if (!("documento" in dados)) return <EstadoLinkPublico motivo={dados.situacao} />;

  if (dados.situacao !== "aberto" && dados.resposta) {
    return <ResultadoOrcamento documento={dados.documento} expiraEm={dados.expira_em} resposta={dados.resposta} jaRespondido={jaRespondido} />;
  }

  if (passo) {
    return (
      <ConfirmarResposta
        key={passo}
        tipo={passo}
        documento={dados.documento}
        nome={nome}
        aoMudarNome={(v) => {
          setNome(v);
          if (erroNome) setErroNome(undefined);
        }}
        erroNome={erroNome}
        motivo={motivo}
        aoMudarMotivo={(v) => {
          setMotivo(v);
          if (erroMotivo) setErroMotivo(undefined);
        }}
        erroMotivo={erroMotivo}
        enviando={enviando}
        lento={lento}
        falha={falha}
        aoVoltar={voltar}
        aoEnviar={enviar}
        refNome={refNome}
      />
    );
  }

  return <DocumentoOrcamento documento={dados.documento} expiraEm={dados.expira_em} resposta={<BotoesResposta aoEscolher={abrirPasso} />} />;
}
