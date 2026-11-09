/**
 * Suporte do MechaFlow pelo WhatsApp (DESIGN §15.5 e §15.6).
 * O número vem de NEXT_PUBLIC_SUPORTE_WHATSAPP (só dígitos, com DDI e DDD: 5511999999999).
 * Não é segredo (vai no HTML do link), mas não fica escrito no código.
 * Sem a variável (ou com valor inválido), todo link do suporte some: nunca um `wa.me/` vazio.
 */

/** Mensagem pronta da página inicial (§15.2.1). */
export const MENSAGEM_SUPORTE_PUBLICO = "Olá! Vi o MechaFlow e quero saber mais para a minha oficina.";

/** Mensagem pronta dentro do app (§15.5): só nome e oficina; sem e-mail, id nem placa. Termina em espaço. */
export function mensagemSuporteApp(nome: string | null, oficina: string | null): string {
  const n = nome?.trim();
  const o = oficina?.trim();
  const apresentacao = n && o ? `Sou ${n}, da ${o}. ` : n ? `Sou ${n}. ` : o ? `Sou da ${o}. ` : "";
  return `Olá! ${apresentacao}Preciso de ajuda com o MechaFlow: `;
}

/** Número válido (10 a 15 dígitos) ou null. */
export function numeroSuporte(valor: string | undefined = process.env.NEXT_PUBLIC_SUPORTE_WHATSAPP): string | null {
  const digitos = (valor ?? "").replace(/\D/g, "");
  return digitos.length >= 10 && digitos.length <= 15 ? digitos : null;
}

/**
 * URL do WhatsApp do suporte com a mensagem pronta, ou null sem a variável.
 * `numero` só existe para a vitrine simular com e sem a variável.
 */
export function linkWhatsAppSuporte(mensagem: string, numero: string | null = numeroSuporte()): string | null {
  if (!numero) return null;
  return `https://wa.me/${numero}?text=${encodeURIComponent(mensagem)}`;
}
