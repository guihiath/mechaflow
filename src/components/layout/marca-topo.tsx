import Image from "next/image";
import Link from "next/link";
import { APP_NAME, EH_PRODUCAO } from "@/lib/brand";

/**
 * Bloco de marca das telas sem menu (DESIGN §15.2.2): ícone 40 px + nome em Condensed 24 px
 * + selo TESTE fora de produção. Com `link`, o bloco inteiro leva a "/" (termos e privacidade).
 * `teste` só existe para a vitrine simular a produção.
 */
export function MarcaTopo({ link, teste = !EH_PRODUCAO }: { link?: boolean; teste?: boolean }) {
  const conteudo = (
    <>
      <Image src="/icons/icon.svg" alt="" width={40} height={40} className="rounded-md" />
      <span className="font-display text-2xl">{APP_NAME}</span>
    </>
  );
  return (
    <div className="flex flex-wrap items-center gap-3">
      {link ? (
        <Link
          href="/"
          aria-label={`${APP_NAME}, página inicial`}
          className="-ml-1 inline-flex min-h-toque items-center gap-3 rounded-md px-1 text-texto"
        >
          {conteudo}
        </Link>
      ) : (
        conteudo
      )}
      {teste && <span className="rounded-sm bg-primaria px-1.5 text-xs font-bold text-primaria-texto">TESTE</span>}
    </div>
  );
}
