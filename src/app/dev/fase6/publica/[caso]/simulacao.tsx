"use client";

import { useRef } from "react";
import { CascaOrcamentoPublico } from "@/components/orcamento/casca-publica";
import { CarregandoOrcamento, EstadoLinkPublico } from "@/components/orcamento/estado-link-publico";
import { PaginaOrcamentoPublico } from "@/components/orcamento/pagina-orcamento-publico";
import type { DadosDocumentoOrcamento, LeituraOrcamento, PedidoRespostaCliente, ResultadoRespostaCliente, SituacaoSemAcesso } from "@/lib/orcamento";
import { DOC_30_ITENS, DOC_PADRAO, DOC_SEM_TELEFONE, DOC_UM_ITEM, DOC_VALOR_ALTO, EXPIRA_EM, RESPONDIDO_EM } from "../../dados";
import type { CasoPublico } from "./casos";

const SEM_ACESSO: SituacaoSemAcesso[] = ["vencido", "substituido", "atualizado", "encerrado", "nao_encontrado", "limite"];

function ehSemAcesso(caso: string): caso is SituacaoSemAcesso {
  return (SEM_ACESSO as string[]).includes(caso);
}

function documentoDo(caso: CasoPublico): DadosDocumentoOrcamento {
  if (caso === "aberto-1-item") return DOC_UM_ITEM;
  if (caso === "aberto-30-itens") return DOC_30_ITENS;
  if (caso === "aberto-valor-alto") return DOC_VALOR_ALTO;
  if (caso.endsWith("sem-telefone")) return DOC_SEM_TELEFONE;
  return DOC_PADRAO;
}

function leituraDo(caso: CasoPublico): LeituraOrcamento {
  if (ehSemAcesso(caso)) return { situacao: caso };
  const documento = documentoDo(caso);
  if (caso.startsWith("aprovado")) {
    return { situacao: "aprovado", expira_em: EXPIRA_EM, documento, resposta: { tipo: "aprovou", nome: "Carlos Souza", respondido_em: RESPONDIDO_EM } };
  }
  if (caso.startsWith("recusado")) {
    return { situacao: "recusado", expira_em: EXPIRA_EM, documento, resposta: { tipo: "recusou", nome: null, respondido_em: RESPONDIDO_EM } };
  }
  return { situacao: "aberto", expira_em: EXPIRA_EM, documento, resposta: null };
}

const esperar = (ms: number) => new Promise((resolver) => setTimeout(resolver, ms));

/** Faz o papel de `responder_orcamento`, sem rede. */
async function simularResposta(caso: CasoPublico, tentativa: number, pedido: PedidoRespostaCliente): Promise<ResultadoRespostaCliente> {
  const primeira = tentativa === 1;
  const gravada = {
    situacao: pedido.aprovou ? ("aprovado" as const) : ("recusado" as const),
    resposta: { tipo: pedido.aprovou ? ("aprovou" as const) : ("recusou" as const), nome: pedido.nome, respondido_em: new Date().toISOString() },
  };
  await esperar(caso === "resposta-lenta" ? 5_000 : 500);
  if (caso === "resposta-sem-retorno") await new Promise(() => {});
  if (caso === "resposta-falha-rede" && primeira) throw new TypeError("Failed to fetch");
  if (caso === "resposta-erro-servidor" && primeira) return { falha: "servidor" };
  if (caso === "resposta-repetida") {
    if (primeira) throw new TypeError("Failed to fetch");
    return { ...gravada, aplicada: false };
  }
  if (caso === "resposta-outra") {
    const outra = pedido.aprovou;
    return {
      situacao: outra ? "recusado" : "aprovado",
      aplicada: false,
      resposta: { tipo: outra ? "recusou" : "aprovou", nome: outra ? null : "Marina Lopes", respondido_em: RESPONDIDO_EM },
    };
  }
  if (caso === "resposta-deixou-de-valer") return { situacao: "vencido" };
  return { ...gravada, aplicada: true };
}

export function SimulacaoPublica({ caso }: { caso: CasoPublico }) {
  const tentativas = useRef(0);
  const responder = (pedido: PedidoRespostaCliente) => {
    tentativas.current += 1;
    return simularResposta(caso, tentativas.current, pedido);
  };
  return (
    <CascaOrcamentoPublico>
      {caso === "carregando" ? (
        <CarregandoOrcamento />
      ) : caso === "erro-abrir" ? (
        <EstadoLinkPublico motivo="erro_abrir" />
      ) : (
        <PaginaOrcamentoPublico leitura={leituraDo(caso)} responder={responder} />
      )}
    </CascaOrcamentoPublico>
  );
}
