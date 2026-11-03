import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";
import { getSupabaseEnv } from "./env";

/**
 * Cliente SEM sessão, só para a página pública do orçamento (ARQUITETURA 13.6). Serve no servidor
 * e no navegador. `@/lib/supabase/server` e `client` carregam o login, e as RPCs públicas recusam
 * usuário logado (42501): o dono abrindo o link no próprio aparelho também passa por aqui.
 */
export function criarClienteSemSessao(): SupabaseClient<Database> {
  const { url, publishableKey } = getSupabaseEnv();
  return createClient<Database>(url, publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: (entrada, opcoes) => fetch(entrada, { ...opcoes, cache: "no-store" }) },
  });
}
