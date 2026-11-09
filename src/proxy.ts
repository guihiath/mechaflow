import { NextResponse, type NextRequest } from "next/server";
import { atualizarSessao } from "@/lib/supabase/proxy";

/** Domínio único da produção (ARQUITETURA 15.8.2). */
const DOMINIO_PRODUCAO = "mechaflow.com.br";
const EH_PRODUCAO = process.env.NEXT_PUBLIC_AMBIENTE === "producao";

/** Rotas só de teste: em produção dão 404 para todos, com ou sem login. */
const ehRotaSoDeTeste = (p: string) =>
  p === "/dev" || p.startsWith("/dev/") || p === "/diagnostico" || p.startsWith("/diagnostico/");

/** Servidor local (`next start` com o build de produção, para conferir): não redireciona. */
const ehLocal = (host: string) => host === "localhost" || host === "127.0.0.1" || host === "[::1]";

export async function proxy(request: NextRequest) {
  if (EH_PRODUCAO) {
    // Quem entra pelo endereço antigo (mechaflow-seven.vercel.app, URL do deploy) vai para o domínio,
    // no mesmo caminho: um PWA só, e o "Esqueci a senha" volta ao Site URL certo.
    // Cabeçalho Host (sem a porta): o `nextUrl.hostname` pode vir do servidor, não do pedido.
    // Forjar o Host só manda quem forjou para o domínio certo.
    const host = (request.headers.get("host") ?? request.nextUrl.host).toLowerCase().replace(/:\d+$/, "");
    if (host !== DOMINIO_PRODUCAO && !ehLocal(host)) {
      const destino = new URL(`${request.nextUrl.pathname}${request.nextUrl.search}`, `https://${DOMINIO_PRODUCAO}`);
      return NextResponse.redirect(destino, 308);
    }
    if (ehRotaSoDeTeste(request.nextUrl.pathname)) {
      // Página "não encontrada" do app, com status 404 (rota que não existe).
      return NextResponse.rewrite(new URL("/_rota-inexistente", request.url));
    }
  }
  return atualizarSessao(request);
}

export const config = {
  matcher: [
    /*
     * Roda em tudo, menos arquivos estaticos e do PWA:
     * _next/static, _next/image, icones, manifest, service worker e imagens.
     */
    "/((?!_next/static|_next/image|favicon.ico|icons/|manifest.webmanifest|sw.js|offline.html|robots.txt|.*\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
