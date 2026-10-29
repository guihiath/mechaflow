import Link from "next/link";
import type { ComponentType, ReactNode } from "react";
import { CircleAlert, Inbox } from "lucide-react";
import { classesBotao } from "@/components/ui/botao";

/** Estado vazio (DESIGN 5.8): icone, titulo, uma frase e o botao que resolve. */
export function EstadoVazio({
  titulo,
  texto,
  icone: Icone = Inbox,
  acao,
}: {
  titulo: string;
  texto?: string;
  icone?: ComponentType<{ size?: number; strokeWidth?: number; "aria-hidden"?: boolean; className?: string }>;
  acao?: { href: string; rotulo: string };
}) {
  return (
    <div className="flex flex-col items-start gap-3 rounded-lg border border-borda-sutil bg-superficie p-6">
      <Icone size={48} strokeWidth={2} aria-hidden className="text-texto-suave" />
      <h2 className="text-xl">{titulo}</h2>
      {texto && <p className="text-base text-texto-suave">{texto}</p>}
      {acao && (
        <Link href={acao.href} className={classesBotao("primario", "mt-2 sm:w-auto")}>
          {acao.rotulo}
        </Link>
      )}
    </div>
  );
}

/** Caixa de erro (DESIGN 5.9): o que aconteceu + o que fazer + "Tentar de novo". */
export function CaixaErro({
  titulo = "Não foi possível carregar.",
  texto = "Confira a internet e tente de novo.",
  tentarDeNovo,
}: {
  titulo?: string;
  texto?: string;
  /** href para recarregar (Server Component) */
  tentarDeNovo?: string;
}) {
  return (
    <div role="alert" className="flex flex-col gap-3 rounded-md border-l-4 border-erro bg-superficie p-4">
      <div className="flex items-start gap-3">
        <CircleAlert size={24} strokeWidth={2.25} aria-hidden className="mt-0.5 shrink-0 text-erro-texto" />
        <div>
          <p className="text-lg font-bold">{titulo}</p>
          <p className="text-base text-texto-suave">{texto}</p>
        </div>
      </div>
      {tentarDeNovo && (
        <a href={tentarDeNovo} className={classesBotao("secundario", "sm:w-auto")}>
          Tentar de novo
        </a>
      )}
    </div>
  );
}

/** Skeleton de lista (3 cards com faixa esquerda), pulso leve. */
export function ListaCarregando({ linhas = 3 }: { linhas?: number }) {
  return (
    <div aria-busy="true" aria-label="Carregando" className="flex flex-col gap-3">
      {Array.from({ length: linhas }, (_, i) => (
        <div
          key={i}
          className="flex h-[88px] animate-pulse overflow-hidden rounded-lg border border-borda-sutil bg-superficie"
        >
          <div className="w-1.5 bg-superficie-2" />
          <div className="flex flex-1 flex-col justify-center gap-2 p-4">
            <div className="h-6 w-28 rounded-sm bg-superficie-2" />
            <div className="h-4 w-3/4 rounded-sm bg-superficie-2" />
          </div>
        </div>
      ))}
      <span className="sr-only">Carregando…</span>
    </div>
  );
}

export function FormularioCarregando() {
  return (
    <div aria-busy="true" className="flex flex-col gap-5">
      {Array.from({ length: 4 }, (_, i) => (
        <div key={i} className="flex animate-pulse flex-col gap-2">
          <div className="h-4 w-32 rounded-sm bg-superficie-2" />
          <div className="h-[52px] rounded-md bg-superficie-2" />
        </div>
      ))}
      <span className="sr-only">Carregando…</span>
    </div>
  );
}

/** Card base (DESIGN 5.4): superficie, borda sutil, raio 8px, faixa opcional a esquerda. */
export function Cartao({
  children,
  href,
  faixa,
  className,
}: {
  children: ReactNode;
  href?: string;
  /** classe de cor da faixa esquerda, ex.: "bg-alerta" */
  faixa?: string;
  className?: string;
}) {
  const classe = `relative flex overflow-hidden rounded-lg border border-borda-sutil bg-superficie ${
    href ? "transition-colors active:bg-superficie-2" : ""
  } ${className ?? ""}`;
  const corpo = (
    <>
      {faixa && <span aria-hidden className={`w-1.5 shrink-0 ${faixa}`} />}
      <div className="min-w-0 flex-1 p-4">{children}</div>
    </>
  );
  return href ? (
    <Link href={href} className={classe}>
      {corpo}
    </Link>
  ) : (
    <div className={classe}>{corpo}</div>
  );
}

/** Chip da placa: fundo branco, borda 2px, Plex Mono, maiusculas. */
export function ChipPlaca({ placa, grande }: { placa: string; grande?: boolean }) {
  return (
    <span
      className={`inline-flex items-center rounded-sm border-2 border-[#14161A] bg-white px-2 font-mono uppercase tracking-[0.08em] text-[#14161A] ${
        grande ? "text-4xl" : "text-2xl"
      }`}
    >
      {placa}
    </span>
  );
}

/** Etiqueta pequena (nao e botao). */
export function Etiqueta({ children, tom = "neutro" }: { children: ReactNode; tom?: "neutro" | "alerta" | "sucesso" | "erro" }) {
  const cores = {
    neutro: "bg-superficie-2 text-texto",
    alerta: "bg-alerta text-white",
    sucesso: "bg-sucesso text-white",
    erro: "border-2 border-erro text-erro-texto",
  }[tom];
  return (
    <span className={`inline-flex h-8 items-center gap-1.5 rounded-sm px-2.5 text-sm font-bold ${cores}`}>{children}</span>
  );
}

/** Container de pagina: 1 coluna, margem 16px, max 560px no celular/medio; mais largo no desktop. */
export function Pagina({ children, larga }: { children: ReactNode; larga?: boolean }) {
  return (
    <div className={`flex w-full flex-col gap-6 px-4 py-5 lg:px-8 lg:py-8 ${larga ? "max-w-[1280px]" : "max-w-[720px]"}`}>
      {children}
    </div>
  );
}
