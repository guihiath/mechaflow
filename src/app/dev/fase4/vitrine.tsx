"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Moon, Sun } from "lucide-react";
import { Botao } from "@/components/ui/botao";
import { Campo } from "@/components/ui/campo";
import { FaixaTeste } from "@/components/layout/cabecalho";
import { CampoAssinatura, type ResultadoAssinatura } from "@/components/vistoria/campo-assinatura";
import { PreviaAssinatura } from "@/components/vistoria/previa-assinatura";
import { temTraco, type DadosAssinatura } from "@/lib/assinatura";
import { formatarBytes, LIMITE_BYTES_ASSINATURA } from "@/lib/formato";
import { TEMA_STORAGE_KEY } from "@/lib/tema";

function Secao({ id, titulo, children }: { id: string; titulo: string; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-t`} className="flex flex-col gap-3">
      <h2 id={`${id}-t`} className="text-2xl">
        {titulo}
      </h2>
      {children}
    </section>
  );
}

function Sub({ children }: { children: ReactNode }) {
  return <h3 className="mt-2 text-lg">{children}</h3>;
}

/** Assinatura: previa + tela cheia + o que sairia para o Storage (tamanho, dimensoes). */
function DemoAssinatura() {
  const [nome, setNome] = useState("Carlos");
  const [aberta, setAberta] = useState(false);
  const [tracos, setTracos] = useState<DadosAssinatura | null>(null);
  const [usada, setUsada] = useState<{ url: string; info: Omit<ResultadoAssinatura, "blob" | "dados"> } | null>(null);
  const previa = useRef<HTMLButtonElement>(null);

  // Libera o blob: anterior ao trocar de assinatura.
  useEffect(() => {
    const url = usada?.url;
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [usada?.url]);

  return (
    <div className="flex flex-col gap-4">
      <Campo
        rotulo="Nome de quem assinou"
        value={nome}
        onChange={(e) => setNome(e.target.value)}
        placeholder="Ex.: Carlos, motorista"
        autoComplete="off"
        enterKeyHint="done"
      />
      <PreviaAssinatura ref={previa} src={usada?.url} nome={nome} aoAssinar={() => setAberta(true)} />
      {usada && (
        <p data-teste="info-assinatura" className="font-mono text-sm text-texto-suave">
          PNG {usada.info.largura}×{usada.info.altura} · {formatarBytes(usada.info.tamanhoBytes)} ({usada.info.tamanhoBytes}{" "}
          bytes; limite {formatarBytes(LIMITE_BYTES_ASSINATURA)})
        </p>
      )}
      <p data-teste="tracos-guardados" className="text-sm text-texto-suave">
        Traços guardados: {tracos?.tracos.length ?? 0}
        {temTraco(tracos) ? ` (papel ${Math.round(tracos!.largura)}×${Math.round(tracos!.altura)} px)` : ""}. Fechar
        pelo voltar não apaga.
      </p>
      <Botao variante="secundario" onClick={() => setAberta(true)} data-teste="abrir-assinatura">
        Abrir a tela cheia de novo
      </Botao>
      <Botao
        variante="secundario"
        onClick={() => {
          setTracos(null);
          setUsada(null);
        }}
      >
        Zerar a demonstração
      </Botao>

      <CampoAssinatura
        aberta={aberta}
        aoFechar={() => setAberta(false)}
        valor={tracos}
        aoMudar={setTracos}
        nome={nome}
        aoUsar={async (r) => {
          setTracos(r.dados);
          setUsada({
            url: URL.createObjectURL(r.blob),
            info: { largura: r.largura, altura: r.altura, tamanhoBytes: r.tamanhoBytes },
          });
          setAberta(false);
        }}
      />
    </div>
  );
}

export function Vitrine() {
  function trocarTema() {
    const d = document.documentElement;
    const novo = d.getAttribute("data-tema") === "escuro" ? "claro" : "escuro";
    d.setAttribute("data-tema", novo);
    try {
      localStorage.setItem(TEMA_STORAGE_KEY, novo);
    } catch {}
  }

  return (
    <div className="flex flex-1 flex-col">
      <FaixaTeste />
      <main className="mx-auto flex w-full max-w-[720px] flex-col gap-8 px-4 py-5 pb-40">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-3xl">Vitrine da Fase 4</h1>
            <p className="text-base text-texto-suave">Vistoria com dados fictícios. Só no staging.</p>
          </div>
          <button
            type="button"
            onClick={trocarTema}
            aria-label="Trocar tema claro/escuro"
            className="inline-flex min-h-toque min-w-toque items-center justify-center rounded-md border-2 border-borda bg-superficie"
          >
            <Sun size={22} aria-hidden className="hidden dark:block" />
            <Moon size={22} aria-hidden className="dark:hidden" />
          </button>
        </div>

        <Secao id="assinatura" titulo="Assinatura (F4-F1)">
          <Sub>Conferir e assinar</Sub>
          <DemoAssinatura />
        </Secao>
      </main>
    </div>
  );
}
