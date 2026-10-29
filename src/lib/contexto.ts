import type { Database } from "@/lib/supabase/database.types";

export type MeuContexto = Database["public"]["Functions"]["meu_contexto"]["Returns"][number];
export type Papel = Database["public"]["Enums"]["papel_usuario"];

/** Tela inicial de cada papel. */
export const HOME_POR_PAPEL: Record<Papel, string> = {
  dono: "/inicio",
  atendente: "/clientes",
  mecanico: "/minhas-os",
};

/**
 * Para onde mandar o usuario depois do login (ARQUITETURA 7.3).
 * null = sem sessao.
 */
export function destinoPorContexto(ctx: MeuContexto | null): string {
  if (!ctx) return "/login";
  if (!ctx.oficina_id && ctx.ativo === null) return "/bem-vindo";
  if (ctx.ativo === false) return "/desativado";
  if (!ctx.termos_aceitos) return "/aceitar-termos";
  return ctx.papel ? HOME_POR_PAPEL[ctx.papel] : "/bem-vindo";
}

/** Aceita so caminhos internos (evita redirecionar para outro site). */
export function caminhoSeguro(voltar: string | null | undefined): string | null {
  if (!voltar || !voltar.startsWith("/") || voltar.startsWith("//") || voltar.includes("\\")) return null;
  return voltar;
}
