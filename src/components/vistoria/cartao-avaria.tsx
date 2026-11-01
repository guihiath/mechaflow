"use client";

import { useState } from "react";
import { ChevronRight, CircleAlert, Clock, ImageOff, Loader, RotateCw, Truck, WifiOff, type LucideIcon } from "lucide-react";
import { Escolha } from "@/components/ui/escolha";
import { Campo } from "@/components/ui/campo";
import { SugestoesTexto } from "@/components/ui/sugestoes-texto";
import type { EstadoFoto } from "@/components/os/grade-fotos";
import { fotos as textoFotos } from "@/components/os/categorias-foto";
import { EtiquetaSemFoto } from "@/components/vistoria/etiquetas-vistoria";
import { LADOS_AVARIA, ROTULO_LADO_AVARIA, type LadoAvaria } from "@/lib/formato";

/** Foto de uma avaria (enviada ou ainda na fila do aparelho; estados do §11.6). */
export type FotoAvaria = {
  id: string;
  /** Miniatura (URL assinada) ou arquivo local (blob:). */
  src?: string | null;
  estado: EstadoFoto;
  /** 0-100, so em "enviando". */
  progresso?: number;
};

export type DadosAvaria = {
  id: string;
  lado: LadoAvaria;
  descricao?: string | null;
  fotos: FotoAvaria[];
};

/** Chips do "O que é?" (DESIGN §12.6): preenchem a descricao. */
export const SUGESTOES_AVARIA = ["Risco", "Amassado", "Trincado", "Quebrado", "Faltando peça", "Ferrugem"] as const;
/** Descricao da avaria na tela: ate 120 caracteres (o banco aceita 300). */
export const LIMITE_DESCRICAO_AVARIA = 120;

const ESTADO_FILA: Partial<Record<EstadoFoto, { texto: string; icone: LucideIcon; cor: string }>> = {
  preparando: { texto: "Preparando", icone: Loader, cor: "text-texto-suave" },
  na_fila: { texto: "Na fila", icone: Clock, cor: "text-texto-suave" },
  sem_internet: { texto: "Sem internet: guardada no celular", icone: WifiOff, cor: "text-alerta-texto" },
  enviando: { texto: "Enviando", icone: Loader, cor: "text-info-texto" },
  falhou: { texto: "Não foi enviada", icone: CircleAlert, cor: "text-erro-texto" },
  nao_enviavel: { texto: "Não dá para enviar", icone: CircleAlert, cor: "text-erro-texto" },
};

/** Estado "pior" das fotos da avaria (o que a pessoa precisa ver primeiro). */
function estadoDaAvaria(fotos: FotoAvaria[]): FotoAvaria | null {
  const ordem: EstadoFoto[] = ["falhou", "nao_enviavel", "sem_internet", "enviando", "preparando", "na_fila"];
  for (const e of ordem) {
    const f = fotos.find((x) => x.estado === e);
    if (f) return f;
  }
  return null;
}

/**
 * Cartao da avaria (DESIGN §12.6): miniatura 72 px + lado (18 px) + descricao (2 linhas) +
 * "2 fotos" + estado da fila. O cartao inteiro e botao (>= 88 px) que abre "Editar avaria"; na
 * leitura (vistoria concluida) abre a foto em tela cheia, sem chevron de editar.
 * "Tentar de novo" fica FORA do botao do cartao (botao dentro de botao nao vale).
 */
export function CartaoAvaria({
  avaria,
  aoAbrir,
  aoTentarDeNovo,
  leitura = false,
}: {
  avaria: DadosAvaria;
  aoAbrir?: () => void;
  aoTentarDeNovo?: () => void;
  leitura?: boolean;
}) {
  const [falhouImagem, setFalhouImagem] = useState<string | null>(null);
  const lado = ROTULO_LADO_AVARIA[avaria.lado];
  const descricao = avaria.descricao?.trim();
  const primeira = avaria.fotos[0];
  const qtd = avaria.fotos.length;
  const fila = estadoDaAvaria(avaria.fotos);
  const infoFila = fila ? ESTADO_FILA[fila.estado] : undefined;
  const pct = fila?.estado === "enviando" ? Math.max(0, Math.min(100, Math.round(fila.progresso ?? 0))) : null;
  const semImagem = !primeira?.src || falhouImagem === primeira.id;
  const IconeFila = infoFila?.icone;

  const textoFila = infoFila ? `${infoFila.texto}${pct !== null ? ` ${pct}%` : ""}` : "";
  const nome = [lado, descricao, qtd ? textoFotos(qtd) : "sem foto", textoFila].filter(Boolean).join(", ");

  const corpo = (
    <>
      <span className="relative flex size-[72px] shrink-0 items-center justify-center overflow-hidden rounded-md bg-superficie-2">
        {semImagem ? (
          <ImageOff size={28} strokeWidth={2} aria-hidden className="text-texto-suave" />
        ) : (
          // URL assinada ou blob: local: sem otimizador do Next.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={primeira.src ?? undefined}
            alt=""
            draggable={false}
            onError={() => setFalhouImagem(primeira.id)}
            className="h-full w-full object-cover"
          />
        )}
        {IconeFila && (
          <span className="absolute inset-x-0 bottom-0 flex h-6 items-center justify-center bg-[#14161A]/80 text-white">
            <IconeFila size={16} strokeWidth={2.5} aria-hidden />
          </span>
        )}
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5 text-left">
        <span className="text-lg leading-snug font-bold break-words">{lado}</span>
        {descricao && <span className="line-clamp-2 text-base break-words">{descricao}</span>}
        <span className="text-xs text-texto-suave">{qtd ? textoFotos(qtd) : null}</span>
        {qtd === 0 && (
          <span className="mt-0.5">
            <EtiquetaSemFoto />
          </span>
        )}
        {infoFila && (
          <span className={`flex items-center gap-1 text-xs font-bold ${infoFila.cor}`}>
            {textoFila}
            {pct !== null && (
              <span aria-hidden className="ml-1 h-1.5 w-16 overflow-hidden rounded-full bg-superficie-2">
                <span className="block h-full bg-info" style={{ width: `${pct}%` }} />
              </span>
            )}
          </span>
        )}
      </span>
      {!leitura && <ChevronRight size={24} strokeWidth={2.25} aria-hidden className="shrink-0 self-center text-texto-suave" />}
    </>
  );

  const classeCartao =
    "flex min-h-[88px] w-full items-start gap-3 rounded-lg border border-borda-sutil bg-superficie p-3 text-texto transition-colors";

  return (
    <div className="flex flex-col gap-0">
      {aoAbrir ? (
        <button
          type="button"
          onClick={aoAbrir}
          aria-label={leitura ? `${nome}. Ver foto` : `${nome}. Editar avaria`}
          className={`${classeCartao} active:bg-superficie-2`}
        >
          {corpo}
        </button>
      ) : (
        <div className={classeCartao} aria-label={nome} role="group">
          {corpo}
        </div>
      )}
      {fila && fila.estado === "falhou" && aoTentarDeNovo && (
        <button
          type="button"
          onClick={aoTentarDeNovo}
          className="-mt-px inline-flex min-h-toque items-center justify-center gap-1.5 rounded-b-lg border border-t-0 border-borda-sutil bg-superficie text-base font-bold text-erro-texto underline underline-offset-4"
        >
          <RotateCw size={18} strokeWidth={2.5} aria-hidden />
          Tentar de novo
        </button>
      )}
    </div>
  );
}

/** Titulo + lista de avarias, com o estado vazio (DESIGN §12.6). */
export function ListaAvarias({
  avarias,
  aoAbrir,
  aoTentarDeNovo,
  leitura = false,
}: {
  avarias: DadosAvaria[];
  aoAbrir?: (avaria: DadosAvaria) => void;
  aoTentarDeNovo?: (avaria: DadosAvaria) => void;
  leitura?: boolean;
}) {
  return (
    <section aria-label={`Avarias (${avarias.length})`} className="flex flex-col gap-3">
      <h2 className="text-xl">Avarias ({avarias.length})</h2>
      {avarias.length === 0 ? (
        <div className="flex flex-col items-start gap-2 rounded-lg border border-borda-sutil bg-superficie p-4">
          <Truck size={32} strokeWidth={2} aria-hidden className="text-texto-suave" />
          <p className="text-lg font-bold">Nenhuma avaria registrada.</p>
          {!leitura && (
            <p className="text-base text-texto-suave">Se o caminhão não tem nenhum dano, toque em Sem avarias, próximo.</p>
          )}
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {avarias.map((a) => (
            <li key={a.id}>
              <CartaoAvaria
                avaria={a}
                leitura={leitura}
                aoAbrir={aoAbrir ? () => aoAbrir(a) : undefined}
                aoTentarDeNovo={aoTentarDeNovo ? () => aoTentarDeNovo(a) : undefined}
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/**
 * Campos da folha "Nova avaria" / "Editar avaria" (DESIGN §12.6), sem a foto (a foto vem da
 * fila no F4-B2): "De que lado?" (2 colunas, 56 px, sem pre-marcacao), chips "O que é?" que
 * preenchem a descricao e o campo "Descrição" (ate 120). Controlado pelo pai.
 */
export function CamposAvaria({
  lado,
  aoMudarLado,
  descricao,
  aoMudarDescricao,
  erroLado,
  erroDescricao,
}: {
  lado: LadoAvaria | null;
  aoMudarLado: (lado: LadoAvaria) => void;
  descricao: string;
  aoMudarDescricao: (texto: string) => void;
  erroLado?: string;
  erroDescricao?: string;
}) {
  return (
    <div className="flex flex-col gap-5">
      <div className="[&_label]:min-h-toque-principal">
        <Escolha
          rotulo="De que lado?"
          name="lado_avaria"
          colunas={2}
          opcoes={LADOS_AVARIA.map((l) => ({ valor: l, rotulo: ROTULO_LADO_AVARIA[l] }))}
          valor={lado}
          aoMudar={aoMudarLado}
          ajuda="Esquerda = lado do motorista."
          erro={erroLado}
        />
      </div>
      <div className="flex flex-col gap-2">
        <p className="text-sm font-bold">O que é?</p>
        <SugestoesTexto
          sugestoes={SUGESTOES_AVARIA}
          rotulo="O que é?"
          aoEscolher={(s) => {
            // Chip preenche (nao acrescenta): "Risco" + texto livre depois, se quiser.
            const atual = descricao.trim();
            const ehChip = !atual || (SUGESTOES_AVARIA as readonly string[]).includes(atual);
            aoMudarDescricao((ehChip ? s : `${s}: ${atual}`).slice(0, LIMITE_DESCRICAO_AVARIA));
          }}
        />
      </div>
      <Campo
        rotulo="Descrição"
        value={descricao}
        onChange={(e) => aoMudarDescricao(e.target.value)}
        maxLength={LIMITE_DESCRICAO_AVARIA}
        placeholder="Ex.: risco na porta, 20 cm"
        enterKeyHint="done"
        autoComplete="off"
        erro={erroDescricao}
      />
    </div>
  );
}
