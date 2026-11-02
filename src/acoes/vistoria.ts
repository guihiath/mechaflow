"use server";

import { redirect } from "next/navigation";
import { contextoParaAcao } from "@/lib/dal";
import type { EstadoAcao } from "@/lib/acao";
import { traduzirErro } from "@/lib/erros";
import { createClient } from "@/lib/supabase/server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * "Fazer vistoria" (F4-B2; ARQUITETURA 12.7): cria o rascunho da vistoria de entrada
 * (idempotente: se já existe, devolve a mesma) e abre a tela da vistoria.
 * Quem pode (dono/atendente em OS aberta, mecânico só na OS dele) quem decide é o banco.
 */
export async function iniciarVistoria(osId: string): Promise<EstadoAcao> {
  if (!UUID.test(osId)) return { erro: "OS não encontrada." };
  const ctx = await contextoParaAcao(["dono", "atendente", "mecanico"]);
  if (!ctx) return { erro: "Você não tem permissão para isso." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("iniciar_vistoria", { p_os_id: osId }).single();
  if (error || !data) {
    const t = traduzirErro(error, "os");
    return { erro: t === "Algo deu errado. Tente de novo." ? "Não foi possível abrir a vistoria. Confira a internet e tente de novo." : t };
  }
  redirect(`/os/${osId}/vistoria`);
}

/**
 * "Anular vistoria" (F4-B5; ARQUITETURA 12.1 V14, DESIGN §12.13): só o dono, com motivo, para a
 * vistoria feita na OS errada. A anulada fica guardada (imutável) e libera outra na OS.
 * Reenvio com ela já anulada não faz nada (RPC idempotente). Depois abre a leitura da anulada.
 */
export async function anularVistoria(osId: string, vistoriaId: string, motivo: string): Promise<EstadoAcao> {
  if (!UUID.test(osId) || !UUID.test(vistoriaId)) return { erro: "Vistoria não encontrada." };
  const ctx = await contextoParaAcao(["dono"]);
  if (!ctx) return { erro: "Só o dono pode anular a vistoria." };
  const texto = motivo.trim();
  if (texto.length < 3) return { erro: "Explique o que aconteceu." };
  if (texto.length > 500) return { erro: "Máximo de 500 letras." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("anular_vistoria", { p_vistoria_id: vistoriaId, p_motivo: texto });
  if (error) {
    const t = traduzirErro(error, "os");
    return { erro: t === "Algo deu errado. Tente de novo." ? "Não foi possível anular a vistoria. Confira a internet e tente de novo." : t };
  }
  redirect(`/os/${osId}/vistoria?ver=${vistoriaId}&anulada=1`);
}
