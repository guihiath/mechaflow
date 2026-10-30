"use client";

import { useState } from "react";
import { ImageOff, Loader } from "lucide-react";
import { Botao } from "@/components/ui/botao";
import { Campo } from "@/components/ui/campo";
import { CaixaMensagem } from "@/components/ui/formulario";
import { Folha } from "@/components/ui/folha";
import { EscolhaCategoriaFoto } from "@/components/os/escolha-categoria-foto";
import { fotos as nFotos } from "@/components/os/categorias-foto";
import type { CategoriaFoto } from "@/lib/formato";
import type { ItemFila } from "@/lib/fotos/fila";

/**
 * Folha "Do que é esta foto?" (DESIGN §11.4): miniatura(s) + legenda opcional + grade de
 * tipos. **Tocar no tipo já envia** (o pai chama `definirTipo`). Fechar sem escolher pergunta
 * "Descartar?" com a 3ª opção "Enviar como Outro" (nada se perde por engano).
 * Monte com `key` do lote para zerar a legenda a cada abertura.
 */
export function FolhaTipoFoto({
  aberta,
  itens,
  cortadas = 0,
  ajudaLegenda,
  aoEscolher,
  aoDescartar,
}: {
  aberta: boolean;
  /** Itens da fila deste lote (sem tipo ainda). */
  itens: ItemFila[];
  /** Fotos que ficaram de fora pelo limite de 40. */
  cortadas?: number;
  ajudaLegenda?: string;
  aoEscolher: (categoria: CategoriaFoto, legenda: string) => void;
  aoDescartar: () => void;
}) {
  const [legenda, setLegenda] = useState("");
  const [pergunta, setPergunta] = useState<null | "descartar" | "fechar">(null);
  const n = itens.length;
  const uma = n === 1;

  return (
    <Folha
      aberta={aberta}
      aoFechar={() => setPergunta("fechar")}
      aoPedirFechar={() => setPergunta((p) => p ?? "fechar")}
      titulo={uma ? "Do que é esta foto?" : "Do que são estas fotos?"}
      rodape={
        pergunta ? (
          <div role="group" aria-label="Descartar" className="flex flex-col gap-3">
            <div>
              <p className="text-lg font-bold">{uma ? "Descartar esta foto?" : `Descartar as ${n} fotos?`}</p>
              <p className="text-base text-texto-suave">{uma ? "Ela não foi enviada." : "Elas não foram enviadas."}</p>
            </div>
            <Botao variante="secundario" onClick={() => setPergunta(null)}>
              Voltar
            </Botao>
            {pergunta === "fechar" && (
              <Botao variante="secundario" onClick={() => aoEscolher("outro", legenda)}>
                Enviar como Outro
              </Botao>
            )}
            <Botao variante="perigo" onClick={aoDescartar}>
              Descartar
            </Botao>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setPergunta("descartar")}
            className="inline-flex min-h-toque items-center justify-center text-base font-bold text-texto-suave underline underline-offset-4"
          >
            {uma ? "Descartar foto" : `Descartar as ${n}`}
          </button>
        )
      }
    >
      <div className="flex flex-col gap-4" data-teste="folha-tipo-foto">
        {cortadas > 0 && (
          <CaixaMensagem tipo="alerta">
            Só cabem mais {nFotos(n)} nesta OS. {uma ? "Vai a primeira" : `Vão as ${n} primeiras`}; {cortadas === 1 ? "a outra ficou" : `as outras ${cortadas} ficaram`} de
            fora.
          </CaixaMensagem>
        )}
        {uma ? (
          <div className="flex items-center gap-3">
            <Previa item={itens[0]} tamanho="size-24" />
            <p className="text-base font-bold text-texto-suave">Foto 1 de 1</p>
          </div>
        ) : (
          <div className="flex flex-col gap-1">
            <ul className="flex gap-2 overflow-x-auto pb-1" aria-label={nFotos(n)}>
              {itens.map((i) => (
                <li key={i.id} className="shrink-0">
                  <Previa item={i} tamanho="size-16" />
                </li>
              ))}
            </ul>
            <p className="text-base font-bold text-texto-suave">{nFotos(n)}</p>
          </div>
        )}
        <Campo
          rotulo="Legenda"
          opcional
          name="legenda-foto"
          value={legenda}
          maxLength={120}
          onChange={(e) => setLegenda(e.target.value)}
          placeholder="Ex.: chicote rompido perto do sensor"
          ajuda={ajudaLegenda}
          autoComplete="off"
          enterKeyHint="done"
        />
        <EscolhaCategoriaFoto aoEscolher={(c) => aoEscolher(c, legenda)} desabilitado={Boolean(pergunta)} />
      </div>
    </Folha>
  );
}

function Previa({ item, tamanho }: { item?: ItemFila; tamanho: string }) {
  if (item?.previa) {
    // eslint-disable-next-line @next/next/no-img-element -- prévia local (blob:)
    return <img src={item.previa} alt="" className={`${tamanho} shrink-0 rounded-md object-cover`} />;
  }
  const falhou = item?.estado === "nao_enviavel";
  return (
    <span className={`${tamanho} flex shrink-0 items-center justify-center rounded-md border-2 border-borda bg-superficie-2 text-texto-suave`}>
      {falhou ? (
        <ImageOff size={24} strokeWidth={2} aria-label="Não abriu" />
      ) : (
        <Loader size={24} strokeWidth={2} className="animate-spin motion-reduce:animate-none" aria-label="Preparando" />
      )}
    </span>
  );
}
