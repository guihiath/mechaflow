import type { NextRequest } from "next/server";
import { contextoParaAcao } from "@/lib/dal";
import { createClient } from "@/lib/supabase/server";
import { carregarFontesPdf } from "@/lib/pdf/fontes";
import { carregarDadosPdfOrcamento } from "@/lib/pdf-orcamento/dados";
import { gerarPdfOrcamento } from "@/lib/pdf-orcamento/layout";

/*
 * GET /api/os/<id>/orcamento/<versao>/pdf — PDF do orçamento pela versão congelada (F7-B9,
 * DESIGN §14.10). Lê `vw_orcamento_versoes.conteudo` com o cliente Supabase do usuário (RLS;
 * nunca service_role). Só dono e atendente. Só leitura: nada muda no banco.
 * Tabela (a mesma do PDF da OS): sem login = 401; sem oficina ativa = 403; mecânico, outra oficina,
 * OS ou versão inventada = 404 (não diz se existe); OS cancelada = 409.
 * Nada fica guardado: Cache-Control private, no-store, e o service worker não toca em /api.
 * As fontes são lidas com fs: a rota está em `outputFileTracingIncludes` do next.config.ts.
 */

export const maxDuration = 30;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SEM_CACHE = { "Cache-Control": "private, no-store, max-age=0", "X-Robots-Tag": "noindex" };

function erro(status: number, mensagem: string) {
  return Response.json({ erro: mensagem }, { status, headers: SEM_CACHE });
}

export async function GET(_req: NextRequest, ctx: RouteContext<"/api/os/[id]/orcamento/[versao]/pdf">) {
  const t0 = performance.now();
  const { id, versao } = await ctx.params;

  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims?.sub) return erro(401, "Entre de novo para baixar o PDF.");
  const contexto = await contextoParaAcao(["dono", "atendente", "mecanico"]);
  if (!contexto) return erro(403, "Sem acesso a esta oficina.");
  const numero = /^\d{1,6}$/.test(versao) ? Number(versao) : NaN;
  // Mecânico: o mesmo 404 de quem não vê. O banco também não entrega a versão a ele (0 linhas).
  if (contexto.papel === "mecanico" || !UUID.test(id) || !Number.isSafeInteger(numero) || numero < 1) {
    return erro(404, "Orçamento não encontrado.");
  }

  try {
    const [r, fontes] = await Promise.all([carregarDadosPdfOrcamento(supabase, id, numero), carregarFontesPdf()]);
    if (!r.ok) return erro(r.status, r.erro);
    const t1 = performance.now();
    const bytes = await gerarPdfOrcamento(r.documento, r.versao, fontes, new Date());
    const pdfMs = performance.now() - t1;
    const totalMs = performance.now() - t0;
    if (totalMs > 5_000) {
      console.warn(JSON.stringify({ evento: "pdf_orcamento_lento", totalMs: Math.round(totalMs), dadosMs: Math.round(r.dadosMs), pdfMs: Math.round(pdfMs), bytes: bytes.byteLength }));
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
    console.error(JSON.stringify({ evento: "pdf_orcamento_erro", mensagem: e instanceof Error ? e.message : String(e) }));
    return erro(500, "Não foi possível gerar o PDF.");
  }
}
