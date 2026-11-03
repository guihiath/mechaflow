import type { Database, SituacaoLinkOrcamento } from "@/lib/supabase/database.types";

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

/** Escapa % e _ para usar texto do usuario em ilike ("%texto%"). */
export function padraoIlike(textoBusca: string) {
  return `%${textoBusca.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

/** Le um searchParam como string unica. */
export function param(valor: string | string[] | undefined): string {
  return (Array.isArray(valor) ? valor[0] : valor ?? "").trim();
}

// ---------------------------------------------------------------- rotulos

export const ROTULO_PAPEL = { dono: "Dono", atendente: "Atendente", mecanico: "Mecânico" } as const;

export const ROTULO_MODO = {
  exige_orcamento: "Exige orçamento",
  servico_direto: "Serviço direto",
} as const;

/** Situação do link do orçamento na tela do balcão (DESIGN §13.11; ARQUITETURA 13.6). */
export const ROTULO_SITUACAO_LINK: Record<SituacaoLinkOrcamento, string> = {
  aberto: "Link ativo",
  aprovado: "Cliente aprovou",
  recusado: "Cliente recusou",
  vencido: "Link vencido",
  substituido: "Link substituído",
  atualizado: "Orçamento alterado",
  encerrado: "Link cancelado",
  nao_encontrado: "Sem link",
  limite: "Muitas tentativas",
};

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

// ---------------------------------------------------------------- Fase 2 (OS)

const reaisInteiros = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

/** Total no card da lista, sem centavos: 345000 -> "R$ 3.450". null -> "". */
export function formatarReaisInteiros(centavos: number | null | undefined): string {
  if (centavos === null || centavos === undefined) return "";
  return reaisInteiros.format(centavos / 100);
}

const numero = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 });

/** KM / horimetro: 412300 -> "412.300". null -> "". */
export function formatarNumero(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "";
  return numero.format(n);
}

const quantidade = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 3, useGrouping: false });

/** Quantidade de item: 2 -> "2"; 2.5 -> "2,5". */
export function formatarQuantidade(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "";
  return quantidade.format(n);
}

/** Texto digitado ("2,5", "2.5", "3") -> numero. Vazio -> null. Invalido -> NaN. */
export function textoParaQuantidade(texto: string | null | undefined): number | null {
  const limpo = (texto ?? "").trim().replace(",", ".");
  if (!limpo) return null;
  if (!/^\d+(\.\d{1,3})?$/.test(limpo)) return Number.NaN;
  return Number(limpo);
}

const diaMes = new Intl.DateTimeFormat("pt-BR", { timeZone: FUSO, day: "2-digit", month: "2-digit" });
const hora = new Intl.DateTimeFormat("pt-BR", { timeZone: FUSO, hour: "2-digit", minute: "2-digit" });

/** ISO (UTC) -> "12/09". */
export function formatarDiaMes(iso: string | null | undefined): string {
  if (!iso) return "";
  return diaMes.format(new Date(iso));
}

/** ISO (UTC) -> "29/10 às 08:14" (America/Sao_Paulo). */
export function formatarDiaHora(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  return `${diaMes.format(d)} às ${hora.format(d)}`;
}

/**
 * Tempo desde um momento: "agora", "há 5 min", "há 3 h", "há 2 dias"; mais de 30 dias -> data.
 * `agora` pode vir do servidor para a lista inteira usar o mesmo relogio.
 */
export function formatarTempoDesde(iso: string | null | undefined, agora: Date = new Date()): string {
  if (!iso) return "";
  const ms = agora.getTime() - new Date(iso).getTime();
  const min = Math.floor(ms / 60_000);
  if (min < 1) return "agora";
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `há ${h} h`;
  const dias = Math.floor(h / 24);
  if (dias <= 30) return dias === 1 ? "há 1 dia" : `há ${dias} dias`;
  return formatarData(iso);
}

/** "OS #1042". */
export function formatarNumeroOS(numeroOS: number | string): string {
  return `OS #${numeroOS}`;
}

// ---------------------------------------------------------------- Fase 3 (fotos)

/** Tipos de foto na ordem da tela (DESIGN §11.4). Valores = enum `categoria_foto` do banco. */
export const CATEGORIAS_FOTO = ["diagnostico", "peca_defeituosa", "peca_trocada", "antes", "depois", "entrega", "outro"] as const;
export type CategoriaFoto = (typeof CATEGORIAS_FOTO)[number];

export const ROTULO_CATEGORIA_FOTO: Record<CategoriaFoto, string> = {
  diagnostico: "Diagnóstico",
  peca_defeituosa: "Peça com defeito",
  peca_trocada: "Peça trocada",
  antes: "Antes",
  depois: "Depois",
  entrega: "Entrega",
  outro: "Outro",
};

/** 1536000 -> "1,5 MB"; 84000 -> "82 KB". */
export function formatarBytes(bytes: number | null | undefined): string {
  if (bytes == null || !Number.isFinite(bytes)) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} MB`;
}

// ---------------------------------------------------------------- Fase 4 (vistoria)
// Valores = enums do banco (ARQUITETURA 12.2), com os tipos do database.types.ts: valor a mais
// na lista nao compila (satisfies) e rotulo faltando tambem nao (Record).
type Enums = Database["public"]["Enums"];

/** `status_vistoria`. */
export type StatusVistoria = Enums["status_vistoria"];
export const STATUS_VISTORIA = ["rascunho", "concluida", "anulada"] as const satisfies readonly StatusVistoria[];
export const ROTULO_STATUS_VISTORIA: Record<StatusVistoria, string> = {
  rascunho: "Vistoria em andamento",
  concluida: "Vistoria feita",
  anulada: "Vistoria anulada",
};

/** `tipo_vistoria`. */
export type TipoVistoria = Enums["tipo_vistoria"];
export const TIPOS_VISTORIA = ["entrada", "saida"] as const satisfies readonly TipoVistoria[];
export const ROTULO_TIPO_VISTORIA: Record<TipoVistoria, string> = {
  entrada: "Vistoria de entrada",
  saida: "Vistoria de saída",
};

/** `nivel_combustivel`, do menor para o maior (DESIGN §12.4). */
export type NivelCombustivel = Enums["nivel_combustivel"];
export const NIVEIS_COMBUSTIVEL = ["reserva", "um_quarto", "meio", "tres_quartos", "cheio"] as const satisfies readonly NivelCombustivel[];
/** Rotulo curto do botao ("Reserva", "1/4"...). */
export const ROTULO_COMBUSTIVEL: Record<NivelCombustivel, string> = {
  reserva: "Reserva",
  um_quarto: "1/4",
  meio: "1/2",
  tres_quartos: "3/4",
  cheio: "Cheio",
};
/** Texto para leitor de tela e resumo ("1/4 do tanque"). */
export const ROTULO_COMBUSTIVEL_LONGO: Record<NivelCombustivel, string> = {
  reserva: "na reserva",
  um_quarto: "1/4 do tanque",
  meio: "1/2 tanque",
  tres_quartos: "3/4 do tanque",
  cheio: "tanque cheio",
};
/** Fracao do medidor (reserva = 1/8). */
export const FRACAO_COMBUSTIVEL: Record<NivelCombustivel, number> = {
  reserva: 0.125,
  um_quarto: 0.25,
  meio: 0.5,
  tres_quartos: 0.75,
  cheio: 1,
};

/** `situacao_item_vistoria` (NULL no banco = item ainda sem marcar). */
export type SituacaoItemVistoria = Enums["situacao_item_vistoria"];
export const SITUACOES_ITEM_VISTORIA = ["ok", "com_problema", "nao_se_aplica"] as const satisfies readonly SituacaoItemVistoria[];
/** Rotulo do botao do checklist (DESIGN §12.5: nao abreviar "Não se aplica"). */
export const ROTULO_SITUACAO_ITEM: Record<SituacaoItemVistoria, string> = {
  ok: "Ok",
  com_problema: "Problema",
  nao_se_aplica: "Não se aplica",
};
/** Rotulo na leitura/resumo ("13 ok · 2 com problema · 1 não se aplica"). */
export const ROTULO_SITUACAO_ITEM_LEITURA: Record<SituacaoItemVistoria, string> = {
  ok: "Ok",
  com_problema: "Com problema",
  nao_se_aplica: "Não se aplica",
};

/** `lado_avaria`, na ordem da grade (DESIGN §12.6). */
export type LadoAvaria = Enums["lado_avaria"];
export const LADOS_AVARIA = ["frente", "traseira", "lateral_esquerda", "lateral_direita", "cabine", "outro"] as const satisfies readonly LadoAvaria[];
export const ROTULO_LADO_AVARIA: Record<LadoAvaria, string> = {
  frente: "Frente",
  traseira: "Traseira",
  lateral_esquerda: "Lateral esquerda",
  lateral_direita: "Lateral direita",
  cabine: "Cabine",
  outro: "Outro",
};

/** `tipo_foto_vistoria` (complemento = foto com complemento_id, tipo "outro"; ARQUITETURA V19). */
export type TipoFotoVistoria = Enums["tipo_foto_vistoria"];
export const TIPOS_FOTO_VISTORIA = ["avaria", "painel", "outro"] as const satisfies readonly TipoFotoVistoria[];
export const ROTULO_TIPO_FOTO_VISTORIA: Record<TipoFotoVistoria, string> = {
  avaria: "Avaria",
  painel: "Painel",
  outro: "Outro",
};
export const ROTULO_FOTO_COMPLEMENTO = "Complemento";

/** `motivo_sem_assinatura`. */
export type MotivoSemAssinatura = Enums["motivo_sem_assinatura"];
export const MOTIVOS_SEM_ASSINATURA = ["motorista_ausente", "recusou"] as const satisfies readonly MotivoSemAssinatura[];
/** Opcao da pergunta "Por quê?" (DESIGN §12.8). */
export const ROTULO_MOTIVO_SEM_ASSINATURA: Record<MotivoSemAssinatura, string> = {
  motorista_ausente: "Motorista não está aqui",
  recusou: "Recusou assinar",
};
/** Texto da etiqueta (DESIGN §12.1). */
export const ETIQUETA_SEM_ASSINATURA: Record<MotivoSemAssinatura, string> = {
  motorista_ausente: "Sem assinatura: motorista ausente",
  recusou: "Sem assinatura: recusou assinar",
};

/** Limites da vistoria (ARQUITETURA 12.2/12.3). */
export const LIMITE_FOTOS_VISTORIA = 30;
export const LIMITE_FOTOS_AVARIA = 3;
/** Assinatura PNG: no maximo 512 KB (CHECK em `vistorias.assinatura_tamanho_bytes`). */
export const LIMITE_BYTES_ASSINATURA = 512 * 1024;

/**
 * Código de conferência da vistoria (12 primeiros caracteres do hash SHA-256 da conclusão,
 * ARQUITETURA 12.4), em grupos de 4 para ler em voz alta: "3F9A-1C77-B2E0". Igual na tela e no PDF.
 */
export function formatarCodigoConferencia(hash: string | null | undefined): string {
  const h = (hash ?? "").replace(/[^0-9a-f]/gi, "").slice(0, 12).toUpperCase();
  return (h.match(/.{1,4}/g) ?? []).join("-");
}

/** "2 com problema · 13 ok": junta as contagens e omite as que deram zero (revisão F4, M3). */
export function juntarContagens(partes: readonly (readonly [number, string])[]): string {
  return partes
    .filter(([n]) => n > 0)
    .map(([n, texto]) => `${n} ${texto}`)
    .join(" · ");
}

const INICIO_MOTIVO_OS_ERRADA = /^feita na os errada\s*[:.-]?\s*/i;

/**
 * Motivo da anulação para ler (tela e PDF, revisão F4, M7). O banco guarda
 * "Feita na OS errada: era o caminhão da OS #6"; aqui vira
 * "feita na OS errada (era o caminhão da OS #6)." Outro texto só ganha o ponto final.
 */
export function formatarMotivoAnulacao(motivo: string): string {
  const t = motivo.trim().replace(/[.\s]+$/, "");
  if (!t) return "";
  if (!INICIO_MOTIVO_OS_ERRADA.test(t)) return `${t}.`;
  const detalhe = t.replace(INICIO_MOTIVO_OS_ERRADA, "");
  return detalhe ? `feita na OS errada (${detalhe}).` : "feita na OS errada.";
}
