import "server-only";

/**
 * Endereço público do app, usado no link que vai para o cliente (PLANO 19.6, item 11). Vem só da
 * variável de ambiente, nunca do cabeçalho da requisição: quem forja o Host não muda o link.
 * Sem a variável, ou com valor que não é http(s), devolve null.
 */
export function urlPublicaApp(): string | null {
  const valor = process.env.URL_PUBLICA_APP?.trim();
  if (!valor) return null;
  try {
    const url = new URL(valor);
    return url.protocol === "https:" || url.protocol === "http:" ? url.origin : null;
  } catch {
    return null;
  }
}
