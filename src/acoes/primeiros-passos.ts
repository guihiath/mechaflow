"use server";

import type { ResultadoPassos } from "@/components/inicio/cartao-primeiros-passos";
import { contextoParaAcao } from "@/lib/dal";
import { createClient } from "@/lib/supabase/server";

/**
 * "Dispensar" e "Desfazer" do cartão Primeiros passos (ARQUITETURA 15.15, DESIGN 15.4). Só o dono;
 * o banco confere de novo (42501 para os outros). Sem `refresh()`: o cartão já controla o que mostra,
 * e a próxima visita ao /inicio lê o estado gravado. Falta de internet o próprio cartão percebe.
 */
async function chamar(rpc: "dispensar_primeiros_passos" | "desfazer_dispensar_primeiros_passos"): Promise<ResultadoPassos> {
  if (!(await contextoParaAcao(["dono"]))) return { ok: false, erro: "servidor" };
  const supabase = await createClient();
  const { error } = await supabase.rpc(rpc);
  return error ? { ok: false, erro: "servidor" } : { ok: true };
}

export async function dispensarPrimeirosPassos(): Promise<ResultadoPassos> {
  return chamar("dispensar_primeiros_passos");
}

export async function desfazerDispensarPrimeirosPassos(): Promise<ResultadoPassos> {
  return chamar("desfazer_dispensar_primeiros_passos");
}
