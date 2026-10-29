"use client";

import { useRef, useState, type FormEvent } from "react";
import { CampoSenha } from "@/components/ui/campo";
import { BotaoEnviar, CaixaMensagem, focarPrimeiroErro } from "@/components/ui/formulario";
import { irParaDestino, validarSenha } from "@/components/auth/navegar";
import { traduzirErro } from "@/lib/erros";
import { createClient } from "@/lib/supabase/client";

export function FormRedefinirSenha({ email }: { email: string | null }) {
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string>();
  const [erros, setErros] = useState<{ senha?: string; confirmar?: string }>({});
  const travado = useRef(false);

  async function aoEnviar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (travado.current) return;
    const form = e.currentTarget;
    const d = new FormData(form);
    const senha = String(d.get("senha") ?? "");
    const confirmar = String(d.get("confirmar") ?? "");
    const novos = {
      senha: validarSenha(senha),
      confirmar: !validarSenha(senha) && senha !== confirmar ? "As duas senhas não são iguais." : undefined,
    };
    setErros(novos);
    setErro(undefined);
    if (novos.senha || novos.confirmar) {
      focarPrimeiroErro(form);
      return;
    }

    travado.current = true;
    setEnviando(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.updateUser({ password: senha });
      if (error) {
        if (/session|jwt|expired/i.test(error.message)) {
          throw new Error("Este link venceu. Peça um link novo em “Esqueci minha senha”.");
        }
        if (/different from the old|same password/i.test(error.message)) {
          throw new Error("A senha nova tem que ser diferente da antiga.");
        }
        throw error;
      }
      await irParaDestino(supabase);
    } catch (err) {
      const msg = (err as { message?: string }).message ?? "";
      setErro(/^(Este link|A senha nova)/.test(msg) ? msg : traduzirErro(err as { message?: string }));
      travado.current = false;
      setEnviando(false);
    }
  }

  return (
    <form onSubmit={aoEnviar} noValidate className="flex flex-col gap-5">
      {email && (
        <p className="text-base text-texto-suave">
          Conta: <strong className="break-all text-texto">{email}</strong>
        </p>
      )}
      <CampoSenha rotulo="Senha nova" name="senha" autoComplete="new-password" ajuda="Mínimo de 8 caracteres." erro={erros.senha} />
      <CampoSenha rotulo="Repita a senha nova" name="confirmar" autoComplete="new-password" erro={erros.confirmar} />
      {erro && <CaixaMensagem tipo="erro">{erro}</CaixaMensagem>}
      <BotaoEnviar enviando={enviando} rotulo="Salvar senha nova" rotuloEnviando="Salvando…" />
    </form>
  );
}
