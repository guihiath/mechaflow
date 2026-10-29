"use client";

import { useRef, useState, type FormEvent } from "react";
import { AceiteTermos, ERRO_TERMOS } from "@/components/auth/aceite-termos";
import { irParaDestino } from "@/components/auth/navegar";
import { BotaoEnviar, CaixaMensagem } from "@/components/ui/formulario";
import { traduzirErro } from "@/lib/erros";
import { TERMOS_VERSAO } from "@/lib/termos";
import { createClient } from "@/lib/supabase/client";

export function FormAceitarTermos() {
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string>();
  const [erroTermos, setErroTermos] = useState<string>();
  const travado = useRef(false);

  async function aoEnviar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (travado.current) return;
    if (new FormData(e.currentTarget).get("termos") !== "sim") {
      setErroTermos(ERRO_TERMOS);
      return;
    }
    setErroTermos(undefined);
    setErro(undefined);
    travado.current = true;
    setEnviando(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.rpc("aceitar_termos", {
        p_versao_termos: TERMOS_VERSAO,
        p_autoriza_uso_anonimizado: true,
      });
      if (error) throw error;
      await irParaDestino(supabase);
    } catch (err) {
      setErro(traduzirErro(err as { message?: string }));
      travado.current = false;
      setEnviando(false);
    }
  }

  return (
    <form onSubmit={aoEnviar} noValidate className="flex flex-col gap-5">
      <AceiteTermos erro={erroTermos} />
      {erro && <CaixaMensagem tipo="erro">{erro}</CaixaMensagem>}
      <BotaoEnviar enviando={enviando} rotulo="Aceitar e continuar" rotuloEnviando="Enviando…" />
    </form>
  );
}
