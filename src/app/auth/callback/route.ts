import { NextResponse, type NextRequest } from "next/server";
import { caminhoSeguro } from "@/lib/contexto";
import { createClient } from "@/lib/supabase/server";

/**
 * Volta do link de confirmacao de e-mail (PKCE): troca o ?code= pela sessao.
 * So e usado se a confirmacao de e-mail estiver ligada no Supabase.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const next = caminhoSeguro(searchParams.get("next")) ?? "/entrar";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(`${origin}${next}`);
  }

  return NextResponse.redirect(`${origin}/login?erro=link`);
}
