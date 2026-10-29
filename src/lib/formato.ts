/**
 * Formatacao para a TELA. No banco e no codigo: centavos (inteiro) e UTC.
 */
const FUSO = "America/Sao_Paulo";

const moeda = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

/** 123456 -> "R$ 1.234,56". null -> "—". */
export function formatarCentavos(centavos: number | null | undefined): string {
  if (centavos === null || centavos === undefined) return "—";
  return moeda.format(centavos / 100);
}

/** Centavos -> texto editavel no campo ("1.234,56"). */
export function centavosParaCampo(centavos: number | null | undefined): string {
  if (centavos === null || centavos === undefined) return "";
  return (centavos / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * Texto digitado em reais -> centavos. Aceita "1.234,56", "1234,5", "1234", "R$ 10".
 * Vazio -> null. Invalido -> NaN.
 */
export function reaisParaCentavos(texto: string | null | undefined): number | null {
  const limpo = (texto ?? "").replace(/[R$\s]/g, "");
  if (!limpo) return null;
  if (!/^\d{1,3}(\.\d{3})*(,\d{1,2})?$|^\d+(,\d{1,2})?$/.test(limpo)) return Number.NaN;
  const [inteiro, frac = ""] = limpo.replace(/\./g, "").split(",");
  const centavos = Number(inteiro) * 100 + Number((frac + "00").slice(0, 2));
  return centavos > 2_147_483_647 ? Number.NaN : centavos;
}

/** ISO (UTC) -> "28/10/2026, 14:30" em America/Sao_Paulo. */
export function formatarDataHora(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: FUSO,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

export function formatarData(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: FUSO,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(iso));
}

// ---------------------------------------------------------------- placa

/** Mesma regra de public.normalizar_placa: maiusculas, so letras e numeros. */
export function normalizarPlaca(placa: string | null | undefined): string {
  return (placa ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/** Antigo (ABC1234) e Mercosul (ABC1D23). Mesma regex do CHECK do banco. */
export const REGEX_PLACA = /^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/;

export function placaValida(placa: string | null | undefined): boolean {
  return REGEX_PLACA.test(normalizarPlaca(placa));
}

/** Mercosul sem traco (ABC1D23); antiga com traco (ABC-1234). */
export function formatarPlaca(placa: string | null | undefined): string {
  const p = normalizarPlaca(placa).slice(0, 7);
  if (p.length >= 5 && /[0-9]/.test(p[4])) return `${p.slice(0, 3)}-${p.slice(3)}`;
  return p;
}

// ---------------------------------------------------------------- contato

export function soDigitos(texto: string | null | undefined): string {
  return (texto ?? "").replace(/\D/g, "");
}

/** "11988887777" -> "(11) 98888-7777". */
export function formatarTelefone(tel: string | null | undefined): string {
  const d = soDigitos(tel).slice(0, 11);
  if (d.length === 0) return "";
  if (d.length <= 2) return `(${d}`;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

/** CPF (11 digitos) ou CNPJ (14) com mascara. */
export function formatarDocumento(doc: string | null | undefined): string {
  const d = soDigitos(doc).slice(0, 14);
  if (d.length <= 11) {
    return d
      .replace(/^(\d{3})(\d)/, "$1.$2")
      .replace(/^(\d{3})\.(\d{3})(\d)/, "$1.$2.$3")
      .replace(/^(\d{3})\.(\d{3})\.(\d{3})(\d)/, "$1.$2.$3-$4");
  }
  return d
    .replace(/^(\d{2})(\d)/, "$1.$2")
    .replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/^(\d{2})\.(\d{3})\.(\d{3})(\d)/, "$1.$2.$3/$4")
    .replace(/\/(\d{4})(\d)/, "/$1-$2");
}

/** Link de WhatsApp para um telefone brasileiro (so digitos). */
export function linkWhatsApp(telefone: string | null | undefined, texto?: string): string | null {
  const d = soDigitos(telefone);
  if (d.length < 10) return null;
  const numero = d.length <= 11 ? `55${d}` : d;
  return `https://wa.me/${numero}${texto ? `?text=${encodeURIComponent(texto)}` : ""}`;
}

// ---------------------------------------------------------------- rotulos

export const ROTULO_PAPEL = { dono: "Dono", atendente: "Atendente", mecanico: "Mecânico" } as const;

export const ROTULO_MODO = {
  exige_orcamento: "Exige orçamento",
  servico_direto: "Serviço direto",
} as const;

export const ROTULO_TIPO_VEICULO = {
  caminhao: "Caminhão",
  carreta: "Carreta",
  onibus: "Ônibus",
  utilitario: "Utilitário",
  outro: "Outro",
} as const;

export const UNIDADES_PECA = ["un", "par", "jogo", "kit", "l", "kg", "m"] as const;
export type UnidadePeca = (typeof UNIDADES_PECA)[number];

export const ROTULO_UNIDADE: Record<UnidadePeca, string> = {
  un: "Unidade",
  par: "Par",
  jogo: "Jogo",
  kit: "Kit",
  l: "Litro",
  kg: "Quilo",
  m: "Metro",
};
