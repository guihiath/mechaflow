"use client";

import { useState } from "react";
import { Camera, Check, CircleAlert, Clock, ImageOff, Loader, RotateCw, WifiOff } from "lucide-react";
import { Botao } from "@/components/ui/botao";
import { formatarDiaHoraFoto, rotuloCategoriaFoto, type CategoriaFoto } from "@/components/os/categorias-foto";

/**
 * Estado de uma foto na grade (DESIGN §11.6):
 * - enviada: ja no servidor (faixa com o tipo)
 * - confirmada: acabou de enviar (Check verde no canto; o pai volta para "enviada" apos 2 s)
 * - preparando / na_fila / sem_internet / enviando: ainda no aparelho, guardada
 * - falhou: 3 tentativas automaticas sem sucesso -> "Tentar de novo"
 * - nao_enviavel: erro que tentar de novo nao resolve -> "Ver" (abre a tela cheia com o motivo)
 * - sem_imagem: a miniatura nao carregou (URL vencida/rede) -> "Toque para carregar"
 */
export type EstadoFoto =
  | "enviada"
  | "confirmada"
  | "preparando"
  | "na_fila"
  | "sem_internet"
  | "enviando"
  | "falhou"
  | "nao_enviavel"
  | "sem_imagem";

export type DadosMiniaturaFoto = {
  id: string;
  /** URL da miniatura (assinada) ou do arquivo local (blob:) para as da fila. */
  src?: string | null;
  categoria: CategoriaFoto;
  legenda?: string | null;
  enviadoPor?: string | null;
  /** ISO em UTC. */
  enviadoEm?: string | null;
  estado: EstadoFoto;
  /** 0 a 100, so em "enviando". */
  progresso?: number;
};

const ESTADOS_FILA: EstadoFoto[] = ["preparando", "na_fila", "sem_internet", "enviando", "falhou", "nao_enviavel"];

export function fotoNaFila(estado: EstadoFoto) {
  return ESTADOS_FILA.includes(estado);
}

/** Texto alternativo da miniatura (DESIGN §11.5). */
export function altFoto(f: DadosMiniaturaFoto): string {
  const tipo = rotuloCategoriaFoto(f.categoria);
  switch (f.estado) {
    case "preparando":
      return `${tipo}, preparando`;
    case "na_fila":
      return `${tipo}, na fila para enviar`;
    case "sem_internet":
      return `${tipo}, guardada no celular, sem internet`;
    case "enviando":
      return `${tipo}, enviando ${Math.round(f.progresso ?? 0)} %`;
    case "falhou":
      return `${tipo}, não foi enviada`;
    case "nao_enviavel":
      return `${tipo}, não dá para enviar`;
    default: {
      const legenda = f.legenda?.trim() || "sem legenda";
      const quem = f.enviadoPor ? `, enviada por ${f.enviadoPor}` : "";
      const quando = formatarDiaHoraFoto(f.enviadoEm);
      return `${tipo}, ${legenda}${quem}${quando ? ` em ${quando}` : ""}`;
    }
  }
}

const FAIXA = "absolute inset-x-0 bottom-0 flex items-center gap-1 bg-[#14161A]/80 px-1.5 text-xs font-bold text-white";

/**
 * Miniatura quadrada (DESIGN §11.5 e §11.6). A miniatura inteira e um botao que abre a tela
 * cheia; "Tentar de novo" e "Ver" sao botoes separados na faixa de baixo (48px).
 * Mesmo componente para foto enviada e para item da fila de envio.
 */
export function MiniaturaFoto({
  foto,
  aoAbrir,
  aoTentarDeNovo,
  aoRecarregar,
}: {
  foto: DadosMiniaturaFoto;
  aoAbrir?: () => void;
  aoTentarDeNovo?: () => void;
  /** Pede URL nova para a miniatura que nao carregou. */
  aoRecarregar?: () => void;
}) {
  const [falhouImagem, setFalhouImagem] = useState(false);
  const { estado } = foto;
  const semImagem = estado === "sem_imagem" || falhouImagem || !foto.src;
  const tipo = rotuloCategoriaFoto(foto.categoria);
  const comErro = estado === "falhou" || estado === "nao_enviavel";
  const pct = Math.max(0, Math.min(100, Math.round(foto.progresso ?? 0)));
  const alt = altFoto(foto);

  const recarregar = semImagem && aoRecarregar && !fotoNaFila(estado);

  return (
    <div className="relative aspect-square overflow-hidden rounded-md bg-superficie-2">
      <button
        type="button"
        onClick={() => {
          if (recarregar) {
            setFalhouImagem(false);
            aoRecarregar();
          } else aoAbrir?.();
        }}
        aria-label={semImagem ? (recarregar ? `${alt}. Toque para carregar` : alt) : undefined}
        className="absolute inset-0 flex h-full w-full items-center justify-center focus-visible:outline-offset-[-3px]"
      >
        {semImagem ? (
          <span className="flex flex-col items-center gap-1 px-1 pb-7 text-center text-xs font-bold text-texto-suave">
            <ImageOff size={28} strokeWidth={2} aria-hidden />
            {recarregar ? "Toque para carregar" : null}
          </span>
        ) : (
          // URL assinada do Storage (ou blob: local): sem otimizador do Next.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={foto.src ?? undefined}
            alt={alt}
            loading="lazy"
            decoding="async"
            draggable={false}
            onError={() => setFalhouImagem(true)}
            className="h-full w-full object-cover"
          />
        )}
      </button>

      {comErro && <span aria-hidden className="pointer-events-none absolute inset-0 rounded-md border-[3px] border-erro" />}

      {estado === "confirmada" && (
        <span className="pointer-events-none absolute top-1.5 right-1.5 flex size-7 items-center justify-center rounded-full bg-sucesso text-white ring-2 ring-white">
          <Check size={18} strokeWidth={3} aria-hidden />
        </span>
      )}

      {(estado === "enviada" || estado === "confirmada" || estado === "sem_imagem") && (
        <span aria-hidden className={`${FAIXA} pointer-events-none h-7`}>
          <span className="truncate">{tipo}</span>
        </span>
      )}

      {estado === "preparando" && (
        <span aria-hidden className={`${FAIXA} pointer-events-none h-7`}>
          <Loader size={16} strokeWidth={2.5} className="shrink-0 animate-spin motion-reduce:animate-none" />
          Preparando
        </span>
      )}

      {estado === "na_fila" && (
        <span aria-hidden className={`${FAIXA} pointer-events-none h-7`}>
          <Clock size={16} strokeWidth={2.5} className="shrink-0" />
          Na fila
        </span>
      )}

      {estado === "sem_internet" && (
        <span aria-hidden className={`${FAIXA} pointer-events-none h-7`}>
          <WifiOff size={16} strokeWidth={2.5} className="shrink-0" />
          <span className="truncate">Sem internet</span>
        </span>
      )}

      {estado === "enviando" && (
        <span className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-col bg-[#14161A]/80">
          <span aria-hidden className="flex h-7 items-center px-1.5 text-xs font-bold whitespace-nowrap text-white">
            Enviando {pct} %
          </span>
          <span
            role="progressbar"
            aria-label={`Enviando foto (${tipo})`}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={pct}
            className="block h-1.5 w-full bg-superficie-2"
          >
            <span className="block h-full bg-primaria transition-[width]" style={{ width: `${pct}%` }} />
          </span>
        </span>
      )}

      {comErro && (
        <span className="pointer-events-none absolute top-1.5 left-1.5 inline-flex items-center gap-1 rounded-sm bg-erro px-1.5 py-0.5 text-xs font-bold text-white">
          <CircleAlert size={14} strokeWidth={2.5} aria-hidden />
          {estado === "falhou" ? "Falhou" : "Não enviada"}
        </span>
      )}

      {estado === "falhou" && (
        <button
          type="button"
          onClick={aoTentarDeNovo}
          aria-label={`Tentar enviar de novo a foto (${tipo})`}
          className="absolute inset-x-0 bottom-0 flex h-toque items-center justify-center gap-1 bg-grafite px-1 text-xs font-bold text-primaria focus-visible:outline-offset-[-3px] focus-visible:outline-primaria"
        >
          <RotateCw size={16} strokeWidth={2.5} aria-hidden className="shrink-0" />
          Tentar de novo
        </button>
      )}

      {estado === "nao_enviavel" && (
        <button
          type="button"
          onClick={aoAbrir}
          aria-label={`Ver por que a foto (${tipo}) não foi enviada`}
          className="absolute inset-x-0 bottom-0 flex h-toque items-center justify-center bg-grafite px-1 text-sm font-bold text-primaria underline underline-offset-4 focus-visible:outline-offset-[-3px] focus-visible:outline-primaria"
        >
          Ver
        </button>
      )}
    </div>
  );
}

/**
 * Grade de miniaturas da secao "Fotos" (DESIGN §11.5): 3 colunas no celular (gap 8px),
 * auto-fill de 140px no desktop. Ordem: o pai manda as da fila primeiro, depois as enviadas
 * da mais nova para a mais antiga. Mais de 12: mostra 12 + "Ver todas as fotos (N)".
 */
export function GradeFotos({
  fotos,
  carregando = false,
  erro = false,
  aoTentarCarregar,
  vazio = "balcao",
  aoAbrir,
  aoTentarDeNovo,
  aoRecarregar,
  maxInicial = 12,
}: {
  fotos: DadosMiniaturaFoto[];
  carregando?: boolean;
  /** A lista nao carregou: caixa compacta com "Tentar de novo". */
  erro?: boolean;
  aoTentarCarregar?: () => void;
  /** Texto do vazio: mecanico ganha a dica do que fotografar. */
  vazio?: "mecanico" | "balcao";
  aoAbrir?: (id: string) => void;
  aoTentarDeNovo?: (id: string) => void;
  aoRecarregar?: (id: string) => void;
  maxInicial?: number;
}) {
  const [todas, setTodas] = useState(false);

  if (carregando) {
    return (
      <div aria-busy="true" className="grid grid-cols-3 gap-2 lg:grid-cols-[repeat(auto-fill,minmax(140px,1fr))]">
        {Array.from({ length: 3 }, (_, i) => (
          <div key={i} className="aspect-square animate-pulse rounded-md bg-superficie-2" />
        ))}
        <span className="sr-only">Carregando fotos…</span>
      </div>
    );
  }

  if (erro) {
    return (
      <div role="alert" className="flex flex-col gap-3 rounded-md border-l-4 border-erro bg-superficie p-3">
        <p className="flex items-start gap-2 text-base font-bold">
          <CircleAlert size={22} strokeWidth={2.25} aria-hidden className="mt-0.5 shrink-0 text-erro-texto" />
          Não foi possível carregar as fotos.
        </p>
        {aoTentarCarregar && (
          <Botao variante="secundario" onClick={aoTentarCarregar} className="sm:w-auto">
            Tentar de novo
          </Botao>
        )}
      </div>
    );
  }

  if (fotos.length === 0) {
    return (
      <div className="flex flex-col items-start gap-2 rounded-lg border border-borda-sutil bg-superficie p-4">
        <Camera size={32} strokeWidth={2} aria-hidden className="text-texto-suave" />
        {vazio === "mecanico" ? (
          <>
            <p className="text-lg font-bold">Nenhuma foto ainda.</p>
            <p className="text-base text-texto-suave">
              Tire foto da peça com defeito e da peça trocada. Ajuda a explicar o serviço ao cliente.
            </p>
          </>
        ) : (
          <p className="text-lg font-bold">Nenhuma foto nesta OS.</p>
        )}
      </div>
    );
  }

  const visiveis = todas ? fotos : fotos.slice(0, maxInicial);
  const sobra = fotos.length > maxInicial && !todas;

  return (
    <div className="flex flex-col gap-3">
      <ul className="grid grid-cols-3 gap-2 lg:grid-cols-[repeat(auto-fill,minmax(140px,1fr))]">
        {visiveis.map((f) => (
          <li key={f.id}>
            <MiniaturaFoto
              foto={f}
              aoAbrir={aoAbrir ? () => aoAbrir(f.id) : undefined}
              aoTentarDeNovo={aoTentarDeNovo ? () => aoTentarDeNovo(f.id) : undefined}
              aoRecarregar={aoRecarregar ? () => aoRecarregar(f.id) : undefined}
            />
          </li>
        ))}
      </ul>
      {sobra && (
        <Botao variante="secundario" onClick={() => setTodas(true)}>
          Ver todas as fotos ({fotos.length})
        </Botao>
      )}
    </div>
  );
}
