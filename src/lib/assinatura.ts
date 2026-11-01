/**
 * Assinatura da vistoria (F4-F1; DESIGN §12.9, ARQUITETURA 12.3 / V9).
 * Logica sem React: guardar os tracos, desenhar suave no canvas e exportar o PNG.
 *
 * Coordenadas: cada ponto fica em fracao (0-1) de um "papel" fixo (`largura` x `altura`
 * em px CSS, o tamanho da area quando a pessoa comecou a assinar). Na tela, o papel (unido ao
 * contorno do traco) e encaixado na area atual com a MESMA escala nos dois eixos, centralizado:
 * girar o celular ou redimensionar redesenha sem esticar e sem apagar, e ir e voltar nao encolhe
 * o desenho a cada giro (o papel nao muda; so a escala da tela).
 *
 * Exportacao: recorta no contorno do traco + 16 px de margem, fundo BRANCO (nao transparente,
 * decisao do CEO no F4-C1), lado maior ate 1200 px, PNG ate 512 KB (CHECK do banco).
 */

import { LIMITE_BYTES_ASSINATURA } from "@/lib/formato";

/** Ponto do traco: x/y em fracao do papel; `l` = espessura em px do papel. */
export type PontoAssinatura = { x: number; y: number; l: number };
export type TracoAssinatura = PontoAssinatura[];

/** Tudo o que precisa para redesenhar (guardar no rascunho do pai, se quiser). */
export type DadosAssinatura = {
  /** Tamanho do papel em px CSS (area de quando comecou a assinar). */
  largura: number;
  altura: number;
  tracos: TracoAssinatura[];
};

export type AssinaturaExportada = {
  blob: Blob;
  largura: number;
  altura: number;
  tamanhoBytes: number;
};

/** Tinta e papel: iguais nos dois temas (DESIGN §12.18). */
export const COR_TINTA = "#14161A";
export const COR_PAPEL = "#FFFFFF";
/** Espessura base do traco, em px do papel (DESIGN §12.9: 2,5 px). */
export const ESPESSURA_BASE = 2.5;
const MARGEM_EXPORTACAO = 16;
const LADO_MAXIMO_EXPORTACAO = 1200;
/** Escala maxima da exportacao (papel de 312 px -> ~936 px, perto dos ~900 da ARQUITETURA 12.3). */
const ESCALA_MAXIMA_EXPORTACAO = 3;
/** Pontos mais perto que isto (px do papel) nao entram: menos ruido, mesmo traco. */
const DISTANCIA_MINIMA = 0.6;

export const assinaturaVazia = (largura = 0, altura = 0): DadosAssinatura => ({ largura, altura, tracos: [] });

export function temTraco(d: DadosAssinatura | null | undefined): boolean {
  return !!d && d.tracos.some((t) => t.length > 0);
}

export type Retangulo = { x: number; y: number; w: number; h: number };

/** Contorno do traco em px do papel (inclui meia espessura). `null` sem traco. */
export function contornoTraco(d: DadosAssinatura): Retangulo | null {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const traco of d.tracos) {
    for (const p of traco) {
      const x = p.x * d.largura;
      const y = p.y * d.altura;
      const r = p.l / 2;
      if (x - r < x0) x0 = x - r;
      if (y - r < y0) y0 = y - r;
      if (x + r > x1) x1 = x + r;
      if (y + r > y1) y1 = y + r;
    }
  }
  if (!Number.isFinite(x0)) return null;
  return { x: x0, y: y0, w: Math.max(x1 - x0, 0), h: Math.max(y1 - y0, 0) };
}

/**
 * "Assinatura muito pequena" (DESIGN §12.9): o lado maior do contorno abaixo de 15 % da
 * largura do papel (ex.: um ponto). Rubrica curta passa.
 */
export function assinaturaPequenaDemais(d: DadosAssinatura): boolean {
  const c = contornoTraco(d);
  if (!c) return true;
  return Math.max(c.w, c.h) < d.largura * 0.15;
}

/** Papel na tela: escala unica + deslocamento (px CSS da area). */
export type Encaixe = { escala: number; dx: number; dy: number };

/**
 * Encaixa o papel (unido ao contorno do traco, que pode ter passado da borda do papel depois
 * de girar) na area `w` x `h`, mesma escala nos dois eixos, centralizado.
 * Papel do tamanho da area e traco dentro dele = escala 1, sem deslocamento.
 */
export function calcularEncaixe(d: DadosAssinatura, w: number, h: number): Encaixe {
  if (d.largura <= 0 || d.altura <= 0 || w <= 0 || h <= 0) return { escala: 1, dx: 0, dy: 0 };
  let x0 = 0;
  let y0 = 0;
  let x1 = d.largura;
  let y1 = d.altura;
  const c = contornoTraco(d);
  if (c) {
    x0 = Math.min(x0, c.x);
    y0 = Math.min(y0, c.y);
    x1 = Math.max(x1, c.x + c.w);
    y1 = Math.max(y1, c.y + c.h);
  }
  const cw = x1 - x0;
  const ch = y1 - y0;
  const escala = Math.min(w / cw, h / ch);
  return { escala, dx: (w - cw * escala) / 2 - x0 * escala, dy: (h - ch * escala) / 2 - y0 * escala };
}

/** Ponto da tela (px CSS da area) -> fracao do papel. */
export function telaParaPapel(d: DadosAssinatura, e: Encaixe, xTela: number, yTela: number) {
  return { x: (xTela - e.dx) / e.escala / d.largura, y: (yTela - e.dy) / e.escala / d.altura };
}

/**
 * Espessura pela velocidade (leve: 70 % a 125 % da base), suavizada com o ponto anterior.
 * `velocidade` em px do papel por ms.
 */
export function espessuraPorVelocidade(velocidade: number, anterior?: number): number {
  const v = Math.min(Math.max(velocidade, 0), 2.5) / 2.5;
  const alvo = ESPESSURA_BASE * (1.25 - 0.55 * v);
  return anterior === undefined ? alvo : anterior * 0.65 + alvo * 0.35;
}

/** Ponto novo entra no traco? (descarta os grudados no anterior). */
export function pontoAfastado(d: DadosAssinatura, anterior: PontoAssinatura | undefined, x: number, y: number) {
  if (!anterior) return true;
  const dx = (x - anterior.x) * d.largura;
  const dy = (y - anterior.y) * d.altura;
  return dx * dx + dy * dy >= DISTANCIA_MINIMA * DISTANCIA_MINIMA;
}

type Ctx = CanvasRenderingContext2D;

function prepararTinta(ctx: Ctx) {
  ctx.strokeStyle = COR_TINTA;
  ctx.fillStyle = COR_TINTA;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
}

/**
 * Desenha o pedaco `k` do traco (em px do papel; o `ctx` ja tem a transformacao).
 * Curva quadratica pelo ponto medio: o pedaco k (1 <= k <= n-2) vai do meio de (k-1, k) ate o
 * meio de (k, k+1), com controle no ponto k. O ultimo pedaco (k = n-1) e reto ate o fim.
 * Assim da para desenhar ao vivo (cada ponto novo fecha o pedaco anterior) e redesenhar igual.
 */
export function desenharPedaco(ctx: Ctx, d: DadosAssinatura, traco: TracoAssinatura, k: number) {
  const n = traco.length;
  const W = d.largura;
  const H = d.altura;
  if (n === 1 || k === 0) {
    if (n !== 1) return;
    const p = traco[0];
    ctx.beginPath();
    ctx.arc(p.x * W, p.y * H, Math.max(p.l, ESPESSURA_BASE) / 2 + 0.4, 0, Math.PI * 2);
    ctx.fill();
    return;
  }
  const meio = (a: PontoAssinatura, b: PontoAssinatura) => ({ x: ((a.x + b.x) / 2) * W, y: ((a.y + b.y) / 2) * H });
  const inicio = k === 1 ? { x: traco[0].x * W, y: traco[0].y * H } : meio(traco[k - 1], traco[k]);
  ctx.beginPath();
  ctx.moveTo(inicio.x, inicio.y);
  if (k <= n - 2) {
    const c = traco[k];
    const fim = meio(traco[k], traco[k + 1]);
    ctx.lineWidth = c.l;
    ctx.quadraticCurveTo(c.x * W, c.y * H, fim.x, fim.y);
  } else {
    const p = traco[n - 1];
    ctx.lineWidth = p.l;
    ctx.lineTo(p.x * W, p.y * H);
  }
  ctx.stroke();
}

/** Desenha um traco inteiro (fechado). */
export function desenharTraco(ctx: Ctx, d: DadosAssinatura, traco: TracoAssinatura) {
  if (traco.length === 1) {
    desenharPedaco(ctx, d, traco, 0);
    return;
  }
  for (let k = 1; k < traco.length; k++) desenharPedaco(ctx, d, traco, k);
}

/**
 * Redesenha tudo no canvas da tela: papel branco + tracos.
 * `dpr` = densidade da tela (ate 3); o canvas ja tem `width = largura CSS x dpr`.
 * `aberto` = traco em andamento (o ultimo pedaco reto so entra quando o dedo sai).
 */
export function redesenhar(
  ctx: Ctx,
  d: DadosAssinatura,
  encaixe: Encaixe,
  dpr: number,
  aberto?: TracoAssinatura | null,
) {
  const { canvas } = ctx;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = COR_PAPEL;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.setTransform(dpr * encaixe.escala, 0, 0, dpr * encaixe.escala, dpr * encaixe.dx, dpr * encaixe.dy);
  prepararTinta(ctx);
  for (const traco of d.tracos) {
    if (traco === aberto) {
      for (let k = 1; k < traco.length - 1; k++) desenharPedaco(ctx, d, traco, k);
      if (traco.length === 1) desenharPedaco(ctx, d, traco, 0);
    } else desenharTraco(ctx, d, traco);
  }
}

/** Liga a transformacao e a tinta para desenhar ao vivo (sem limpar). */
export function prepararCanvas(ctx: Ctx, encaixe: Encaixe, dpr: number) {
  ctx.setTransform(dpr * encaixe.escala, 0, 0, dpr * encaixe.escala, dpr * encaixe.dx, dpr * encaixe.dy);
  prepararTinta(ctx);
}

function canvasParaBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    if (typeof canvas.toBlob === "function") {
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob vazio"))), "image/png");
      return;
    }
    // Navegador antigo sem toBlob: passa pelo dataURL.
    try {
      const url = canvas.toDataURL("image/png");
      const bin = atob(url.split(",")[1] ?? "");
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      resolve(new Blob([bytes], { type: "image/png" }));
    } catch (e) {
      reject(e);
    }
  });
}

/**
 * Exporta o PNG: recorte no traco + 16 px de margem, fundo branco, lado maior <= 1200 px,
 * ate 512 KB (se passar, que na pratica nao acontece com traco grafite, reduz e tenta de novo).
 */
export async function exportarAssinatura(d: DadosAssinatura): Promise<AssinaturaExportada> {
  const c = contornoTraco(d);
  if (!c) throw new Error("Sem traço para exportar.");
  const larguraPapel = c.w + MARGEM_EXPORTACAO * 2;
  const alturaPapel = c.h + MARGEM_EXPORTACAO * 2;
  let escala = Math.min(ESCALA_MAXIMA_EXPORTACAO, LADO_MAXIMO_EXPORTACAO / Math.max(larguraPapel, alturaPapel));

  for (let tentativa = 0; tentativa < 5; tentativa++) {
    const largura = Math.max(1, Math.round(larguraPapel * escala));
    const altura = Math.max(1, Math.round(alturaPapel * escala));
    const canvas = document.createElement("canvas");
    canvas.width = largura;
    canvas.height = altura;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas indisponível.");
    ctx.fillStyle = COR_PAPEL;
    ctx.fillRect(0, 0, largura, altura);
    ctx.setTransform(escala, 0, 0, escala, (MARGEM_EXPORTACAO - c.x) * escala, (MARGEM_EXPORTACAO - c.y) * escala);
    prepararTinta(ctx);
    for (const traco of d.tracos) desenharTraco(ctx, d, traco);
    const blob = await canvasParaBlob(canvas);
    // Libera a memoria do canvas no Safari (limite de memoria de canvas no iOS).
    canvas.width = 0;
    canvas.height = 0;
    if (blob.size <= LIMITE_BYTES_ASSINATURA) return { blob, largura, altura, tamanhoBytes: blob.size };
    escala *= 0.7;
  }
  throw new Error("Assinatura grande demais.");
}
