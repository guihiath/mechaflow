import type { Metadata, Viewport } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { CascaOrcamentoPublico } from "@/components/orcamento/casca-publica";
import { CarregandoOrcamento, EstadoLinkPublico } from "@/components/orcamento/estado-link-publico";
import { APP_NAME } from "@/lib/brand";
import { leituraDoBanco } from "@/lib/orcamento";
import { criarClienteSemSessao } from "@/lib/supabase/sem-sessao";
import { urlPublicaApp } from "@/lib/url-publica";
import { RespostaPeloNavegador } from "./responder-cliente";

const TITULO = "Orçamento para sua aprovação";
const DESCRICAO = "Toque para ver o orçamento e responder.";
const base = urlPublicaApp();

/**
 * Prévia fixa, igual para todo token, válido ou não (DESIGN §13.14): nada aqui consulta o banco.
 * Os `null` tiram o que o layout raiz põe para o PWA: esta rota não instala (DESIGN §13.1).
 * Os cabeçalhos (`noindex`, `no-store`, `no-referrer`) ficam em `next.config.ts`.
 */
export const metadata: Metadata = {
  ...(base ? { metadataBase: new URL(base) } : {}),
  title: { absolute: TITULO },
  description: DESCRICAO,
  robots: { index: false, follow: false },
  referrer: "no-referrer",
  manifest: null,
  appleWebApp: null,
  applicationName: null,
  icons: { icon: [{ url: "/icons/icon.svg", type: "image/svg+xml" }] },
  openGraph: {
    title: TITULO,
    description: DESCRICAO,
    siteName: APP_NAME,
    type: "website",
    ...(base ? { images: [{ url: "/icons/icon-512.png", width: 512, height: 512 }] } : {}),
  },
};

/** Sempre clara, como a vitrine do F6-F1 (DESIGN §13.1). */
export const viewport: Viewport = {
  colorScheme: "only light",
  themeColor: "#F2F0EB",
};

/** Página pública do orçamento (DESIGN §13.2 a §13.6): fora do layout do app, sem login. */
export default function PaginaOrcamento({ params }: PageProps<"/orcamento/[token]">) {
  return (
    <CascaOrcamentoPublico>
      <Suspense fallback={<CarregandoOrcamento />}>
        <Conteudo params={params} />
      </Suspense>
    </CascaOrcamentoPublico>
  );
}

/**
 * Lê pelo servidor, com cliente sem sessão (ARQUITETURA 13.6). Abrir não muda nada: `ver_orcamento`
 * só soma o contador de tentativas. O que chega ao navegador é o objeto de `leituraDoBanco`.
 */
async function Conteudo({ params }: { params: Promise<{ token: string }> }) {
  await connection();
  const { token } = await params;
  const { data, error } = await criarClienteSemSessao().rpc("ver_orcamento", { p_token: token });
  // Só o código do erro: o token nunca vai para log.
  if (error) console.error("ver_orcamento falhou", error.code);
  const leitura = error ? null : leituraDoBanco(data);
  if (!leitura) return <EstadoLinkPublico motivo="erro_abrir" />;
  return <RespostaPeloNavegador token={token} leitura={leitura} />;
}
