import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "./database.types";
import { getSupabaseEnv } from "./env";

/**
 * Prefixos publicos (sem login). Todo o resto exige sessao.
 * "/" e exato; os demais valem para a rota e as filhas.
 */
const ROTAS_PUBLICAS = ["/login", "/cadastro", "/convite", "/termos", "/auth"];

export function rotaPublica(pathname: string) {
  if (pathname === "/") return true;
  return ROTAS_PUBLICAS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/**
 * Renova a sessao do Supabase a cada requisicao (padrao oficial do @supabase/ssr)
 * e manda para /login quem tenta abrir pagina protegida sem sessao.
 * E so uma checagem otimista: cada pagina e Server Action confere de novo
 * (src/lib/dal.ts) e a RLS do banco e a protecao final.
 */
export async function atualizarSessao(request: NextRequest) {
  const { url, publishableKey } = getSupabaseEnv();
  let response = NextResponse.next({ request });

  const supabase = createServerClient<Database>(url, publishableKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
        Object.entries(headers ?? {}).forEach(([chave, valor]) =>
          response.headers.set(chave, valor),
        );
      },
    },
  });

  // Nao coloque codigo entre createServerClient e getClaims (doc do @supabase/ssr).
  const { data } = await supabase.auth.getClaims();
  const logado = Boolean(data?.claims?.sub);

  const { pathname, search } = request.nextUrl;
  if (!logado && !rotaPublica(pathname)) {
    const destino = request.nextUrl.clone();
    destino.pathname = "/login";
    destino.search = "";
    if (pathname !== "/inicio") destino.searchParams.set("voltar", `${pathname}${search}`);
    const redirect = NextResponse.redirect(destino);
    // Mantem os cookies renovados/limpos pelo Supabase.
    response.cookies.getAll().forEach((c) => redirect.cookies.set(c));
    return redirect;
  }

  return response;
}
