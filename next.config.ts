import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  // Versão publicada no "Enviar feedback" (F5-F1): só o commit curto, nunca o env inteiro.
  env: {
    NEXT_PUBLIC_VERSAO_APP: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) || "local",
  },
  // Fontes dos PDFs (lidas com fs na rota): vistoria (F4-B6), OS / resumo final (F7-B3) e
  // orçamento pela versão congelada (F7-B9).
  outputFileTracingIncludes: {
    "/api/vistorias/*/pdf": ["./src/assets/fonts/*.ttf"],
    "/api/os/*/pdf": ["./src/assets/fonts/*.ttf"],
    "/api/os/*/orcamento/*/pdf": ["./src/assets/fonts/*.ttf"],
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
      {
        // Orçamento por link (PLANO 19.4). Depois da regra geral: no mesmo cabeçalho, a última vence.
        source: "/orcamento/:path*",
        headers: [
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "Cache-Control", value: "no-store" },
        ],
      },
      {
        source: "/sw.js",
        headers: [
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Content-Security-Policy", value: "default-src 'self'; script-src 'self'" },
        ],
      },
    ];
  },
};

export default nextConfig;
