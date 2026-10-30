"use client";

import { useEffect, useRef, useState } from "react";
import { CircleCheck, CloudUpload, RotateCw, TriangleAlert, WifiOff } from "lucide-react";
import { fotos } from "@/components/os/categorias-foto";

/**
 * Situacao da fila mostrada na faixa (DESIGN §11.6 e §11.7). O pai calcula a partir da fila.
 * - enviando: foto `atual` de `total`, `progresso` 0-100 do total (barra amarela fina)
 * - retomando: fila guardada sendo enviada fora da OS ("Enviando 2 fotos guardadas (OS #1042)…")
 * - sem_internet: `guardadas` fotos esperando a rede voltar
 * - falhou: `quantidade` fotos nao enviadas (botao "Tentar de novo")
 * - concluido: `total` fotos enviadas (some sozinha em 3 s; chama `aoSumir`)
 */
export type SituacaoEnvio =
  | { tipo: "enviando"; atual: number; total: number; progresso?: number }
  | { tipo: "retomando"; quantidade: number; numeroOS: number | string; progresso?: number }
  | { tipo: "sem_internet"; guardadas: number }
  | { tipo: "falhou"; quantidade: number }
  | { tipo: "concluido"; total: number };

export function textoSituacaoEnvio(s: SituacaoEnvio): string {
  switch (s.tipo) {
    case "enviando":
      return `Enviando foto ${s.atual} de ${s.total}…`;
    case "retomando":
      return `Enviando ${fotos(s.quantidade)} ${s.quantidade === 1 ? "guardada" : "guardadas"} (OS #${s.numeroOS})…`;
    case "sem_internet":
      return `Sem internet. ${fotos(s.guardadas)} ${s.guardadas === 1 ? "guardada" : "guardadas"} no celular.`;
    case "falhou":
      return `${fotos(s.quantidade)} ${s.quantidade === 1 ? "não enviada" : "não enviadas"}.`;
    case "concluido":
      return `${fotos(s.total)} ${s.total === 1 ? "enviada" : "enviadas"}.`;
  }
}

/** Texto do aviso falado: so no comeco, no fim e na falha (nunca a cada %). */
function textoAnuncio(s: SituacaoEnvio): string {
  if (s.tipo === "enviando") return `Enviando ${fotos(s.total)}.`;
  return textoSituacaoEnvio(s);
}

/**
 * Faixa "Enviando foto 2 de 5…" (DESIGN §11.6): 48px, fundo grafite, texto 16px/700,
 * barra fina amarela com o progresso total. Fica fixa logo acima da barra de acoes /
 * navegacao (mesma posicao do `AvisoDesfazer`; se os dois aparecerem, o pai mostra so o Desfazer).
 * - Tocar no texto chama `aoTocar` (o pai rola ate a secao Fotos).
 * - `fixa={false}` mostra no fluxo da pagina (vitrine, desktop dentro do card).
 */
export function FaixaEnvioFotos({
  situacao,
  aoTentarDeNovo,
  aoTocar,
  aoSumir,
  fixa = true,
}: {
  situacao: SituacaoEnvio;
  aoTentarDeNovo?: () => void;
  aoTocar?: () => void;
  /** Chamado 3 s depois de "N fotos enviadas." */
  aoSumir?: () => void;
  fixa?: boolean;
}) {
  const texto = textoSituacaoEnvio(situacao);
  const anuncio = textoAnuncio(situacao);
  // O anuncio so muda quando muda o TIPO (ou a contagem do fim/falha); o % nao fala.
  const [falado, setFalado] = useState("");
  const ultimoTipo = useRef<string>("");
  const aoSumirRef = useRef(aoSumir);

  useEffect(() => {
    aoSumirRef.current = aoSumir;
  }, [aoSumir]);

  useEffect(() => {
    const chave = situacao.tipo === "enviando" ? "enviando" : anuncio;
    if (chave === ultimoTipo.current) return;
    ultimoTipo.current = chave;
    // Pequeno atraso: o leitor de tela pega a mudanca depois que a regiao ja existe.
    const t = setTimeout(() => setFalado(anuncio), 100);
    return () => clearTimeout(t);
  }, [situacao.tipo, anuncio]);

  useEffect(() => {
    if (situacao.tipo !== "concluido") return;
    const t = setTimeout(() => aoSumirRef.current?.(), 3000);
    return () => clearTimeout(t);
  }, [situacao.tipo]);

  const progresso =
    situacao.tipo === "enviando" || situacao.tipo === "retomando"
      ? Math.max(0, Math.min(100, Math.round(situacao.progresso ?? 0)))
      : situacao.tipo === "concluido"
        ? 100
        : null;

  const Icone =
    situacao.tipo === "sem_internet"
      ? WifiOff
      : situacao.tipo === "falhou"
        ? TriangleAlert
        : situacao.tipo === "concluido"
          ? CircleCheck
          : CloudUpload;

  const corIcone =
    situacao.tipo === "falhou" ? "text-[#FFB35C]" : situacao.tipo === "concluido" ? "text-[#5BD07A]" : "text-[#EDEBE6]";

  const conteudoTexto = (
    <>
      <Icone size={22} strokeWidth={2.25} aria-hidden className={`shrink-0 ${corIcone}`} />
      <span className="min-w-0 flex-1 py-1 text-left leading-snug">{texto}</span>
    </>
  );

  return (
    <div
      className={`${
        fixa
          ? "fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-40 lg:inset-x-auto lg:bottom-6 lg:left-[calc(15rem+2rem)] lg:min-w-96 lg:rounded-md"
          : "relative rounded-md"
      } overflow-hidden bg-grafite text-[#EDEBE6]`}
    >
      <div className="flex min-h-toque items-center gap-2 pr-1 pl-3">
        {aoTocar ? (
          <button
            type="button"
            onClick={aoTocar}
            className="flex min-h-toque min-w-0 flex-1 items-center gap-2 text-base font-bold"
            aria-label={`${texto} Ver as fotos`}
          >
            {conteudoTexto}
          </button>
        ) : (
          <p className="flex min-w-0 flex-1 items-center gap-2 text-base font-bold">{conteudoTexto}</p>
        )}
        {situacao.tipo === "falhou" && aoTentarDeNovo && (
          <button
            type="button"
            onClick={aoTentarDeNovo}
            className="inline-flex min-h-toque shrink-0 items-center gap-1.5 rounded-md border-b-[3px] border-[#0B0C0E] bg-primaria px-3 text-base font-bold text-primaria-texto active:bg-primaria-forte"
          >
            <RotateCw size={18} strokeWidth={2.5} aria-hidden />
            Tentar de novo
          </button>
        )}
      </div>
      {progresso !== null && (
        <span aria-hidden className="block h-1 w-full bg-[#3A3F47]">
          <span className="block h-full bg-primaria transition-[width]" style={{ width: `${progresso}%` }} />
        </span>
      )}
      <span role="status" aria-live="polite" className="sr-only">
        {falado}
      </span>
    </div>
  );
}
