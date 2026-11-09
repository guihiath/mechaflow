import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

/**
 * Cliente com a chave SECRETA do Supabase (ARQUITETURA 15.12, PR5). Passa por cima da RLS.
 *
 * - Só este arquivo lê `SUPABASE_SECRET_KEY`, e só `gerarLinkSenhaMembro` (src/acoes/equipe.ts) o importa.
 * - `server-only`: importar daqui num componente de cliente quebra o build.
 * - A variável NUNCA tem prefixo NEXT_PUBLIC_ (iria para o navegador). Quem coloca na Vercel é o Guilherme.
 * - Sem a variável, devolve null; quem chama responde `link_senha_indisponivel`, sem quebrar a página.
 */
export function criarClienteAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const chave = process.env.SUPABASE_SECRET_KEY?.trim();
  if (!url || !chave) return null;
  return createClient<Database>(url, chave, { auth: { persistSession: false, autoRefreshToken: false } });
}
