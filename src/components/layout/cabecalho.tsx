import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowLeft } from "lucide-react";
import { EH_PRODUCAO } from "@/lib/brand";

/**
 * Cabecalho (DESIGN 5.7): 56px, grafite, titulo Condensed 20px a esquerda,
 * voltar 48x48 quando nao e tela raiz, no maximo 1 acao secundaria a direita.
 * Em staging: faixa listrada + "TESTE".
 */
export function Cabecalho({
  titulo,
  voltar,
  voltarSoCelular,
  acao,
}: {
  titulo: string;
  voltar?: string;
  /** Esconde o voltar no desktop (tela que e item raiz do menu lateral, ex.: Equipe). */
  voltarSoCelular?: boolean;
  acao?: ReactNode;
}) {
  return (
    <header className="sticky top-0 z-30 bg-grafite pt-[env(safe-area-inset-top)] text-[#EDEBE6]">
      {!EH_PRODUCAO && <FaixaTeste />}
      <div className="flex h-14 items-center gap-1 px-2 lg:px-6">
        {voltar ? (
          <>
            <Link
              href={voltar}
              aria-label="Voltar"
              className={`flex size-12 shrink-0 items-center justify-center rounded-md active:bg-white/10 ${voltarSoCelular ? "lg:hidden" : ""}`}
            >
              <ArrowLeft size={26} strokeWidth={2.25} aria-hidden />
            </Link>
            {voltarSoCelular && <span className="hidden w-2 lg:block" />}
          </>
        ) : (
          <span className="w-2" />
        )}
        <h1 className="min-w-0 flex-1 truncate font-display text-xl">{titulo}</h1>
        {!EH_PRODUCAO && (
          <span className="rounded-sm bg-primaria px-1.5 text-xs font-bold text-primaria-texto">TESTE</span>
        )}
        {acao}
      </div>
    </header>
  );
}

export function FaixaTeste() {
  return (
    <div
      aria-hidden
      className="h-1 w-full"
      style={{ background: "repeating-linear-gradient(135deg,#F5B800 0 10px,#14161A 10px 20px)" }}
    />
  );
}
