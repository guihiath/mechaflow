"use client";

import { useEffect, useId, useRef, useState, useTransition } from "react";
import { Botao, type VarianteBotao } from "@/components/ui/botao";
import { BotaoEnviar, CaixaMensagem } from "@/components/ui/formulario";
import type { EstadoAcao } from "@/lib/acao";

/**
 * Acao que pede confirmacao antes (excluir, desativar, tornar dono).
 * DESIGN 5.1: perigo sempre confirma, citando o nome do que sera afetado.
 * Foco: vai para a caixa ao abrir (leitor de tela anuncia a pergunta) e volta ao botao ao fechar.
 */
export function ConfirmarAcao({
  acao,
  rotulo,
  pergunta,
  rotuloConfirmar,
  rotuloEnviando = "Enviando…",
  variante = "perigo",
  aoConcluir,
}: {
  acao: () => Promise<EstadoAcao>;
  rotulo: string;
  pergunta: string;
  rotuloConfirmar: string;
  rotuloEnviando?: string;
  variante?: VarianteBotao;
  aoConcluir?: () => void;
}) {
  const [aberto, setAberto] = useState(false);
  const [erro, setErro] = useState<string>();
  const [enviando, iniciar] = useTransition();
  const caixa = useRef<HTMLDivElement>(null);
  const abrir = useRef<HTMLButtonElement>(null);
  const jaAbriu = useRef(false);
  const idPergunta = useId();

  useEffect(() => {
    if (aberto) {
      jaAbriu.current = true;
      caixa.current?.scrollIntoView({ block: "center" });
      caixa.current?.focus({ preventScroll: true });
    } else if (jaAbriu.current) {
      abrir.current?.focus();
    }
  }, [aberto]);

  function confirmar() {
    if (enviando) return;
    setErro(undefined);
    iniciar(async () => {
      const r = await acao();
      if (r?.erro) setErro(r.erro);
      else {
        setAberto(false);
        aoConcluir?.();
      }
    });
  }

  if (!aberto) {
    return (
      <Botao ref={abrir} variante={variante === "perigo" ? "secundario" : variante} onClick={() => setAberto(true)}>
        {rotulo}
      </Botao>
    );
  }

  return (
    <div
      ref={caixa}
      tabIndex={-1}
      role="alertdialog"
      aria-labelledby={idPergunta}
      className="flex flex-col gap-3 rounded-lg border-2 border-erro bg-superficie p-4 outline-none focus-visible:outline-[3px] focus-visible:outline-foco"
    >
      <p id={idPergunta} className="text-lg font-bold">
        {pergunta}
      </p>
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
