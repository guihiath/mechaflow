/**
 * Fase 7 (painel, a receber, histórico): meses, dias e textos da tela (DESIGN §14).
 * Arquivo próprio da Fase 7 para não colidir com `formato.ts`. Tudo puro e testável:
 * nada aqui lê o relógio sozinho; quem chama passa `agora` (ou a data de hoje já calculada).
 * Dinheiro continua em centavos inteiros; a formatação é a de `formatarCentavos`.
 */

const FUSO = "America/Sao_Paulo";

/** Mês no formato da URL: "2026-10". */
export type Mes = `${number}-${number}`;

const REGEX_MES = /^(\d{4})-(0[1-9]|1[0-2])$/;

const NOMES_MES = [
  "janeiro",
  "fevereiro",
  "março",
  "abril",
  "maio",
  "junho",
  "julho",
  "agosto",
  "setembro",
  "outubro",
  "novembro",
  "dezembro",
] as const;

const diaEmSP = new Intl.DateTimeFormat("en-CA", { timeZone: FUSO, year: "numeric", month: "2-digit", day: "2-digit" });

/** Data do calendário em São Paulo: "2026-11-04". */
export function diaEmSaoPaulo(momento: Date | string): string {
  return diaEmSP.format(typeof momento === "string" ? new Date(momento) : momento);
}

export function ehMes(valor: unknown): valor is Mes {
  return typeof valor === "string" && REGEX_MES.test(valor);
}

/** Mês atual em São Paulo (nunca pela data do servidor). */
export function mesAtualEmSaoPaulo(agora: Date = new Date()): Mes {
  return diaEmSaoPaulo(agora).slice(0, 7) as Mes;
}

/** "2026-11-04" ou ISO -> "2026-11". */
export function mesDoDia(dia: string): Mes {
  return (dia.length > 10 ? diaEmSaoPaulo(dia) : dia).slice(0, 7) as Mes;
}

/**
 * Mês da URL (`?mes=`): inválido, futuro ou anterior ao primeiro registro -> mês atual (DESIGN §14.1).
 * Comparação de texto funciona porque o formato é fixo (AAAA-MM).
 */
export function lerMes(valor: string | null | undefined, mesAtual: Mes, primeiroMes?: Mes | null): Mes {
  if (!ehMes(valor) || valor > mesAtual) return mesAtual;
  if (primeiroMes && valor < primeiroMes) return mesAtual;
  return valor;
}

function partes(mes: Mes): [number, number] {
  const [a, m] = mes.split("-");
  return [Number(a), Number(m)];
}

function montar(ano: number, mes: number): Mes {
  return `${ano}-${String(mes).padStart(2, "0")}` as Mes;
}

export function mesAnterior(mes: Mes): Mes {
  const [a, m] = partes(mes);
  return m === 1 ? montar(a - 1, 12) : montar(a, m - 1);
}

export function mesSeguinte(mes: Mes): Mes {
  const [a, m] = partes(mes);
  return m === 12 ? montar(a + 1, 1) : montar(a, m + 1);
}

export function anoDoMes(mes: Mes): number {
  return partes(mes)[0];
}

/** "2026-10" -> "outubro de 2026" (no meio da frase). */
export function nomeMes(mes: Mes): string {
  const [a, m] = partes(mes);
  return `${NOMES_MES[m - 1]} de ${a}`;
}

/** "2026-10" -> "Outubro de 2026" (título, seletor). */
export function nomeMesTitulo(mes: Mes): string {
  const n = nomeMes(mes);
  return n.charAt(0).toUpperCase() + n.slice(1);
}

/** "2026-10" -> "outubro" (frases de ajuda: "Nas OS entregues em outubro."). */
export function nomeMesCurto(mes: Mes): string {
  return NOMES_MES[partes(mes)[1] - 1];
}

/** Meses do seletor, do mais novo para o mais antigo (DESIGN §14.2.1). Mês sem dados no meio continua. */
export function mesesDisponiveis(primeiroMes: Mes, mesAtual: Mes): Mes[] {
  const lista: Mes[] = [];
  let m = mesAtual;
  // Limite de segurança: 50 anos de meses.
  while (m >= primeiroMes && lista.length < 600) {
    lista.push(m);
    m = mesAnterior(m);
  }
  return lista;
}

/** Dias de calendário em São Paulo entre `desde` e hoje (DESIGN §14.4). Nunca negativo. */
export function diasDesde(desde: string, hoje: string): number {
  const a = desde.length > 10 ? diaEmSaoPaulo(desde) : desde;
  const [ya, ma, da] = a.split("-").map(Number);
  const [yb, mb, db] = hoje.split("-").map(Number);
  const dias = Math.round((Date.UTC(yb, mb - 1, db) - Date.UTC(ya, ma - 1, da)) / 86_400_000);
  return Math.max(0, dias);
}

/** 0 -> "hoje"; 1 -> "ontem"; N -> "há N dias". */
export function textoDias(dias: number): string {
  if (dias <= 0) return "hoje";
  if (dias === 1) return "ontem";
  return `há ${dias} dias`;
}

/**
 * Data absoluta curta (DESIGN §14.0, regra 6): "28/10" no ano de hoje, "28/10/2025" em outro ano.
 * `hoje` = "AAAA-MM-DD" em São Paulo.
 */
export function formatarDataCurta(iso: string, hoje: string): string {
  const dia = iso.length > 10 ? diaEmSaoPaulo(iso) : iso;
  const [a, m, d] = dia.split("-");
  return a === hoje.slice(0, 4) ? `${d}/${m}` : `${d}/${m}/${a}`;
}

/** "29/10/2026" (histórico da placa: sempre com ano). */
export function formatarDataLonga(iso: string): string {
  const [a, m, d] = (iso.length > 10 ? diaEmSaoPaulo(iso) : iso).split("-");
  return `${d}/${m}/${a}`;
}

/** "1 OS", "23 OS" (a sigla não muda no plural). */
export function textoOS(n: number): string {
  return `${n} OS`;
}

/** "1 cliente", "4 clientes". */
export function textoClientes(n: number): string {
  return n === 1 ? "1 cliente" : `${n} clientes`;
}

/**
 * Plural simples para "3 serviços · 2 peças · 5 fotos" (omite os zeros). Sem a divisão entre
 * serviços e peças (a leitura `historico_placa` só traz `qtd_itens`): "5 itens · 5 fotos".
 */
export function textoContagemHistorico(c: { servicos?: number; pecas?: number; itens?: number; fotos?: number | null }): string {
  const lista: string[] = [];
  const s = c.servicos ?? 0;
  const p = c.pecas ?? 0;
  if (s > 0) lista.push(s === 1 ? "1 serviço" : `${s} serviços`);
  if (p > 0) lista.push(p === 1 ? "1 peça" : `${p} peças`);
  if (s === 0 && p === 0 && c.itens && c.itens > 0) lista.push(c.itens === 1 ? "1 item" : `${c.itens} itens`);
  if (c.fotos && c.fotos > 0) lista.push(c.fotos === 1 ? "1 foto" : `${c.fotos} fotos`);
  return lista.length ? lista.join(" · ") : "Sem itens";
}

/** Textos fixos dos números do painel (DESIGN §14.2 e §14.12). "Faturado" nunca é nome de número. */
export const TEXTO_PAINEL = {
  hojeTitulo: "Hoje",
  hojeAjuda: "Não muda com o mês.",
  entregues: "Serviços entregues no mês",
  entreguesLista: "Serviços entregues",
  entreguesZero: "Nenhuma OS entregue neste mês.",
  recebido: "Dinheiro recebido no mês",
  recebidoLista: "Dinheiro recebido",
  recebidoZero: "Nenhum pagamento recebido neste mês.",
  aReceber: "A receber",
  aReceberZero: "Nenhuma OS entregue sem pagamento.",
  osAbertas: "OS abertas",
  naoPrecisamBater: "Os dois não precisam bater: uma OS entregue num mês pode ser paga em outro.",
  mesPassadoPodeMudar: "Este mês pode mudar se alguém registrar ou corrigir um pagamento com data dele.",
  foraCatalogo: "Fora do catálogo",
  semMecanico: "Sem mecânico",
} as const;
