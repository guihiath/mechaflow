import type { NextRequest } from "next/server";
import { contextoParaAcao } from "@/lib/dal";
import { createClient } from "@/lib/supabase/server";
import { carregarDadosPdf, carregarFontesPdf } from "@/lib/vistoria/pdf-dados";
import { gerarPdfVistoria } from "@/lib/vistoria/pdf-layout";

/*
 * GET /api/vistorias/<id>/pdf — PDF da vistoria concluída ou anulada (F4-B6, DESIGN §12.17).
 * Gerado na hora, a partir dos dados já travados, com o cliente Supabase do usuário (RLS):
 * sem login = 401; sem oficina ativa = 403; outra oficina / OS que ele não vê = 404 (não diz
 * se existe). Runtime Node.js (padrão; com cacheComponents não se declara `runtime`).
 * Nada fica guardado: Cache-Control private, no-store, e o service worker não toca em /api.
 */

export const maxDuration = 30;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SEM_CACHE = { "Cache-Control": "private, no-store, max-age=0", "X-Robots-Tag": "noindex" };

function erro(status: number, mensagem: string) {
  return Response.json({ erro: mensagem }, { status, headers: SEM_CACHE });
}

export async function GET(_req: NextRequest, ctx: RouteContext<"/api/vistorias/[id]/pdf">) {
  const t0 = performance.now();
  const { id } = await ctx.params;

  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims?.sub) return erro(401, "Entre de novo para baixar o PDF.");
  const contexto = await contextoParaAcao(["dono", "atendente", "mecanico"]);
  if (!contexto) return erro(403, "Sem acesso a esta oficina.");
  if (!UUID.test(id)) return erro(404, "Vistoria não encontrada.");

  try {
    const [r, fontes] = await Promise.all([carregarDadosPdf(supabase, id), carregarFontesPdf()]);
    if (!r.ok) return erro(r.status, r.erro);
    const t1 = performance.now();
    const bytes = await gerarPdfVistoria(r.dados, fontes);
    const pdfMs = performance.now() - t1;
    const totalMs = performance.now() - t0;
    if (totalMs > 5_000) {
      console.warn(JSON.stringify({ evento: "pdf_vistoria_lento", totalMs: Math.round(totalMs), ...arredondar(r.medicao), pdfMs: Math.round(pdfMs), bytes: bytes.byteLength }));
    }
    const nome = r.nomeArquivo;
    return new Response(new Blob([bytes as Uint8Array<ArrayBuffer>], { type: "application/pdf" }), {
      status: 200,
      headers: {
        ...SEM_CACHE,
        "Content-Type": "application/pdf",
        "Content-Length": String(bytes.byteLength),
        "Content-Disposition": `attachment; filename="${nome}"; filename*=UTF-8''${encodeURIComponent(nome)}`,
        "Server-Timing": `dados;dur=${r.medicao.dadosMs.toFixed(0)}, fotos;dur=${r.medicao.fotosMs.toFixed(0)}, pdf;dur=${pdfMs.toFixed(0)}, total;dur=${totalMs.toFixed(0)}`,
      },
    });
  } catch (e) {
    console.error(JSON.stringify({ evento: "pdf_vistoria_erro", mensagem: e instanceof Error ? e.message : String(e) }));
    return erro(500, "Não foi possível gerar o PDF.");
  }
}

function arredondar(m: Record<string, number>) {
  return Object.fromEntries(Object.entries(m).map(([k, v]) => [k, Math.round(v)]));
}
