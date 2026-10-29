import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { destinoPorContexto, HOME_POR_PAPEL, type MeuContexto, type Papel } from "@/lib/contexto";

/**
 * Camada de acesso (DAL). Le a sessao e o meu_contexto uma vez por requisicao.
 * Decide a navegacao; a RLS do banco continua sendo a protecao final.
 */
export const lerContexto = cache(async (): Promise<MeuContexto | null> => {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims?.sub) return null;
  const { data, error } = await supabase.rpc("meu_contexto").maybeSingle();
  if (error) throw new Error(`meu_contexto falhou: ${error.message}`);
  return data ?? null;
});

export type ContextoAtivo = MeuContexto & { papel: Papel; oficina_id: string; ativo: true };

function contextoValido(ctx: MeuContexto | null): ctx is ContextoAtivo {
  return Boolean(ctx?.papel && ctx.oficina_id && ctx.ativo === true && ctx.termos_aceitos);
}

/**
 * Para paginas: exige usuario logado, ativo, com oficina e termos aceitos.
 * Se `papeis` for informado e o papel nao estiver na lista, manda para a home do papel.
 */
export async function exigirContexto(papeis?: Papel[]): Promise<ContextoAtivo> {
  const ctx = await lerContexto();
  if (!contextoValido(ctx)) redirect(destinoPorContexto(ctx));
  if (papeis && !papeis.includes(ctx.papel)) redirect(HOME_POR_PAPEL[ctx.papel]);
  return ctx;
}

/** Para Server Actions: devolve o contexto ou null (sem redirecionar). */
export async function contextoParaAcao(papeis: Papel[]): Promise<ContextoAtivo | null> {
  const ctx = await lerContexto();
  if (!contextoValido(ctx) || !papeis.includes(ctx.papel)) return null;
  return ctx;
}
