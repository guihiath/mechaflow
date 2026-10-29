import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { caminhoSeguro } from "@/lib/contexto";
import { createClient } from "@/lib/supabase/server";

/**
 * Volta dos links de e-mail do Supabase:
 * - confirmacao de cadastro (se a confirmacao estiver ligada)
 * - recuperacao de senha (type recovery) -> /redefinir-senha
 * Aceita o fluxo PKCE (?code=) e o de token_hash (?token_hash=&type=, se o template do e-mail for trocado).
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const tipo = searchParams.get("type") as EmailOtpType | null;
  const padrao = tipo === "recovery" ? "/redefinir-senha" : "/entrar";
  const next = caminhoSeguro(searchParams.get("next")) ?? padrao;

  const supabase = await createClient();
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(`${origin}${next}`);
  } else if (tokenHash && tipo) {
    const { error } = await supabase.auth.verifyOtp({ type: tipo, token_hash: tokenHash });
    if (!error) return NextResponse.redirect(`${origin}${next}`);
  }

  // Link vencido/usado: no caso da senha, a pagina explica e oferece um link novo.
  return NextResponse.redirect(`${origin}${next === "/redefinir-senha" ? "/redefinir-senha" : "/login"}`);
}
