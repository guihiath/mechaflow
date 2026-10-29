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

/** "Confira 2 campos marcados em vermelho." */
export function mensagemCampos(campos: Record<string, string | undefined>) {
  const n = Object.values(campos).filter(Boolean).length;
  return n === 1 ? "Confira o campo marcado em vermelho." : `Confira ${n} campos marcados em vermelho.`;
}

export function erroCampos(campos: Record<string, string | undefined>): EstadoAcao {
  return { campos, erro: mensagemCampos(campos) };
}
