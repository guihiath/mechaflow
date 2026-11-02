"use client";

import { useId, type ReactNode } from "react";
import { Ban, ImageOff } from "lucide-react";
import { Cartao } from "@/components/ui/estados";
import { CaixaMensagem } from "@/components/ui/formulario";
import {
  EtiquetaAcrescentado,
  EtiquetaSemAssinatura,
  EtiquetaVistoria,
} from "@/components/vistoria/etiquetas-vistoria";
import { formatarDiaHora, formatarMotivoAnulacao, formatarNumeroOS, type MotivoSemAssinatura } from "@/lib/formato";

export type AssinaturaLeitura =
  | { tipo: "assinada"; src: string | null; nome: string; em?: string | null }
  | { tipo: "sem"; motivo: MotivoSemAssinatura; nome?: string | null };

export type FotoComplemento = { id: string; src?: string | null; alt?: string };

export type DadosComplemento = {
  id: string;
  texto?: string | null;
  fotos: FotoComplemento[];
  /** ISO em UTC. */
  criadoEm: string;
  criadoPor: string;
};

/**
 * Assinatura na leitura (DESIGN §12.12 item 3): caixa BRANCA nos dois temas, 100 % x 120 px,
 * borda sutil; abaixo "Assinada por Carlos em 31/10 às 08:39". Sem assinatura: etiqueta + nome.
 */
export function AssinaturaVistoria({ assinatura }: { assinatura: AssinaturaLeitura }) {
  if (assinatura.tipo === "sem") {
    return (
      <div className="flex flex-col items-start gap-1.5">
        <EtiquetaSemAssinatura motivo={assinatura.motivo} />
        {assinatura.nome?.trim() && (
          <p className="text-sm text-texto-suave">
            {assinatura.motivo === "recusou" ? "Quem recusou" : "Responsável"}: {assinatura.nome.trim()}
          </p>
        )}
      </div>
    );
  }
  const quando = formatarDiaHora(assinatura.em);
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex h-[120px] w-full items-center justify-center overflow-hidden rounded-lg border border-borda-sutil bg-white p-2">
        {assinatura.src ? (
          // URL assinada do Storage: sem otimizador do Next.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={assinatura.src}
            alt={`Assinatura de ${assinatura.nome}`}
            className="max-h-full max-w-full object-contain"
            draggable={false}
          />
        ) : (
          <span className="flex flex-col items-center gap-1 text-sm font-bold text-[#4A4F57]">
            <ImageOff size={24} strokeWidth={2} aria-hidden />
            Não foi possível carregar a assinatura.
          </span>
        )}
      </div>
      <p className="text-sm text-texto-suave">
        Assinada por {assinatura.nome}
        {quando ? ` em ${quando}` : ""}
      </p>
    </div>
  );
}

/**
 * Topo da vistoria concluida (DESIGN §12.12 itens 2 e 3) + o conteudo (entrada, checklist,
 * avarias... vem em `children`) + complementos. Anulada: caixa de erro no topo (§12.13), logo depois
 * o que dá para fazer (`aposAnulada`) e a faixa "Vistoria anulada" de novo acima da assinatura: rolada
 * para baixo, a página não pode parecer uma vistoria válida.
 */
export function BlocoVistoriaConcluida({
  numeroOS,
  concluidaEm,
  concluidaPor,
  assinatura,
  complementos,
  anulada,
  children,
  aoAbrirFotoComplemento,
  aposAnulada,
}: {
  numeroOS: number | string;
  /** Vazio/null: a vistoria foi anulada ainda em rascunho (nunca concluída). */
  concluidaEm: string | null;
  concluidaPor: string;
  /** null: nada registrado (anulada em rascunho, sem assinatura). */
  assinatura: AssinaturaLeitura | null;
  complementos: DadosComplemento[];
  anulada?: { em: string; por: string; motivo: string } | null;
  children?: ReactNode;
  aoAbrirFotoComplemento?: (complemento: DadosComplemento, indiceFoto: number) => void;
  /** Só na anulada: aviso e "Fazer nova vistoria", logo depois da caixa de erro. */
  aposAnulada?: ReactNode;
}) {
  const id = useId();
  return (
    <div className="flex flex-col gap-6">
      {anulada && (
        <CaixaMensagem tipo="erro">
          Vistoria anulada em {formatarDiaHora(anulada.em)} por {anulada.por}. Motivo: {formatarMotivoAnulacao(anulada.motivo)}
        </CaixaMensagem>
      )}
      {anulada && aposAnulada}
      <div className="flex flex-col items-start gap-1.5">
        <EtiquetaVistoria estado={anulada ? "anulada" : "concluida"} />
        <p className="text-base">Vistoria de entrada da {formatarNumeroOS(numeroOS)}</p>
        <p className="text-sm text-texto-suave">
          {concluidaEm ? `Concluída em ${formatarDiaHora(concluidaEm)} por ${concluidaPor}` : "Não chegou a ser concluída."}
        </p>
      </div>

      <section aria-labelledby={`${id}-assinatura`} className="flex flex-col gap-2">
        {anulada && (
          <p className="flex min-h-toque items-center gap-2 rounded-md border-2 border-erro px-3 text-base font-bold text-erro-texto" data-teste="faixa-anulada">
            <Ban size={20} strokeWidth={2.25} aria-hidden className="shrink-0" />
            Vistoria anulada
          </p>
        )}
        <h2 id={`${id}-assinatura`} className="text-xl">
          Assinatura
        </h2>
        {assinatura ? <AssinaturaVistoria assinatura={assinatura} /> : <p className="text-base text-texto-suave">Nenhuma assinatura registrada.</p>}
      </section>

      {children}

      <ComplementosVistoria complementos={complementos} aoAbrirFoto={aoAbrirFotoComplemento} />
    </div>
  );
}

/**
 * "Acrescentado depois (2)" (DESIGN §12.12 item 5): do mais antigo ao mais novo, cada um num
 * `Cartao` com faixa info, etiqueta, texto, miniaturas e "31/10 às 10:12 · João".
 * Sem editar nem apagar. Nenhum complemento: nada.
 */
export function ComplementosVistoria({
  complementos,
  aoAbrirFoto,
}: {
  complementos: DadosComplemento[];
  aoAbrirFoto?: (complemento: DadosComplemento, indiceFoto: number) => void;
}) {
  const id = useId();
  if (!complementos.length) return null;
  const ordenados = [...complementos].sort((a, b) => a.criadoEm.localeCompare(b.criadoEm));
  return (
    <section aria-labelledby={`${id}-complementos`} className="flex flex-col gap-3">
      <h2 id={`${id}-complementos`} className="text-xl">
        Acrescentado depois ({complementos.length})
      </h2>
      <ul className="flex flex-col gap-3">
        {ordenados.map((c) => (
          <li key={c.id}>
            <Cartao faixa="bg-info">
              <div className="flex flex-col items-start gap-2">
                <EtiquetaAcrescentado />
                {c.texto?.trim() && <p className="text-base break-words whitespace-pre-line">{c.texto.trim()}</p>}
                {c.fotos.length > 0 && (
                  <div className="grid w-full grid-cols-4 gap-2">
                    {c.fotos.map((f, i) => (
                      <button
                        key={f.id}
                        type="button"
                        onClick={() => aoAbrirFoto?.(c, i)}
                        disabled={!aoAbrirFoto}
                        aria-label={f.alt ?? `Foto ${i + 1} do complemento. Ver foto`}
                        className="relative flex aspect-square items-center justify-center overflow-hidden rounded-md bg-superficie-2"
                      >
                        {f.src ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={f.src} alt="" className="h-full w-full object-cover" draggable={false} />
                        ) : (
                          <ImageOff size={24} strokeWidth={2} aria-hidden className="text-texto-suave" />
                        )}
                      </button>
                    ))}
                  </div>
                )}
                <p className="text-sm text-texto-suave">
                  {formatarDiaHora(c.criadoEm)} · {c.criadoPor}
                </p>
              </div>
            </Cartao>
          </li>
        ))}
      </ul>
    </section>
  );
}
