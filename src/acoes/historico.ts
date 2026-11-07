"use server";

import type { DetalheOSHistorico, PapelHistorico } from "@/components/historico/cartao-os-historico";
import { contextoParaAcao } from "@/lib/dal";
import { normalizarPlaca } from "@/lib/formato";
import { BUCKET_FOTOS, BUCKET_VISTORIAS, VALIDADE_URL_FOTO_S } from "@/lib/fotos/regras";
import { lerPaginaHistorico, type CursorHistorico, type PaginaHistorico } from "@/lib/historico";
import { ehFormaPagamento } from "@/lib/os";
import { ehStatusOS } from "@/lib/os-status";
import { detalheDoHistorico, parteListaDoHistorico, type ParteListaHistorico, type UrlsAssinadas } from "@/lib/painel-dados";
import type { HistoricoOS } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PAPEIS: PapelHistorico[] = ["dono", "atendente", "mecanico"];

type Cliente = Awaited<ReturnType<typeof createClient>>;
const texto = (v: unknown) => (typeof v === "string" ? v : null);

/** "Mostrar mais" (de 10 em 10, pelo cursor). `null` = não deu (a tela mostra "Tentar de novo"). */
export async function maisHistorico(placa: string, cursor: CursorHistorico): Promise<PaginaHistorico | null> {
  const p = normalizarPlaca(typeof placa === "string" ? placa : "");
  if (!p || p.length > 8) return null;
  if (!cursor || !UUID.test(String(cursor.antes_id)) || Number.isNaN(Date.parse(String(cursor.antes_criado_em)))) return null;
  const ctx = await contextoParaAcao(PAPEIS);
  if (!ctx) return null;
  const supabase = await createClient();
  const r = await lerPaginaHistorico(supabase, ctx.papel as PapelHistorico, p, {
    antes_criado_em: String(cursor.antes_criado_em),
    antes_id: String(cursor.antes_id),
  });
  return r?.pagina ?? null;
}

/** Assina em lote (sessão do usuário: a política do Storage decide), 15 min. */
async function assinar(supabase: Cliente, bucket: string, caminhos: string[]): Promise<Map<string, string>> {
  const urls = new Map<string, string>();
  if (!caminhos.length) return urls;
  const { data } = await supabase.storage.from(bucket).createSignedUrls(caminhos, VALIDADE_URL_FOTO_S);
  for (const s of data ?? []) if (s.path && s.signedUrl && !s.error) urls.set(s.path, s.signedUrl);
  return urls;
}

/**
 * Abrir o cartão de uma OS do histórico (F7-B7): `historico_os` com a sessão do usuário e as fotos
 * assinadas só agora, por 15 min (miniatura e foto grande). Fotos da vistoria só para o mecânico,
 * que lê a vistoria no próprio cartão; dono e atendente vão à leitura e ao PDF que já existem.
 * `o` é a parte da lista que a página já entregou ao navegador (só exibição: o que vem do banco
 * aqui é decidido pela sessão, e a cópia abaixo é chave a chave).
 */
export async function abrirOSHistorico(o: ParteListaHistorico): Promise<DetalheOSHistorico | null> {
  if (!o || typeof o.id !== "string" || !UUID.test(o.id) || !ehStatusOS(o.status)) return null;
  const ctx = await contextoParaAcao(PAPEIS);
  if (!ctx) return null;
  const papel = ctx.papel as PapelHistorico;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("historico_os", { p_os_id: o.id });
  if (error || !data) return null;
  const h = data as unknown as HistoricoOS;

  const fotosVistoria =
    papel === "mecanico" ? h.vistorias.filter((v) => v.status === "concluida").flatMap((v) => v.fotos) : [];
  const [osUrls, vUrls] = await Promise.all([
    assinar(supabase, BUCKET_FOTOS, h.fotos.flatMap((f) => [f.caminho_miniatura, f.caminho])),
    assinar(supabase, BUCKET_VISTORIAS, fotosVistoria.flatMap((f) => [f.caminho_miniatura, f.caminho])),
  ]);
  const urls = new Map<string, { miniatura?: string | null; grande?: string | null }>();
  for (const [lista, mapa] of [
    [h.fotos, osUrls],
    [fotosVistoria, vUrls],
  ] as const) {
    for (const f of lista) {
      urls.set(f.caminho_miniatura, { miniatura: mapa.get(f.caminho_miniatura) ?? null });
      urls.set(f.caminho, { ...urls.get(f.caminho), grande: mapa.get(f.caminho) ?? null });
    }
  }

  const parte = parteListaDoHistorico(
    {
      id: o.id,
      numero: Number(o.numero),
      status: o.status,
      criado_em: String(o.criado_em),
      entregue_em: texto(o.entregue_em),
      codigo_falha: texto(o.codigo_falha),
      causa_encontrada: texto(o.causa_encontrada),
      solucao_aplicada: texto(o.solucao_aplicada),
      mecanico_nome: texto(o.mecanico_nome),
      observacoes: texto(o.observacoes),
      ...(typeof o.total_centavos === "number" && Number.isInteger(o.total_centavos) ? { total_centavos: o.total_centavos } : {}),
      forma_pagamento: ehFormaPagamento(o.forma_pagamento) ? o.forma_pagamento : null,
      pago_em: texto(o.pago_em),
    },
    papel,
  );

  return detalheDoHistorico(parte, h, papel, urls as UrlsAssinadas, {
    leitura: (vistoriaId) => `/os/${o.id}/vistoria?ver=${vistoriaId}`,
    pdf: (vistoriaId) => `/api/vistorias/${vistoriaId}/pdf`,
  });
}
