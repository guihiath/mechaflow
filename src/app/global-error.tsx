"use client";

import { useEffect } from "react";
import "./globals.css";

/**
 * Erro no layout raiz: substitui o documento inteiro (precisa de <html> e <body>).
 * Sem fontes do next/font aqui; usa a pilha de fontes do sistema.
 */
export default function ErroGlobal({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="pt-BR" data-tema="claro">
      <body className="flex min-h-full flex-col bg-fundo px-4 py-8 text-texto">
        <title>Algo deu errado | MechaFlow</title>
        <main className="mx-auto flex w-full max-w-[560px] flex-col gap-4">
          <h1 className="text-3xl font-bold">Algo deu errado</h1>
          <p className="text-lg">Não foi possível abrir o MechaFlow. Pode ser a internet. Confira e tente de novo.</p>
          <button
            type="button"
            onClick={() => retry()}
            className="inline-flex h-14 w-full items-center justify-center rounded-md border-b-[3px] border-[#14161A] bg-[#F5B800] px-4 text-lg font-bold text-[#14161A]"
          >
            Tentar de novo
          </button>
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- recarga completa de proposito: o layout raiz falhou */}
          <a href="/" className="inline-flex min-h-12 items-center text-base font-bold underline">
            Voltar ao início
          </a>
        </main>
      </body>
    </html>
  );
}
