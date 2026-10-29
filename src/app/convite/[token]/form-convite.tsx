"use client";

import { useRef, useState, type FormEvent } from "react";
import { MailCheck } from "lucide-react";
import { AceiteTermos, ERRO_TERMOS } from "@/components/auth/aceite-termos";
import { irParaDestino, validarEmail, validarSenha } from "@/components/auth/navegar";
import { Campo } from "@/components/ui/campo";
import { BotaoEnviar, CaixaMensagem } from "@/components/ui/formulario";
import { traduzirErro } from "@/lib/erros";
import { TERMOS_VERSAO } from "@/lib/termos";
import { createClient } from "@/lib/supabase/client";

type Modo = "criar" | "entrar";
type Erros = Partial<Record<"nome" | "email" | "senha" | "termos", string>>;

/**
 * Aceite do convite (ARQUITETURA 8): signUp (ou login, se ja tem conta sem oficina)
 * e depois rpc aceitar_convite. Roda no navegador para o aceite gravar o IP real.
 */
export function FormConvite({ token, logadoComo }: { token: string; logadoComo: string | null }) {
  const [modo, setModo] = useState<Modo>("criar");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string>();
  const [erros, setErros] = useState<Erros>({});
  const [confirmarEmail, setConfirmarEmail] = useState<string | null>(null);
  const travado = useRef(false);
  const logado = Boolean(logadoComo);

  async function aoEnviar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (travado.current) return;
    const d = new FormData(e.currentTarget);
    const nome = String(d.get("nome") ?? "").trim();
    const email = String(d.get("email") ?? "").trim().toLowerCase();
    const senha = String(d.get("senha") ?? "");
    const termos = d.get("termos") === "sim";

    const novos: Erros = {
      nome: nome.length < 2 ? "Informe seu nome." : undefined,
      email: logado ? undefined : validarEmail(email),
      senha: logado ? undefined : modo === "criar" ? validarSenha(senha) : senha ? undefined : "Informe a senha.",
      termos: termos ? undefined : ERRO_TERMOS,
    };
    setErros(novos);
    setErro(undefined);
    if (Object.values(novos).some(Boolean)) return;

    travado.current = true;
    setEnviando(true);
    try {
      const supabase = createClient();

      if (!logado) {
        if (modo === "criar") {
          const { data, error } = await supabase.auth.signUp({
            email,
            password: senha,
            options: {
              emailRedirectTo: `${window.location.origin}/auth/callback?next=/convite/${token}`,
              data: { nome },
            },
          });
          let temSessao = Boolean(data.session);
          if (error) {
            if (!/already registered|already been registered/i.test(error.message)) throw error;
            // Conta criada numa tentativa anterior: tenta entrar com a mesma senha.
            const entrar = await supabase.auth.signInWithPassword({ email, password: senha });
            if (entrar.error) throw new Error("Este e-mail já tem conta. Toque em “Já tenho conta” e entre com sua senha.");
            temSessao = true;
          }
          if (!temSessao) {
            setConfirmarEmail(email);
            return;
          }
        } else {
          const { error } = await supabase.auth.signInWithPassword({ email, password: senha });
          if (error) throw error;
        }
      }

      const { error } = await supabase.rpc("aceitar_convite", {
        p_token: token,
        p_nome: nome,
        p_versao_termos: TERMOS_VERSAO,
        p_autoriza_uso_anonimizado: true,
      });
      if (error) throw error;
      await irParaDestino(supabase);
    } catch (err) {
      const msg = (err as { message?: string }).message ?? "";
      setErro(msg.startsWith("Este e-mail") ? msg : traduzirErro(err as { message?: string }));
      travado.current = false;
      setEnviando(false);
    }
  }

  if (confirmarEmail) {
    return (
      <div className="flex flex-col gap-4 rounded-lg border border-borda-sutil bg-superficie p-5">
        <MailCheck size={40} strokeWidth={2} aria-hidden className="text-sucesso-texto" />
        <h2 className="text-2xl">Confirme seu e-mail</h2>
        <p className="text-lg">
          Mandamos um link para <strong className="break-all">{confirmarEmail}</strong>. Abra o e-mail, toque no link e
          você volta para este convite para terminar.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={aoEnviar} noValidate className="flex flex-col gap-5">
      {logado ? (
        <p className="text-base text-texto-suave">
          Você está logado como <strong className="text-texto">{logadoComo}</strong>.
        </p>
      ) : (
        <div role="group" aria-label="Já tem conta?" className="grid grid-cols-2 gap-2">
          {(
            [
              ["criar", "Criar conta"],
              ["entrar", "Já tenho conta"],
            ] as const
          ).map(([valor, rotulo]) => (
            <button
              key={valor}
              type="button"
              aria-pressed={modo === valor}
              onClick={() => setModo(valor)}
              className={`min-h-toque rounded-md border-2 px-3 text-base font-bold ${
                modo === valor ? "border-grafite bg-primaria text-primaria-texto" : "border-borda bg-superficie text-texto"
              }`}
            >
              {rotulo}
            </button>
          ))}
        </div>
      )}

      <Campo rotulo="Seu nome" name="nome" autoComplete="name" erro={erros.nome} ajuda="Como a equipe vai te chamar." />
      {!logado && (
        <>
          <Campo
            rotulo="E-mail"
            name="email"
            type="email"
            inputMode="email"
            autoComplete={modo === "criar" ? "email" : "username"}
            autoCapitalize="none"
            ajuda={modo === "criar" ? "Use um e-mail seu de verdade (ex.: Gmail). Ele vai ser o seu usuário." : undefined}
            erro={erros.email}
          />
          <Campo
            rotulo="Senha"
            name="senha"
            type="password"
            autoComplete={modo === "criar" ? "new-password" : "current-password"}
            ajuda={modo === "criar" ? "Mínimo de 8 caracteres." : undefined}
            erro={erros.senha}
          />
        </>
      )}
      <AceiteTermos erro={erros.termos} />
      {erro && <CaixaMensagem tipo="erro">{erro}</CaixaMensagem>}
      <BotaoEnviar enviando={enviando} rotulo="Entrar na equipe" rotuloEnviando="Entrando…" />
    </form>
  );
}
