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
