/**
 * Regras do "Gerar link de senha" (ARQUITETURA 15.12, passos 3 e 5), numa função pura: sem rede e
 * sem import de módulo do app, para o `testar-staging.mjs` chamar direto.
 */

export type PapelLinkSenha = "dono" | "atendente" | "mecanico";

export type CodigoRecusaLinkSenha = "nao_pode_alterar_a_si_mesmo" | "papel_invalido" | "membro_desativado";

/** Quem pede (já conferido: logado, ativo, termos e papel dono) e o alvo lido pela RLS. */
export function podeGerarLinkSenha(
  contexto: { usuario_id: string },
  alvo: { id: string; papel: PapelLinkSenha; ativo: boolean },
): CodigoRecusaLinkSenha | null {
  // O próprio dono usa o "Esqueci a senha" por e-mail.
  if (alvo.id === contexto.usuario_id) return "nao_pode_alterar_a_si_mesmo";
  // Um dono não toma a conta de outro: cada dono usa o próprio e-mail.
  if (alvo.papel === "dono") return "papel_invalido";
  if (!alvo.ativo) return "membro_desativado";
  return null;
}

/** Validade do link de recuperação no Auth (ARQUITETURA 15.4): 1 hora. */
export const VALIDADE_LINK_SENHA_MS = 60 * 60 * 1000;

/** Link que abre a página "Continuar" (o token só é trocado no POST, ARQUITETURA 15.5). */
export function montarLinkSenha(base: string, tokenHash: string): string {
  const q = new URLSearchParams({ token_hash: tokenHash, type: "recovery", next: "/redefinir-senha" });
  return `${base}/auth/confirmar?${q.toString()}`;
}
