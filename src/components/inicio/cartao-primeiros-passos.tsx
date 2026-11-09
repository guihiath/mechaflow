"use client";

import Link from "next/link";
import { useId, useRef, useState } from "react";
import { ChevronRight, Circle, CircleCheckBig } from "lucide-react";
import { AvisoDesfazer } from "@/components/ui/aviso-desfazer";
import { classesFantasma } from "@/components/ui/botao";

/** Fantasma sem a cor padrão, para trocar a cor sem disputa de classes. */
const fantasmaSemCor = classesFantasma.replace(" text-texto ", " ");
import { Cartao, Etiqueta } from "@/components/ui/estados";
import { CaixaMensagem } from "@/components/ui/formulario";

/** Os 4 passos, na ordem fixa do DESIGN §15.4.1. */
export type IdPasso = "oficina" | "equipe" | "catalogo" | "primeira_os";

export const PASSOS: Record<IdPasso, { titulo: string; ajuda: string; href: string }> = {
  oficina: {
    titulo: "Dados da oficina",
    ajuda: "Confira o nome e coloque o telefone. Os dois aparecem no orçamento e no PDF.",
    href: "/configuracoes#titulo-oficina",
  },
  equipe: {
    titulo: "Convidar a equipe",
    ajuda: "Mande o convite pelo WhatsApp para os mecânicos e o balcão.",
    href: "/equipe",
  },
  catalogo: {
    titulo: "Conferir catálogo e checklist",
    ajuda: "Cadastre os serviços que você mais faz e veja os itens da vistoria.",
    href: "/catalogo",
  },
  primeira_os: {
    titulo: "Abrir a primeira OS",
    ajuda: "Comece por um caminhão que está no pátio.",
    href: "/os/nova",
  },
};

const ORDEM: IdPasso[] = ["oficina", "equipe", "catalogo", "primeira_os"];

/** Resultado do dispensar/desfazer (a Server Action do F8-B2 devolve isto). */
export type ResultadoPassos = { ok: true } | { ok: false; erro: "rede" | "servidor" };

type ErroDispensar = "rede" | "servidor";

const TEXTO_ERRO: Record<ErroDispensar, string> = {
  servidor: "Não deu para dispensar agora. Tente de novo.",
  rede: "Sem internet. Tente de novo quando a conexão voltar.",
};

export function textoContagem(feitos: number, total: number): string {
  if (total - feitos === 1) return `${feitos} de ${total} feitos. Falta só um.`;
  if (feitos <= 1) return `${feitos} de ${total} feitos. Leva uns 10 minutos.`;
  return `${feitos} de ${total} feitos.`;
}

/**
 * Cartão "Primeiros passos" do /inicio, só dono (DESIGN §15.4). Só apresentação: quem calcula
 * os passos e grava o "dispensado" é o F8-B2 (RPC primeiros_passos() e RPCs de dispensar/desfazer).
 *
 * Não desenha nada quando: `passos` é null (erro na leitura, §15.4.5), os 4 estão feitos,
 * ou `dispensado`. Dispensar some na hora (sem confirmação) e mostra "Desfazer" por 6 s;
 * se a gravação falhar, o cartão volta com a mensagem de erro.
 */
export function CartaoPrimeirosPassos({
  passos,
  dispensado,
  aoDispensar,
  aoDesfazer,
  focoAoDispensar,
  erroInicial,
}: {
  passos: { id: IdPasso; feito: boolean }[] | null;
  dispensado: boolean;
  aoDispensar: () => Promise<ResultadoPassos>;
  aoDesfazer: () => Promise<ResultadoPassos>;
  /** id do botão "Abrir OS", que recebe o foco quando o cartão some. */
  focoAoDispensar: string;
  /** Só para a vitrine: abre já com a mensagem de erro ao dispensar. */
  erroInicial?: ErroDispensar;
}) {
  const [oculto, setOculto] = useState(dispensado);
  const [aviso, setAviso] = useState(0);
  const [erro, setErro] = useState<ErroDispensar | undefined>(erroInicial);
  const refDispensar = useRef<HTMLButtonElement>(null);
  const idTitulo = useId();

  const feitos = new Map((passos ?? []).map((p) => [p.id, p.feito]));
  const total = ORDEM.length;
  const qtdFeitos = ORDEM.filter((id) => feitos.get(id)).length;
  const proximo = ORDEM.find((id) => !feitos.get(id));

  async function dispensar() {
    setErro(undefined);
    setOculto(true);
    setAviso((n) => n + 1);
    document.getElementById(focoAoDispensar)?.focus();
    let r: ResultadoPassos;
    try {
      r = await aoDispensar();
    } catch {
      r = { ok: false, erro: navigator.onLine ? "servidor" : "rede" };
    }
    if (!r.ok) {
      setAviso(0);
      setOculto(false);
      setErro(r.erro);
      requestAnimationFrame(() => refDispensar.current?.focus());
    }
  }

  async function desfazer() {
    let r: ResultadoPassos;
    try {
      r = await aoDesfazer();
    } catch {
      r = { ok: false, erro: "rede" };
    }
    setAviso(0);
    if (!r.ok) return; // continua dispensado no servidor; o cartão fica fora (o F8-B2 pode avisar)
    setOculto(false);
    requestAnimationFrame(() => refDispensar.current?.focus());
  }

  const aviso6s =
    aviso > 0 ? (
      <AvisoDesfazer
        key={aviso}
        mensagem="Primeiros passos dispensados."
        aoDesfazer={desfazer}
        aoSumir={() => setAviso(0)}
      />
    ) : null;

  if (!passos || !proximo) return null;
  if (oculto) return aviso6s;

  return (
    <section aria-labelledby={idTitulo} className="w-full max-w-[560px]">
      <Cartao faixa="bg-primaria">
        <div className="flex flex-col gap-3">
          <div>
            <h2 id={idTitulo} className="font-sans text-xl font-bold">
              Primeiros passos
            </h2>
            <p role="status" className="text-sm text-texto-suave">
              {textoContagem(qtdFeitos, total)}
            </p>
          </div>
          <ol className="-mx-2 flex flex-col gap-1 border-y border-borda-sutil py-2">
            {ORDEM.map((id) => {
              const passo = PASSOS[id];
              const feito = Boolean(feitos.get(id));
              return (
                <li key={id} className={`flex flex-col rounded-md ${id === proximo ? "bg-superficie-2" : ""}`}>
                  <Link
                    href={passo.href}
                    aria-label={`${passo.titulo}, ${feito ? "feito. Rever" : "pendente. Abrir"}.`}
                    className={`flex items-start gap-3 rounded-md px-2 py-2 active:bg-superficie-2 ${feito ? "min-h-14" : "min-h-18"}`}
                  >
                    {feito ? (
                      <CircleCheckBig size={24} strokeWidth={2.25} aria-hidden className="mt-0.5 shrink-0 text-sucesso-texto" />
                    ) : (
                      <Circle size={24} strokeWidth={2.25} aria-hidden className="mt-0.5 shrink-0 text-texto-suave" />
                    )}
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
                        <span className="text-lg font-bold">{passo.titulo}</span>
                        {feito && <Etiqueta tom="sucesso">Feito</Etiqueta>}
                      </span>
                      {!feito && <span className="text-sm text-texto-suave">{passo.ajuda}</span>}
                    </span>
                    <ChevronRight size={24} aria-hidden className="mt-0.5 shrink-0 text-texto-suave" />
                  </Link>
                  {id === "catalogo" && !feito && (
                    <Link
                      href="/configuracoes/checklist"
                      className={`${fantasmaSemCor} mt-2 mb-1 ml-11 self-start text-info-texto`}
                    >
                      Ver o checklist da vistoria
                    </Link>
                  )}
                </li>
              );
            })}
          </ol>
          {erro && <CaixaMensagem tipo="erro">{TEXTO_ERRO[erro]}</CaixaMensagem>}
          <button
            ref={refDispensar}
            type="button"
            onClick={dispensar}
            className={`${fantasmaSemCor} self-start text-texto-suave`}
          >
            Dispensar primeiros passos
          </button>
        </div>
      </Cartao>
      {aviso6s}
    </section>
  );
}
