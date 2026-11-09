"use server";

import type { EmailOtpType } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import { texto } from "@/lib/acao";
import { caminhoSeguro } from "@/lib/contexto";
import { createClient } from "@/lib/supabase/server";

const TIPOS: EmailOtpType[] = ["recovery", "signup", "email_change", "email"];

/**
 * "Continuar" da página /auth/confirmar (ARQUITETURA 15.5): só aqui, num POST, o token vira sessão.
 * O GET da página não gasta nada, então a prévia do WhatsApp ou o antivírus do e-mail não estragam o link.
 */
export async function confirmarLink(dados: FormData) {
  const tokenHash = texto(dados, "token_hash");
  const tipo = texto(dados, "type") as EmailOtpType;
  if (!tokenHash || tokenHash.length > 200 || !TIPOS.includes(tipo)) redirect("/auth/confirmar?erro=link");

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({ type: tipo, token_hash: tokenHash });
  if (error) redirect("/auth/confirmar?erro=link");

  redirect(caminhoSeguro(texto(dados, "next")) ?? (tipo === "recovery" ? "/redefinir-senha" : "/entrar"));
}
