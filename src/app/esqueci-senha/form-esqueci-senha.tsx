"use client";

import { useRef, useState, type FormEvent } from "react";
import { MailCheck } from "lucide-react";
import { Campo } from "@/components/ui/campo";
import { BotaoEnviar, CaixaMensagem, focarPrimeiroErro } from "@/components/ui/formulario";
import { validarEmail } from "@/components/auth/navegar";
import { traduzirErro } from "@/lib/erros";
import { createClient } from "@/lib/supabase/client";

/**
 * Pede o link de redefinicao (supabase.auth.resetPasswordForEmail).
 * Resposta sempre neutra: nao revela se o e-mail tem conta.
 * Depende do envio de e-mail do Supabase (SMTP gratis = poucos e-mails por hora).
 */
export function FormEsqueciSenha() {
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string>();
  const [erroEmail, setErroEmail] = useState<string>();
  const [enviado, setEnviado] = useState(false);
  const travado = useRef(false);

  async function aoEnviar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (travado.current) return;
    const form = e.currentTarget;
    const email = String(new FormData(form).get("email") ?? "").trim().toLowerCase();
    const invalido = validarEmail(email);
    setErroEmail(invalido);
    setErro(undefined);
    if (invalido) {
      focarPrimeiroErro(form);
      return;
    }

    travado.current = true;
    setEnviando(true);
    const supabase = createClient();
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/callback?next=/redefinir-senha`,
    });
    // So mostramos erro de rede ou de limite; qualquer outro caso vira a mensagem neutra.
    if (error && /rate limit|too many|security purposes|fetch|network/i.test(error.message)) {
      setErro(traduzirErro(error));
      travado.current = false;
      setEnviando(false);
      return;
    }
    setEnviado(true);
  }

  if (enviado) {
    return (
      <div role="status" className="flex flex-col gap-3 rounded-lg border border-borda-sutil bg-superficie p-5">
        <MailCheck size={40} strokeWidth={2} aria-hidden className="text-sucesso-texto" />
        <p className="text-lg font-bold">Se o e-mail existir, enviamos um link.</p>
        <p className="text-base text-texto-suave">
          Abra o e-mail neste mesmo celular e toque no link para criar a senha nova. Não chegou? Veja o spam ou espere
          alguns minutos.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={aoEnviar} noValidate className="flex flex-col gap-5">
      <Campo
        rotulo="E-mail"
        name="email"
        type="email"
        inputMode="email"
        autoComplete="username"
        autoCapitalize="none"
        erro={erroEmail}
      />
      {erro && <CaixaMensagem tipo="erro">{erro}</CaixaMensagem>}
      <BotaoEnviar enviando={enviando} rotulo="Enviar link" rotuloEnviando="Enviando…" />
    </form>
  );
}
