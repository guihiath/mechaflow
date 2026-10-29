"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import { caminhoSeguro, destinoPorContexto, HOME_POR_PAPEL } from "@/lib/contexto";
import type { Database } from "@/lib/supabase/database.types";

/**
 * Depois de entrar/cadastrar: le o meu_contexto e vai para a tela certa.
 * Navegacao "dura" (location.replace) para o servidor ja ler os cookies novos.
 */
export async function irParaDestino(supabase: SupabaseClient<Database>, voltar?: string | null) {
  const { data } = await supabase.rpc("meu_contexto").maybeSingle();
  const destino = destinoPorContexto(data ?? null);
  const pronto = Object.values(HOME_POR_PAPEL).includes(destino);
  window.location.replace((pronto && caminhoSeguro(voltar)) || destino);
}

/** Le ?voltar= da URL atual (sem useSearchParams, para nao precisar de Suspense). */
export function lerVoltar(): string | null {
  if (typeof window === "undefined") return null;
  return caminhoSeguro(new URLSearchParams(window.location.search).get("voltar"));
}

export function validarEmail(email: string): string | undefined {
  if (!email) return "Informe o e-mail.";
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return "E-mail inválido. Ex.: joao@gmail.com";
  return undefined;
}

export function validarSenha(senha: string): string | undefined {
  if (!senha) return "Informe a senha.";
  if (senha.length < 8) return "A senha precisa ter pelo menos 8 caracteres.";
  return undefined;
}
