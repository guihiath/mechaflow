"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { MailCheck } from "lucide-react";
import { Campo, CampoTelefone } from "@/components/ui/campo";
import { BotaoEnviar, CaixaMensagem } from "@/components/ui/formulario";
import { AceiteTermos, ERRO_TERMOS } from "@/components/auth/aceite-termos";
import { irParaDestino, validarEmail, validarSenha } from "@/components/auth/navegar";
import { traduzirErro } from "@/lib/erros";
import { soDigitos } from "@/lib/formato";
import { TERMOS_VERSAO } from "@/lib/termos";
import { createClient } from "@/lib/supabase/client";

/** Guarda o que foi digitado se o cadastro parar na confirmacao de e-mail. */
const CHAVE_PENDENTE = "mf-cadastro-pendente";

type Pendente = { nome?: string; nomeOficina?: string; telefone?: string };
type Erros = Partial<Record<"nome" | "nomeOficina" | "telefone" | "email" | "senha" | "termos", string>>;

/**
 * Cadastro do dono em 2 passos (ARQUITETURA 8): signUp + rpc criar_oficina.
 * `logado` = usuario ja tem conta mas nenhuma oficina (/bem-vindo): so o 2o passo.
 * Pode repetir sem medo: se a conta ja foi criada, entra com a mesma senha e segue.
 * As RPCs rodam no navegador para o aceite gravar o IP real (ARQUITETURA 11).
 */
export function FormOficina({ logado = false }: { logado?: boolean }) {
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string>();
  const [erros, setErros] = useState<Erros>({});
  const [confirmarEmail, setConfirmarEmail] = useState<string | null>(null);
  const [pendente, setPendente] = useState<Pendente>({});
  const travado = useRef(false);

  useEffect(() => {
    try {
      const salvo = localStorage.getItem(CHAVE_PENDENTE);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- le o rascunho salvo so depois de montar (localStorage nao existe no servidor)
      if (salvo) setPendente(JSON.parse(salvo) as Pendente);
    } catch {
      /* sem localStorage: segue sem rascunho */
    }
  }, []);

  async function aoEnviar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (travado.current) return;
    const d = new FormData(e.currentTarget);
    const nome = String(d.get("nome") ?? "").trim();
    const nomeOficina = String(d.get("nomeOficina") ?? "").trim();
    const telefone = soDigitos(String(d.get("telefone") ?? ""));
    const email = String(d.get("email") ?? "").trim().toLowerCase();
    const senha = String(d.get("senha") ?? "");
    const termos = d.get("termos") === "sim";

    const novos: Erros = {
      nome: nome.length < 2 ? "Informe seu nome." : undefined,
      nomeOficina: nomeOficina.length < 2 ? "Informe o nome da oficina." : undefined,
      telefone: telefone && (telefone.length < 10 || telefone.length > 11) ? "Telefone com DDD. Ex.: (11) 98888-7777" : undefined,
      email: logado ? undefined : validarEmail(email),
      senha: logado ? undefined : validarSenha(senha),
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
        const { data, error } = await supabase.auth.signUp({
          email,
          password: senha,
          options: {
            emailRedirectTo: `${window.location.origin}/auth/callback?next=/bem-vindo`,
            data: { nome },
          },
        });
        let temSessao = Boolean(data.session);
        if (error) {
          // Conta ja criada numa tentativa anterior (ex.: internet caiu no 2o passo): entra e segue.
          if (!/already registered|already been registered/i.test(error.message)) throw error;
          const entrar = await supabase.auth.signInWithPassword({ email, password: senha });
          if (entrar.error) throw error;
          temSessao = true;
        }
        if (!temSessao) {
          try {
            localStorage.setItem(CHAVE_PENDENTE, JSON.stringify({ nome, nomeOficina, telefone }));
          } catch {
            /* ignora */
          }
          setConfirmarEmail(email);
          return;
        }
      }

      const { error } = await supabase.rpc("criar_oficina", {
        p_nome_oficina: nomeOficina,
        p_nome_dono: nome,
        p_versao_termos: TERMOS_VERSAO,
        p_autoriza_uso_anonimizado: true,
        p_telefone: telefone || undefined,
      });
      if (error && error.message !== "usuario_ja_tem_oficina") throw error;
      try {
        localStorage.removeItem(CHAVE_PENDENTE);
      } catch {
        /* ignora */
      }
      await irParaDestino(supabase);
    } catch (err) {
      setErro(traduzirErro(err as { message?: string }));
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
          depois entre com sua senha para terminar o cadastro da oficina.
        </p>
        <p className="text-base text-texto-suave">Não chegou? Veja a caixa de spam ou espere alguns minutos.</p>
      </div>
    );
  }

  return (
    <form onSubmit={aoEnviar} noValidate className="flex flex-col gap-5">
      <Campo rotulo="Seu nome" name="nome" autoComplete="name" defaultValue={pendente.nome} key={`n${pendente.nome}`} erro={erros.nome} />
      <Campo
        rotulo="Nome da oficina"
        name="nomeOficina"
        autoComplete="organization"
        defaultValue={pendente.nomeOficina}
        key={`o${pendente.nomeOficina}`}
        erro={erros.nomeOficina}
      />
      <CampoTelefone
        rotulo="Telefone da oficina"
        opcional
        valorInicial={pendente.telefone}
        key={`t${pendente.telefone}`}
        erro={erros.telefone}
      />
      {!logado && (
        <>
          <Campo
            rotulo="E-mail"
            name="email"
            type="email"
            inputMode="email"
            autoComplete="email"
            autoCapitalize="none"
            ajuda="Vai ser o seu usuário para entrar."
            erro={erros.email}
          />
          <Campo
            rotulo="Senha"
            name="senha"
            type="password"
            autoComplete="new-password"
            ajuda="Mínimo de 8 caracteres."
            erro={erros.senha}
          />
        </>
      )}
      <AceiteTermos erro={erros.termos} />
      {erro && <CaixaMensagem tipo="erro">{erro}</CaixaMensagem>}
      <BotaoEnviar
        enviando={enviando}
        rotulo={logado ? "Criar oficina" : "Criar conta da oficina"}
        rotuloEnviando="Criando…"
      />
    </form>
  );
}
