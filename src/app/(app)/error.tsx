"use client";

import { useEffect } from "react";
import { CircleAlert, RefreshCw } from "lucide-react";
import { Cabecalho } from "@/components/layout/cabecalho";
import { Botao } from "@/components/ui/botao";
import { Pagina } from "@/components/ui/estados";

/** Erro dentro do app logado: a barra de navegacao continua visivel (DESIGN 5.9). */
export default function ErroApp({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <>
      <Cabecalho titulo="Algo deu errado" />
      <Pagina>
        <div role="alert" className="flex flex-col gap-3 rounded-md border-l-4 border-erro bg-superficie p-4">
          <div className="flex items-start gap-3">
            <CircleAlert size={24} strokeWidth={2.25} aria-hidden className="mt-0.5 shrink-0 text-erro-texto" />
            <div>
              <p className="text-lg font-bold">Não foi possível abrir esta tela.</p>
              <p className="text-base text-texto-suave">Pode ser a internet. Confira e tente de novo.</p>
            </div>
          </div>
          <Botao variante="secundario" onClick={() => retry()}>
            <RefreshCw size={24} strokeWidth={2.25} aria-hidden />
            Tentar de novo
          </Botao>
        </div>
      </Pagina>
    </>
  );
}
