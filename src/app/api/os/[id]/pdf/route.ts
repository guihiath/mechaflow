import type { NextRequest } from "next/server";
import { contextoParaAcao } from "@/lib/dal";
import { createClient } from "@/lib/supabase/server";
import { carregarFontesPdf } from "@/lib/pdf/fontes";
import { carregarDadosPdfOS } from "@/lib/pdf-os/dados";
import { gerarPdfOS } from "@/lib/pdf-os/layout";

/*
 * GET /api/os/<id>/pdf — "Ordem de serviço" (OS aberta) ou "Resumo final" (entregue), F7-B3,
 * DESIGN §14.10 e ARQUITETURA 14.7. Gerado na hora pela RPC `dados_pdf_os`, com o cliente
 * Supabase do usuário (RLS; nunca service_role). Só dono e atendente.
 * Tabela (a mesma da vistoria): sem login = 401; sem oficina ativa = 403; mecânico, outra oficina
 * ou OS inventada = 404 (não diz se existe; B5); cancelada = 409.
 * Nada fica guardado: Cache-Control private, no-store, e o service worker não toca em /api.
 * As fontes são lidas com fs: a rota está em `outputFileTracingIncludes` do next.config.ts.
 */

export const maxDuration = 30;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SEM_CACHE = { "Cache-Control": "private, no-store, max-age=0", "X-Robots-Tag": "noindex" };

function erro(status: number, mensagem: string) {
  return Response.json({ erro: mensagem }, { status, headers: SEM_CACHE });
}

export async function GET(_req: NextRequest, ctx: RouteContext<"/api/os/[id]/pdf">) {
  const t0 = performance.now();
  const { id } = await ctx.params;

  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims?.sub) return erro(401, "Entre de novo para baixar o PDF.");
  const contexto = await contextoParaAcao(["dono", "atendente", "mecanico"]);
  if (!contexto) return erro(403, "Sem acesso a esta oficina.");
  // Mecânico: o mesmo 404 de quem não vê (B5). O banco também recusa (42501 → 404).
  if (contexto.papel === "mecanico" || !UUID.test(id)) return erro(404, "OS não encontrada.");

  try {
    const [r, fontes] = await Promise.all([carregarDadosPdfOS(supabase, id), carregarFontesPdf()]);
    if (!r.ok) return erro(r.status, r.erro);
    const t1 = performance.now();
    const gerado = new Date(r.dados.gerado_em);
    const bytes = await gerarPdfOS(r.dados, { situacao: r.situacao }, fontes, Number.isNaN(gerado.getTime()) ? new Date() : gerado);
    const pdfMs = performance.now() - t1;
    const totalMs = performance.now() - t0;
    if (totalMs > 5_000) {
      console.warn(JSON.stringify({ evento: "pdf_os_lento", totalMs: Math.round(totalMs), dadosMs: Math.round(r.dadosMs), pdfMs: Math.round(pdfMs), bytes: bytes.byteLength }));
    }
    const nome = r.nomeArquivo;
    return new Response(new Blob([bytes as Uint8Array<ArrayBuffer>], { type: "application/pdf" }), {
      status: 200,
      headers: {
        ...SEM_CACHE,
        "Content-Type": "application/pdf",
        "Content-Length": String(bytes.byteLength),
        "Content-Disposition": `attachment; filename="${nome}"; filename*=UTF-8''${encodeURIComponent(nome)}`,
        "Server-Timing": `dados;dur=${r.dadosMs.toFixed(0)}, pdf;dur=${pdfMs.toFixed(0)}, total;dur=${totalMs.toFixed(0)}`,
      },
    });
  } catch (e) {
    console.error(JSON.stringify({ evento: "pdf_os_erro", mensagem: e instanceof Error ? e.message : String(e) }));
    return erro(500, "Não foi possível gerar o PDF.");
  }
}
