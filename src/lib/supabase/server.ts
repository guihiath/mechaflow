import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { connection } from "next/server";
import type { Database } from "./database.types";
import { getSupabaseEnv } from "./env";

/**
 * Cliente Supabase para Server Components, Server Actions e Route Handlers.
 * Crie um novo cliente a cada requisicao (nao guarde em variavel global).
 *
 * `connection()` (F8-P2, F5-E-10): o supabase-js le `Date.now()` ao carregar a sessao (validade do
 * token). Com Cache Components + Partial Prefetching, o Next pre-renderiza a parte "runtime" da
 * pagina (prefetch e casca) com os cookies na mao e acusa esse `Date.now()` como "unstable value"
 * no log, a cada tela. Nada que usa a sessao pode ir para o prefetch mesmo (depende do usuario e
 * da hora), entao marcamos aqui, antes de qualquer chamada, que dai em diante e so na requisicao.
 * Nao muda o que o usuario ve; tira o aviso do log. Nao usar este cliente dentro de "use cache".
 */
export async function createClient() {
  const { url, publishableKey } = getSupabaseEnv();
  const cookieStore = await cookies();
  await connection();

  return createServerClient<Database>(url, publishableKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          );
        } catch {
          // Chamado de um Server Component: cookies sao somente leitura aqui.
          // O proxy (src/proxy.ts) renova a sessao antes de cada pagina.
        }
      },
    },
  });
}
