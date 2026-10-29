/** Estado devolvido pelas Server Actions de formulario. */
export type EstadoAcao = {
  ok?: boolean;
  erro?: string;
  mensagem?: string;
  /** Erro por campo (chave = name do campo). */
  campos?: Record<string, string | undefined>;
  /** Dados extras (ex.: token do convite). */
  dados?: Record<string, string>;
} | null;

/** Le um campo de texto do FormData ja sem espacos nas pontas. */
export function texto(dados: FormData, nome: string): string {
  const v = dados.get(nome);
  return typeof v === "string" ? v.trim() : "";
}

/** Texto ou null quando vazio. */
export function textoOuNull(dados: FormData, nome: string): string | null {
  return texto(dados, nome) || null;
}

export function temErros(campos: Record<string, string | undefined>) {
  return Object.values(campos).some(Boolean);
}
