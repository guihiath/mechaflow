"use client";

import { useEffect } from "react";
import { RefreshCw } from "lucide-react";
import { TelaSimples } from "@/components/layout/tela-simples";
import { Botao, BotaoLink } from "@/components/ui/botao";
import { CaixaMensagem } from "@/components/ui/formulario";

/** Erro nas telas sem menu (login, cadastro, convite...). */
export default function Erro({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <TelaSimples titulo="Algo deu errado">
      <CaixaMensagem tipo="erro">Não foi possível abrir esta tela. Pode ser a internet. Confira e tente de novo.</CaixaMensagem>
      <div className="flex flex-col gap-3">
        <BotaoLink href="/" variante="secundario">
          Voltar ao início
        </BotaoLink>
        <Botao onClick={() => retry()}>
          <RefreshCw size={24} strokeWidth={2.25} aria-hidden />
          Tentar de novo
        </Botao>
      </div>
    </TelaSimples>
  );
}
