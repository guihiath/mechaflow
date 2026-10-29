"use client";

import { useRef, useState, type FormEvent } from "react";
import { Campo } from "@/components/ui/campo";
import { BotaoEnviar, CaixaMensagem } from "@/components/ui/formulario";
import { irParaDestino, lerVoltar, validarEmail } from "@/components/auth/navegar";
import { traduzirErro } from "@/lib/erros";
import { createClient } from "@/lib/supabase/client";

export function FormLogin() {
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string>();
  const [erros, setErros] = useState<{ email?: string; senha?: string }>({});
  const travado = useRef(false);

  async function aoEnviar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (travado.current) return;
    const dados = new FormData(e.currentTarget);
    const email = String(dados.get("email") ?? "").trim().toLowerCase();
    const senha = String(dados.get("senha") ?? "");

    const novos = { email: validarEmail(email), senha: senha ? undefined : "Informe a senha." };
    setErros(novos);
    setErro(undefined);
    if (novos.email || novos.senha) return;

    travado.current = true;
    setEnviando(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithPassword({ email, password: senha });
      if (error) throw error;
      await irParaDestino(supabase, lerVoltar());
    } catch (err) {
      setErro(traduzirErro(err as { message?: string }));
      travado.current = false;
      setEnviando(false);
    }
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
        erro={erros.email}
        required
      />
      <Campo rotulo="Senha" name="senha" type="password" autoComplete="current-password" erro={erros.senha} required />
      {erro && <CaixaMensagem tipo="erro">{erro}</CaixaMensagem>}
      <BotaoEnviar enviando={enviando} rotulo="Entrar" rotuloEnviando="Entrando…" />
    </form>
  );
}
