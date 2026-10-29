import Image from "next/image";
import type { ReactNode } from "react";
import { FaixaTeste } from "@/components/layout/cabecalho";
import { APP_NAME, EH_PRODUCAO } from "@/lib/brand";

/** Tela sem menu (login, cadastro, convite, termos). 1 coluna, max 560px. */
export function TelaSimples({ titulo, subtitulo, children }: { titulo: string; subtitulo?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex flex-1 flex-col">
      {!EH_PRODUCAO && <FaixaTeste />}
      <main className="flex flex-1 flex-col px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-[max(1.5rem,env(safe-area-inset-top))]">
        <div className="mx-auto flex w-full max-w-[560px] flex-col gap-6">
          <div className="flex items-center gap-3">
            <Image src="/icons/icon.svg" alt="" width={40} height={40} className="rounded-md" />
            <span className="font-display text-2xl">{APP_NAME}</span>
            {!EH_PRODUCAO && (
              <span className="rounded-sm bg-primaria px-1.5 text-xs font-bold text-primaria-texto">TESTE</span>
            )}
          </div>
          <div className="flex flex-col gap-1">
            <h1 className="text-3xl">{titulo}</h1>
            {subtitulo && <div className="text-lg text-texto-suave">{subtitulo}</div>}
          </div>
          {children}
        </div>
      </main>
    </div>
  );
}
