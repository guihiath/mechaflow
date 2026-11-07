import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, rgb, type PDFImage, type PDFPage, type RGB } from "pdf-lib";
import { formatarData } from "../formato";
import { limpar, quebrarTexto, type Fonte } from "./texto";

/*
 * Base comum dos PDFs do MechaFlow (vistoria F4-B6; OS e resumo final F7-B3), DESIGN §12.17:
 * A4 em pé, margens de 15 mm, Barlow 500/700, Barlow Condensed 700 no título e IBM Plex Mono 600
 * na placa/OS (fontes embutidas: acentos certos). Grafite sobre branco, amarelo só na faixa do topo.
 *
 * Puro (sem Supabase nem fs): as fontes chegam em bytes (`./fontes.ts` lê do disco no servidor).
 * Cada documento monta o miolo; aqui ficam página, quebra, cabeçalho, placa, imagens e rodapé.
 */

export type { Fonte } from "./texto";
export { quebrarTexto } from "./texto";

/** Bytes das 4 fontes embutidas. */
export type FontesPdf = { normal: Uint8Array; negrito: Uint8Array; condensada: Uint8Array; mono: Uint8Array };
/** As 4 fontes já embutidas no documento. */
export type FontesEmbutidas = { normal: Fonte; negrito: Fonte; condensada: Fonte; mono: Fonte };

/** Bytes de uma imagem já baixada (JPEG das fotos, PNG da assinatura). */
export type ImagemPdf = { bytes: Uint8Array };
/** Imagem embutida; null = arquivo que não pôde ser lido. */
export type Imagem = PDFImage | null;

// ------------------------------------------------------------------ medidas e cores

export const MM = 72 / 25.4;
export const PAGINA: [number, number] = [595.28, 841.89]; // A4
export const MARGEM = 15 * MM;
export const LARGURA = PAGINA[0] - 2 * MARGEM;
export const TOPO = PAGINA[1] - MARGEM;
/** Abaixo disso só o rodapé. */
export const FUNDO = MARGEM + 22;

export const GRAFITE = rgb(0.078, 0.086, 0.102); // #14161A
export const SUAVE = rgb(0.33, 0.35, 0.38);
export const BORDA = rgb(0.72, 0.73, 0.75);
export const FUNDO_FOTO = rgb(0.95, 0.95, 0.95);
export const AMARELO = rgb(0.961, 0.722, 0); // #F5B800
export const BRANCO = rgb(1, 1, 1);

const FUSO = "America/Sao_Paulo";
const fmtHora = new Intl.DateTimeFormat("pt-BR", { timeZone: FUSO, hour: "2-digit", minute: "2-digit" });

/** "31/10/2026 às 08:40" (America/Sao_Paulo). */
export function dataHora(iso: string | null | undefined): string {
  if (!iso) return "—";
  return `${formatarData(iso)} às ${fmtHora.format(new Date(iso))}`;
}

// ------------------------------------------------------------------ documento

export type MetadadosPdf = { titulo: string; autor: string; agora: Date };

/**
 * Cria o documento com os metadados e embute as fontes com subconjunto (só os caracteres usados,
 * para o arquivo ficar pequeno).
 */
export async function criarDocumento(meta: MetadadosPdf, fontesBytes: FontesPdf): Promise<{ pdf: PDFDocument; fontes: FontesEmbutidas }> {
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  pdf.setTitle(meta.titulo);
  pdf.setAuthor(meta.autor);
  pdf.setCreator("MechaFlow");
  pdf.setProducer("MechaFlow");
  pdf.setLanguage("pt-BR");
  pdf.setCreationDate(meta.agora);
  pdf.setModificationDate(meta.agora);

  const carregar = async (bytes: Uint8Array): Promise<Fonte> => {
    const f = await pdf.embedFont(bytes, { subset: true });
    return { f, caracteres: new Set(f.getCharacterSet()) };
  };
  const [normal, negrito, condensada, mono] = await Promise.all([
    carregar(fontesBytes.normal),
    carregar(fontesBytes.negrito),
    carregar(fontesBytes.condensada),
    carregar(fontesBytes.mono),
  ]);
  return { pdf, fontes: { normal, negrito, condensada, mono } };
}

// ------------------------------------------------------------------ escrita com quebra de página

/** Parte de uma linha com fontes misturadas; `mono` = placa / números. */
export type ParteTexto = { texto: string; mono?: boolean };

export class Escritor {
  pagina!: PDFPage;
  y = TOPO;
  readonly paginas: PDFPage[] = [];

  constructor(
    readonly pdf: PDFDocument,
    readonly fontes: FontesEmbutidas,
    /** Cabeçalho das páginas seguintes; a parte `mono` é a placa (§12.17). */
    readonly cabecalhoCurto: ParteTexto[],
  ) {}

  novaPagina(primeira = false) {
    this.pagina = this.pdf.addPage(PAGINA);
    this.paginas.push(this.pagina);
    this.y = TOPO;
    if (!primeira) {
      // Cabeçalho curto (placa, OS) nas páginas seguintes; o número da página vai no rodapé.
      let x = MARGEM;
      for (const parte of this.cabecalhoCurto) {
        const fonte = parte.mono ? this.fontes.mono : this.fontes.negrito;
        this.escrever(parte.texto, x, this.y - 10, fonte, 10, SUAVE);
        x += this.largura(parte.texto, fonte, 10);
      }
      this.linha(this.y - 16);
      this.y -= 28;
    }
  }

  /** Garante `altura` livre; senão abre outra página. Devolve true se abriu. */
  garantir(altura: number): boolean {
    if (this.y - altura < FUNDO) {
      this.novaPagina();
      return true;
    }
    return false;
  }

  /** Espaço útil numa página nova (para decidir se um bloco "não quebra"). */
  get alturaPaginaNova() {
    return TOPO - 28 - FUNDO;
  }

  linha(y: number, espessura = 0.75, cor: RGB = BORDA) {
    this.pagina.drawLine({ start: { x: MARGEM, y }, end: { x: MARGEM + LARGURA, y }, thickness: espessura, color: cor });
  }

  escrever(texto: string, x: number, y: number, fonte: Fonte, tamanho: number, cor: RGB = GRAFITE) {
    const t = limpar(texto, fonte);
    if (t) this.pagina.drawText(t, { x, y, size: tamanho, font: fonte.f, color: cor });
  }

  largura(texto: string, fonte: Fonte, tamanho: number) {
    return fonte.f.widthOfTextAtSize(limpar(texto, fonte), tamanho);
  }

  quebrar(texto: string, fonte: Fonte, tamanho: number, largura: number): string[] {
    return quebrarTexto(limpar(texto, fonte, true), (s) => fonte.f.widthOfTextAtSize(s, tamanho), largura);
  }

  /** Parágrafo com quebra de linha e de página. */
  paragrafo(texto: string, opcoes: { fonte?: Fonte; tamanho?: number; cor?: RGB; x?: number; largura?: number; entrelinha?: number } = {}) {
    const fonte = opcoes.fonte ?? this.fontes.normal;
    const tamanho = opcoes.tamanho ?? 10.5;
    const x = opcoes.x ?? MARGEM;
    const largura = opcoes.largura ?? LARGURA - (x - MARGEM);
    const entre = opcoes.entrelinha ?? tamanho * 1.35;
    for (const l of this.quebrar(texto, fonte, tamanho, largura)) {
      this.garantir(entre);
      this.y -= entre;
      this.escrever(l, x, this.y + entre - tamanho, fonte, tamanho, opcoes.cor);
    }
  }

  /** Título de seção; leva junto pelo menos `minimo` pt do conteúdo. */
  secao(titulo: string, minimo = 40) {
    this.y -= 14;
    this.garantir(16 + minimo);
    this.escrever(titulo.toUpperCase(), MARGEM, this.y - 11, this.fontes.negrito, 11);
    this.y -= 18;
  }
}

// ------------------------------------------------------------------ cabeçalho da 1ª página

export type Cabecalho = {
  /** Título à direita, uma linha por item (Barlow Condensed 20). */
  titulo: string[];
  /** "OS #1042", à direita, em mono. */
  numero: string;
  /** Nome da oficina, à esquerda (vai em maiúsculas). */
  oficina: string;
  /** Linhas pequenas abaixo do nome ("CNPJ …", telefone). */
  detalhes: string[];
};

/** Faixa amarela no topo + oficina à esquerda + título e número à direita. Deixa `e.y` abaixo do bloco. */
export function desenharCabecalho(e: Escritor, c: Cabecalho) {
  const { normal, negrito, condensada, mono } = e.fontes;
  e.pagina.drawRectangle({ x: 0, y: PAGINA[1] - 3 * MM, width: PAGINA[0], height: 3 * MM, color: AMARELO });

  const dir = MARGEM + LARGURA;
  let yd = TOPO;
  for (const t of c.titulo) {
    yd -= 20;
    e.escrever(t, dir - e.largura(t, condensada, 20), yd, condensada, 20);
  }
  yd -= 17;
  e.escrever(c.numero, dir - e.largura(c.numero, mono, 13), yd, mono, 13);
  const larguraDireita = Math.max(...c.titulo.map((t) => e.largura(t, condensada, 20)), e.largura(c.numero, mono, 13));

  let ye = TOPO;
  for (const l of e.quebrar(c.oficina.toUpperCase(), negrito, 16, LARGURA - larguraDireita - 16)) {
    ye -= 18;
    e.escrever(l, MARGEM, ye, negrito, 16);
  }
  for (const d of c.detalhes) {
    ye -= 13;
    e.escrever(d, MARGEM, ye, normal, 9, SUAVE);
  }
  e.y = Math.min(ye, yd) - 16;
}

/** Placa com borda (mono 18) e o veículo ao lado, numa linha. */
export function desenharPlaca(e: Escritor, placa: string, veiculo: string | null) {
  const { normal, mono } = e.fontes;
  const placaL = e.largura(placa, mono, 18);
  e.y -= 26;
  e.pagina.drawRectangle({ x: MARGEM, y: e.y, width: placaL + 14, height: 26, borderColor: GRAFITE, borderWidth: 1.5 });
  e.escrever(placa, MARGEM + 7, e.y + 7.5, mono, 18);
  if (veiculo) {
    const xv = MARGEM + placaL + 26;
    const linhas = e.quebrar(veiculo, normal, 13, MARGEM + LARGURA - xv);
    e.escrever(linhas[0] ?? "", xv, e.y + 8.5, normal, 13);
  }
  e.y -= 6;
}

// ------------------------------------------------------------------ imagens

export async function embutir(pdf: PDFDocument, img: ImagemPdf | null): Promise<Imagem> {
  if (!img) return null;
  const b = img.bytes;
  try {
    if (b[0] === 0xff && b[1] === 0xd8) return await pdf.embedJpg(b);
    if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return await pdf.embedPng(b);
  } catch {
    // Arquivo estragado: mostra o quadro "Foto não pôde ser lida" em vez de derrubar o PDF.
  }
  return null;
}

/** Imagem inteira dentro da caixa (sem cortar), centralizada. */
export function desenharContida(e: Escritor, img: Imagem, x: number, y: number, l: number, a: number, fundo = true) {
  if (fundo) e.pagina.drawRectangle({ x, y, width: l, height: a, color: FUNDO_FOTO });
  if (!img) {
    const t = "Foto não pôde ser lida";
    const tl = e.largura(t, e.fontes.normal, 9);
    e.escrever(t, x + (l - tl) / 2, y + a / 2 - 3, e.fontes.normal, 9, SUAVE);
  } else {
    const escala = Math.min(l / img.width, a / img.height);
    const il = img.width * escala;
    const ia = img.height * escala;
    e.pagina.drawImage(img, { x: x + (l - il) / 2, y: y + (a - ia) / 2, width: il, height: ia });
  }
  if (fundo) e.pagina.drawRectangle({ x, y, width: l, height: a, borderColor: BORDA, borderWidth: 0.5 });
}

// ------------------------------------------------------------------ rodapé

/**
 * Rodapé em todas as páginas: "Gerado pelo MechaFlow em … · [extras] · Pág. 1 de 3".
 * `porPagina` desenha algo a mais na página logo depois do rodapé (marca d'água da anulada).
 */
export function desenharRodape(e: Escritor, agora: Date, extras: string[], porPagina?: (p: PDFPage) => void) {
  const total = e.paginas.length;
  e.paginas.forEach((p, i) => {
    e.pagina = p;
    e.linha(MARGEM + 12, 0.5);
    const partes = [`Gerado pelo MechaFlow em ${dataHora(agora.toISOString())}`, ...extras, `Pág. ${i + 1} de ${total}`];
    e.escrever(partes.join(" · "), MARGEM, MARGEM, e.fontes.normal, 8, SUAVE);
    porPagina?.(p);
  });
}
