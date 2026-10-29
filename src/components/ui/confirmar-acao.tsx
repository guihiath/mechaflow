"use client";

import { useState, useTransition } from "react";
import { Botao, type VarianteBotao } from "@/components/ui/botao";
import { BotaoEnviar, CaixaMensagem } from "@/components/ui/formulario";
import type { EstadoAcao } from "@/lib/acao";

/**
 * Acao que pede confirmacao antes (excluir, desativar, cancelar).
 * DESIGN 5.1: perigo sempre confirma, citando o nome do que sera afetado.
 */
export function ConfirmarAcao({
  acao,
  rotulo,
  pergunta,
  rotuloConfirmar,
  rotuloEnviando = "Enviando…",
  variante = "perigo",
}: {
  acao: () => Promise<EstadoAcao>;
  rotulo: string;
  pergunta: string;
  rotuloConfirmar: string;
  rotuloEnviando?: string;
  variante?: VarianteBotao;
}) {
  const [aberto, setAberto] = useState(false);
  const [erro, setErro] = useState<string>();
  const [enviando, iniciar] = useTransition();

  function confirmar() {
    if (enviando) return;
    setErro(undefined);
    iniciar(async () => {
      const r = await acao();
      if (r?.erro) setErro(r.erro);
      else setAberto(false);
    });
  }

  if (!aberto) {
    return (
      <Botao variante={variante === "perigo" ? "secundario" : variante} onClick={() => setAberto(true)}>
        {rotulo}
      </Botao>
    );
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border-2 border-erro bg-superficie p-4" role="alertdialog" aria-label={pergunta}>
      <p className="text-lg font-bold">{pergunta}</p>
      {erro && <CaixaMensagem tipo="erro">{erro}</CaixaMensagem>}
      <Botao variante="secundario" onClick={() => setAberto(false)} disabled={enviando}>
        Voltar sem mudar
      </Botao>
      <BotaoEnviar
        type="button"
        enviando={enviando}
        variante={variante}
        rotulo={rotuloConfirmar}
        rotuloEnviando={rotuloEnviando}
        onClick={confirmar}
      />
    </div>
  );
}
