import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "./database.types";
import { getSupabaseEnv } from "./env";
import { CABECALHO_CAMINHO, ehOrcamentoPublico } from "@/lib/caminho";

/**
 * Prefixos publicos (sem login). Todo o resto exige sessao.
 * "/" e exato; os demais valem para a rota e as filhas.
 */
const ROTAS_PUBLICAS = ["/login", "/cadastro", "/convite", "/termos", "/auth", "/esqueci-senha", "/redefinir-senha", "/orcamento"];

export function rotaPublica(pathname: string) {
  if (pathname === "/") return true;
  // Vitrine de componentes (dados ficticios, sem Supabase), so fora da producao; em producao da 404.
  if (process.env.NEXT_PUBLIC_AMBIENTE !== "producao" && (pathname === "/dev" || pathname.startsWith("/dev/"))) return true;
  return ROTAS_PUBLICAS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/**
 * Renova a sessao do Supabase a cada requisicao (padrao oficial do @supabase/ssr)
 * e manda para /login quem tenta abrir pagina protegida sem sessao.
 * E so uma checagem otimista: cada pagina e Server Action confere de novo
 * (src/lib/dal.ts) e a RLS do banco e a protecao final.
 */
export async function atualizarSessao(request: NextRequest) {
  // Orçamento por link: a página usa cliente sem sessão, e robô de prévia não tem o que renovar.
  // Sem cookie na resposta, com ou sem login no aparelho.
  if (ehOrcamentoPublico(request.nextUrl.pathname)) return NextResponse.next();

  const { url, publishableKey } = getSupabaseEnv();
  // Caminho pedido, para a barra de navegação hidratar igual ao HTML do servidor (F4-P1).
  request.headers.set(CABECALHO_CAMINHO, request.nextUrl.pathname);
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
  // Quem já tem sessão não passa pela tela de "Criar conta / Entrar" (é o start_url do PWA, F5-E-3).
  // Fica aqui, e não na página, porque "/" é estática (Cache Components). /entrar decide o destino.
  if (logado && pathname === "/") {
    const destino = request.nextUrl.clone();
    destino.pathname = "/entrar";
    destino.search = "";
    const redirect = NextResponse.redirect(destino);
    redirect.headers.set("Cache-Control", "private, no-store");
    response.cookies.getAll().forEach((c) => redirect.cookies.set(c));
    return redirect;
  }
  // API sem sessão: 401 em JSON (quem chama é fetch, não uma pessoa para mandar ao /login).
  if (!logado && pathname.startsWith("/api/") && !rotaPublica(pathname)) {
    const naoAutorizado = NextResponse.json(
      { erro: "Entre de novo para continuar." },
      { status: 401, headers: { "Cache-Control": "private, no-store" } },
    );
    response.cookies.getAll().forEach((c) => naoAutorizado.cookies.set(c));
    return naoAutorizado;
  }
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
