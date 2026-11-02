import fontkit from "@pdf-lib/fontkit";
import { degrees, PDFDocument, rgb, type PDFFont, type PDFImage, type PDFPage, type RGB } from "pdf-lib";
import {
  formatarCodigoConferencia,
  formatarData,
  formatarMotivoAnulacao,
  formatarNumero,
  formatarNumeroOS,
  FRACAO_COMBUSTIVEL,
  juntarContagens,
  ROTULO_COMBUSTIVEL,
  ROTULO_LADO_AVARIA,
  ROTULO_TIPO_VISTORIA,
  type LadoAvaria,
  type MotivoSemAssinatura,
  type NivelCombustivel,
  type SituacaoItemVistoria,
  type TipoVistoria,
} from "../formato";

/*
 * PDF da vistoria (F4-B6, DESIGN §12.17): A4 em pé, margens de 15 mm, Barlow 500/700,
 * Barlow Condensed 700 no título e IBM Plex Mono 600 na placa/OS (fontes embutidas: acentos
 * certos). Grafite sobre branco, amarelo só na faixa do topo (sai bem em impressora P&B e no
 * WhatsApp). Nenhum valor em dinheiro e nenhum telefone: o mesmo arquivo serve a todos os papéis.
 *
 * Este módulo é puro (sem Supabase nem fs): recebe os dados já travados e os bytes das imagens
 * e devolve o PDF. Quem busca e escolhe as fotos é `pdf-dados.ts`.
 */

// ------------------------------------------------------------------ tipos

/** Bytes de uma imagem já baixada (JPEG das fotos, PNG da assinatura). */
export type ImagemPdf = { bytes: Uint8Array };

export type ItemPdf = { descricao: string; situacao: SituacaoItemVistoria | null; observacao: string | null };
export type AvariaPdf = { lado: LadoAvaria; descricao: string | null; fotos: ImagemPdf[] };
export type ComplementoPdf = { texto: string | null; criadoEm: string; criadoPor: string; fotos: ImagemPdf[] };

export type DadosPdfVistoria = {
  oficina: { nome: string; cnpj: string | null };
  tipo: TipoVistoria;
  numeroOS: number;
  /** Placa já formatada (ABC1D23 / ABC-1234). */
  placa: string;
  /** "Volvo FH 540 · 2019" (ou null). */
  veiculo: string | null;
  cliente: string | null;
  concluidaEm: string | null;
  concluidaPor: string | null;
  km: number | null;
  horimetro: number | null;
  combustivel: NivelCombustivel | null;
  itens: ItemPdf[];
  semAvarias: boolean;
  avarias: AvariaPdf[];
  painel: ImagemPdf[];
  /** null = não informado; [] = nenhum. */
  objetos: string[] | null;
  observacoes: string | null;
  assinatura:
    | { tipo: "assinada"; imagem: ImagemPdf | null; nome: string; em: string | null }
    | { tipo: "sem"; motivo: MotivoSemAssinatura; nome: string | null }
    | null;
  complementos: ComplementoPdf[];
  hash: string | null;
  anulada: { em: string; por: string; motivo: string } | null;
};

export type FontesPdf = { normal: Uint8Array; negrito: Uint8Array; condensada: Uint8Array; mono: Uint8Array };

// ------------------------------------------------------------------ medidas e cores

const MM = 72 / 25.4;
const PAGINA: [number, number] = [595.28, 841.89]; // A4
const MARGEM = 15 * MM;
const LARGURA = PAGINA[0] - 2 * MARGEM;
const TOPO = PAGINA[1] - MARGEM;
/** Abaixo disso só o rodapé. */
const FUNDO = MARGEM + 22;

const GRAFITE = rgb(0.078, 0.086, 0.102); // #14161A
const SUAVE = rgb(0.33, 0.35, 0.38);
const BORDA = rgb(0.72, 0.73, 0.75);
const FUNDO_FOTO = rgb(0.95, 0.95, 0.95);
const AMARELO = rgb(0.961, 0.722, 0); // #F5B800
const BRANCO = rgb(1, 1, 1);

/** Célula de foto: 85 mm de largura, 4:3; 2 por linha (DESIGN §12.17). */
const FOTO_L = 85 * MM;
const FOTO_A = FOTO_L * 0.75;
const FOTO_ESPACO = LARGURA - 2 * FOTO_L;
const FOTO_ESPACO_V = 8;
/** Painel: 3 por linha (~58 mm), para a assinatura caber na 1ª página em vistoria curta. */
const PAINEL_L = (LARGURA - 2 * FOTO_ESPACO) / 3;
const PAINEL_A = PAINEL_L * 0.75;

const FUSO = "America/Sao_Paulo";
const fmtHora = new Intl.DateTimeFormat("pt-BR", { timeZone: FUSO, hour: "2-digit", minute: "2-digit" });

/** "31/10/2026 às 08:40" (America/Sao_Paulo). */
function dataHora(iso: string | null | undefined): string {
  if (!iso) return "—";
  return `${formatarData(iso)} às ${fmtHora.format(new Date(iso))}`;
}

const ROTULO_SEM_ASSINATURA: Record<MotivoSemAssinatura, string> = {
  motorista_ausente: "motorista ausente",
  recusou: "recusou assinar",
};

// ------------------------------------------------------------------ escrita com quebra de página

type Fonte = { f: PDFFont; caracteres: Set<number> };

class Escritor {
  pagina!: PDFPage;
  y = TOPO;
  readonly paginas: PDFPage[] = [];

  constructor(
    readonly pdf: PDFDocument,
    readonly fontes: { normal: Fonte; negrito: Fonte; condensada: Fonte; mono: Fonte },
    /** Cabeçalho das páginas seguintes; a parte `mono` é a placa (§12.17). */
    readonly cabecalhoCurto: { texto: string; mono?: boolean }[],
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

/** Troca caracteres que a fonte não tem (emoji etc.) e controles; normaliza acentos (NFC). */
function limpar(texto: string, fonte: Fonte, manterQuebras = false): string {
  let s = "";
  for (const ch of texto.normalize("NFC")) {
    const cp = ch.codePointAt(0)!;
    if (ch === "\n" && manterQuebras) s += ch;
    else if (cp < 32 || (cp >= 0x7f && cp < 0xa0)) s += " ";
    else if (fonte.caracteres.has(cp)) s += ch;
    else if (/\s/.test(ch)) s += " ";
    else if (cp >= 0x1f000 || (cp >= 0xfe00 && cp <= 0xfe0f) || cp === 0x200d) continue; // emoji e modificadores: some
    else s += "?";
  }
  return s;
}

/** Quebra por palavras (e no meio da palavra se ela sozinha não couber). Respeita "\n". */
export function quebrarTexto(texto: string, medir: (s: string) => number, largura: number): string[] {
  const linhas: string[] = [];
  for (const paragrafo of texto.split("\n")) {
    const palavras = paragrafo.split(/ +/).filter(Boolean);
    if (!palavras.length) {
      linhas.push("");
      continue;
    }
    let atual = "";
    for (let p of palavras) {
      const tentativa = atual ? `${atual} ${p}` : p;
      if (medir(tentativa) <= largura) {
        atual = tentativa;
        continue;
      }
      if (atual) linhas.push(atual);
      atual = "";
      // Palavra maior que a linha (link, "xxxxx..."): corta onde couber, por busca binária
      // (medir letra por letra numa palavra de 2.000 letras levaria minutos).
      while (p.length > 1 && medir(p) > largura) {
        let cabe = 1;
        let naoCabe = p.length;
        while (naoCabe - cabe > 1) {
          const meio = (cabe + naoCabe) >> 1;
          if (medir(p.slice(0, meio)) <= largura) cabe = meio;
          else naoCabe = meio;
        }
        linhas.push(p.slice(0, cabe));
        p = p.slice(cabe);
      }
      atual = p;
    }
    if (atual) linhas.push(atual);
  }
  // Sem linhas vazias sobrando no fim.
  while (linhas.length > 1 && linhas[linhas.length - 1] === "") linhas.pop();
  return linhas;
}

// ------------------------------------------------------------------ imagens

type Imagem = PDFImage | null;

async function embutir(pdf: PDFDocument, img: ImagemPdf | null): Promise<Imagem> {
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
function desenharContida(e: Escritor, img: Imagem, x: number, y: number, l: number, a: number, fundo = true) {
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

/** Grade de fotos, 2 por linha; quebra de página entre linhas. */
function gradeFotos(e: Escritor, fotos: Imagem[]) {
  for (let i = 0; i < fotos.length; i += 2) {
    e.garantir(FOTO_A + FOTO_ESPACO_V);
    e.y -= FOTO_A;
    desenharContida(e, fotos[i], MARGEM, e.y, FOTO_L, FOTO_A);
    if (fotos[i + 1] !== undefined) desenharContida(e, fotos[i + 1], MARGEM + FOTO_L + FOTO_ESPACO, e.y, FOTO_L, FOTO_A);
    e.y -= FOTO_ESPACO_V;
  }
}

const alturaGrade = (n: number) => Math.ceil(n / 2) * (FOTO_A + FOTO_ESPACO_V);

/** Fotos do painel (até 3): uma linha só, com 3 colunas. */
function gradePainel(e: Escritor, fotos: Imagem[]) {
  for (let i = 0; i < fotos.length; i += 3) {
    e.garantir(PAINEL_A + FOTO_ESPACO_V);
    e.y -= PAINEL_A;
    fotos.slice(i, i + 3).forEach((f, c) => desenharContida(e, f, MARGEM + c * (PAINEL_L + FOTO_ESPACO), e.y, PAINEL_L, PAINEL_A));
    e.y -= FOTO_ESPACO_V;
  }
}

// ------------------------------------------------------------------ ícones do checklist (não dependem de cor)

function iconeSituacao(e: Escritor, s: SituacaoItemVistoria | null, x: number, yBase: number) {
  const p = e.pagina;
  const c = yBase + 3.5; // centro vertical na altura da letra
  if (s === "ok") {
    p.drawLine({ start: { x: x + 0.5, y: c }, end: { x: x + 3.5, y: c - 3.2 }, thickness: 1.6, color: GRAFITE });
    p.drawLine({ start: { x: x + 3.5, y: c - 3.2 }, end: { x: x + 9.5, y: c + 4 }, thickness: 1.6, color: GRAFITE });
  } else if (s === "com_problema") {
    p.drawCircle({ x: x + 5, y: c, size: 5.2, color: GRAFITE });
    const l = e.largura("!", e.fontes.negrito, 8.5);
    e.escrever("!", x + 5 - l / 2, c - 3, e.fontes.negrito, 8.5, BRANCO);
  } else if (s === "nao_se_aplica") {
    p.drawLine({ start: { x: x + 1, y: c }, end: { x: x + 9, y: c }, thickness: 1.4, color: SUAVE });
  } else {
    p.drawCircle({ x: x + 5, y: c, size: 4.5, borderColor: SUAVE, borderWidth: 1 });
  }
}

function ordenarChecklist<T extends { situacao: SituacaoItemVistoria | null }>(itens: T[]): T[] {
  const peso = (s: SituacaoItemVistoria | null) => (s === "com_problema" ? 0 : s === "ok" ? 1 : s === "nao_se_aplica" ? 2 : 3);
  return itens
    .map((item, i) => ({ item, i }))
    .sort((a, b) => peso(a.item.situacao) - peso(b.item.situacao) || a.i - b.i)
    .map((x) => x.item);
}

// ------------------------------------------------------------------ geração

/**
 * Monta o PDF. `agora` vai no rodapé ("Gerado pelo MechaFlow em …").
 * Fontes embutidas com subconjunto (só os caracteres usados), para o arquivo ficar pequeno.
 */
export async function gerarPdfVistoria(d: DadosPdfVistoria, fontesBytes: FontesPdf, agora = new Date()): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const tipoTexto = ROTULO_TIPO_VISTORIA[d.tipo];
  const osTexto = formatarNumeroOS(d.numeroOS);
  pdf.setTitle(`${tipoTexto} · ${osTexto} · ${d.placa}${d.anulada ? " · ANULADA" : ""}`);
  pdf.setAuthor(d.oficina.nome);
  pdf.setCreator("MechaFlow");
  pdf.setProducer("MechaFlow");
  pdf.setLanguage("pt-BR");
  pdf.setCreationDate(agora);
  pdf.setModificationDate(agora);

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

  // Imagens: embutidas uma vez (JPEG entra como está, sem recomprimir).
  const [assinaturaImg, avariasImg, painelImg, complementosImg] = await Promise.all([
    d.assinatura?.tipo === "assinada" ? embutir(pdf, d.assinatura.imagem) : Promise.resolve(null),
    Promise.all(d.avarias.map((a) => Promise.all(a.fotos.map((f) => embutir(pdf, f))))),
    Promise.all(d.painel.map((f) => embutir(pdf, f))),
    Promise.all(d.complementos.map((c) => Promise.all(c.fotos.map((f) => embutir(pdf, f))))),
  ]);

  const e = new Escritor(pdf, { normal, negrito, condensada, mono }, [
    { texto: `${tipoTexto} · ${osTexto} · ` },
    { texto: d.placa, mono: true },
    ...(d.anulada ? [{ texto: " · ANULADA" }] : []),
  ]);
  e.novaPagina(true);

  // ---------------- cabeçalho
  const pg = e.pagina;
  pg.drawRectangle({ x: 0, y: PAGINA[1] - 3 * MM, width: PAGINA[0], height: 3 * MM, color: AMARELO });

  const dir = MARGEM + LARGURA;
  const titulo = `${tipoTexto.toUpperCase()}${d.anulada ? " — ANULADA" : ""}`.replace(/^VISTORIA DE /, "VISTORIA DE\n").split("\n");
  let yd = TOPO;
  for (const t of titulo) {
    yd -= 20;
    e.escrever(t, dir - e.largura(t, condensada, 20), yd, condensada, 20);
  }
  yd -= 17;
  e.escrever(osTexto, dir - e.largura(osTexto, mono, 13), yd, mono, 13);
  const larguraDireita = Math.max(...titulo.map((t) => e.largura(t, condensada, 20)), e.largura(osTexto, mono, 13));

  let ye = TOPO;
  for (const l of e.quebrar(d.oficina.nome.toUpperCase(), negrito, 16, LARGURA - larguraDireita - 16)) {
    ye -= 18;
    e.escrever(l, MARGEM, ye, negrito, 16);
  }
  if (d.oficina.cnpj) {
    ye -= 13;
    e.escrever(`CNPJ ${d.oficina.cnpj}`, MARGEM, ye, normal, 9, SUAVE);
  }
  e.y = Math.min(ye, yd) - 16;

  // Placa com borda + veículo
  const placaL = e.largura(d.placa, mono, 18);
  e.y -= 26;
  pg.drawRectangle({ x: MARGEM, y: e.y, width: placaL + 14, height: 26, borderColor: GRAFITE, borderWidth: 1.5 });
  e.escrever(d.placa, MARGEM + 7, e.y + 7.5, mono, 18);
  if (d.veiculo) {
    const xv = MARGEM + placaL + 26;
    const linhas = e.quebrar(d.veiculo, normal, 13, dir - xv);
    e.escrever(linhas[0] ?? "", xv, e.y + 8.5, normal, 13);
  }
  e.y -= 6;
  if (d.cliente) e.paragrafo(`Cliente: ${d.cliente}`, { tamanho: 11 });
  e.paragrafo(
    d.concluidaEm ? `Feita em ${dataHora(d.concluidaEm)}${d.concluidaPor ? ` por ${d.concluidaPor}` : ""}` : "Vistoria não concluída",
    { tamanho: 11 },
  );
  e.y -= 8;
  e.linha(e.y, 1, GRAFITE);
  e.y -= 4;

  // ---------------- anulada: linha no topo com motivo, quem e quando
  if (d.anulada) {
    const texto = `VISTORIA ANULADA em ${dataHora(d.anulada.em)} por ${d.anulada.por}. Motivo: ${formatarMotivoAnulacao(d.anulada.motivo)}`;
    const linhas = e.quebrar(texto, negrito, 11, LARGURA - 16);
    const altura = linhas.length * 14.5 + 12;
    e.y -= 8;
    e.garantir(altura);
    e.y -= altura;
    e.pagina.drawRectangle({ x: MARGEM, y: e.y, width: LARGURA, height: altura, borderColor: GRAFITE, borderWidth: 1.5 });
    linhas.forEach((l, i) => e.escrever(l, MARGEM + 8, e.y + altura - 6 - 11 - i * 14.5, negrito, 11));
  }

  // ---------------- entrada
  e.secao("Entrada", 34);
  // Números em mono (§12.17), rótulos em negrito, tudo na mesma linha.
  const partesKm: { texto: string; mono?: boolean }[] = [{ texto: "KM " }];
  if (d.km != null) partesKm.push({ texto: formatarNumero(d.km), mono: true });
  else partesKm.push({ texto: "não informado" });
  if (d.horimetro != null) partesKm.push({ texto: " · Horímetro " }, { texto: formatarNumero(d.horimetro), mono: true }, { texto: " h" });
  e.garantir(16);
  e.y -= 15.5;
  let xKm = MARGEM;
  for (const parte of partesKm) {
    const fonte = parte.mono ? mono : negrito;
    e.escrever(parte.texto, xKm, e.y + 4, fonte, 11.5);
    xKm += e.largura(parte.texto, fonte, 11.5);
  }
  e.garantir(18);
  e.y -= 16;
  e.escrever("Combustível", MARGEM, e.y + 2, normal, 11);
  const xg = MARGEM + e.largura("Combustível", normal, 11) + 10;
  const gl = 110;
  if (d.combustivel) {
    e.pagina.drawRectangle({ x: xg, y: e.y + 1, width: gl * FRACAO_COMBUSTIVEL[d.combustivel], height: 10, color: GRAFITE });
  }
  e.pagina.drawRectangle({ x: xg, y: e.y + 1, width: gl, height: 10, borderColor: GRAFITE, borderWidth: 1 });
  for (const q of [0.25, 0.5, 0.75]) {
    e.pagina.drawLine({ start: { x: xg + gl * q, y: e.y + 1 }, end: { x: xg + gl * q, y: e.y + 4 }, thickness: 0.75, color: BORDA });
  }
  e.escrever(d.combustivel ? ROTULO_COMBUSTIVEL[d.combustivel] : "não informado", xg + gl + 8, e.y + 2, negrito, 11);

  // ---------------- checklist (2 colunas, problemas primeiro)
  const conta = (s: SituacaoItemVistoria) => d.itens.filter((i) => i.situacao === s).length;
  e.secao(`Checklist (${d.itens.length})`);
  if (!d.itens.length) {
    e.paragrafo("Nenhum item no checklist.");
  } else {
    const contagens = juntarContagens([
      [conta("com_problema"), "com problema"],
      [conta("ok"), "ok"],
      [conta("nao_se_aplica"), "não se aplica"],
    ]);
    if (contagens) e.paragrafo(contagens, { tamanho: 9.5, cor: SUAVE });
    e.y -= 4;
    const itens = ordenarChecklist(d.itens);
    const colL = (LARGURA - 16) / 2;
    const textoL = colL - 16;
    const tam = 10;
    const entre = 13;
    const montar = (i: ItemPdf) => {
      const obs = i.observacao?.trim();
      const sufixo = i.situacao === "nao_se_aplica" ? " (não se aplica)" : i.situacao === null ? " (sem marcar)" : "";
      const texto = `${i.descricao}${obs ? ` — ${obs}` : ""}${sufixo}`;
      const fonte = i.situacao === "com_problema" ? negrito : normal;
      return { i, fonte, linhas: e.quebrar(texto, fonte, tam, textoL) };
    };
    // Ordem de leitura por linha (esquerda → direita): não embaralha quando a lista quebra de página.
    const prontos = itens.map(montar);
    for (let r = 0; r < prontos.length; r += 2) {
      const a = prontos[r];
      const b = prontos[r + 1];
      const altura = Math.max(a.linhas.length, b?.linhas.length ?? 0) * entre + 4;
      e.garantir(altura);
      for (const [col, item] of [
        [0, a],
        [1, b],
      ] as const) {
        if (!item) continue;
        const x = MARGEM + col * (colL + 16);
        const y0 = e.y - tam;
        iconeSituacao(e, item.i.situacao, x, y0);
        item.linhas.forEach((l, k) => e.escrever(l, x + 16, y0 - k * entre, item.fonte, tam));
      }
      e.y -= altura;
    }
  }

  // ---------------- avarias (texto + fotos não quebram entre páginas)
  const alturaAvaria = (a: AvariaPdf) => {
    const desc = a.descricao?.trim();
    const linhas = desc ? e.quebrar(desc, normal, 10.5, LARGURA).length : 0;
    return 16 + linhas * 14 + (a.fotos.length ? alturaGrade(a.fotos.length) + 4 : 14) + 6;
  };
  // O título da seção vai junto com a 1ª avaria inteira (não fica sozinho no fim da página).
  e.secao(`Avarias (${d.avarias.length})`, d.avarias.length ? Math.min(alturaAvaria(d.avarias[0]), e.alturaPaginaNova - 32) : 20);
  if (!d.avarias.length) {
    e.paragrafo(d.semAvarias ? "Nenhuma avaria." : "Não informado.");
  }
  d.avarias.forEach((a, n) => {
    const titulo = `${n + 1}. ${ROTULO_LADO_AVARIA[a.lado]}`;
    const desc = a.descricao?.trim() ?? "";
    const altura = alturaAvaria(a);
    if (altura <= e.alturaPaginaNova) e.garantir(altura);
    e.paragrafo(titulo, { fonte: negrito, tamanho: 11.5, entrelinha: 16 });
    if (desc) e.paragrafo(desc, { tamanho: 10.5, entrelinha: 14 });
    if (a.fotos.length) {
      e.y -= 4;
      gradeFotos(e, avariasImg[n]);
    } else {
      e.paragrafo("Sem foto", { tamanho: 9.5, cor: SUAVE, entrelinha: 14 });
    }
    e.y -= 6;
  });

  // ---------------- painel
  e.secao("Painel", d.painel.length ? PAINEL_A : 20);
  if (d.painel.length) gradePainel(e, painelImg);
  else e.paragrafo("Sem foto do painel.", { cor: SUAVE });

  // ---------------- objetos
  e.secao("Objetos no veículo", 20);
  if (d.objetos === null) e.paragrafo("Objetos: não informado.", { cor: SUAVE });
  else if (!d.objetos.length) e.paragrafo("Nenhum objeto.");
  else e.paragrafo(d.objetos.join(", "));

  // ---------------- observações
  e.secao("Observações", 20);
  if (d.observacoes?.trim()) e.paragrafo(d.observacoes.trim());
  else e.paragrafo("Nenhuma observação.", { cor: SUAVE });

  // ---------------- assinatura (caixa com o nome, não quebra)
  e.secao("Assinatura", d.assinatura?.tipo === "assinada" ? 32 * MM + 4 : 50);
  if (d.assinatura?.tipo === "assinada") {
    const caixaL = 92 * MM;
    const caixaA = 32 * MM;
    e.garantir(caixaA + 4);
    e.y -= caixaA;
    e.pagina.drawRectangle({ x: MARGEM, y: e.y, width: caixaL, height: caixaA, color: BRANCO, borderColor: BORDA, borderWidth: 0.75 });
    if (d.assinatura.imagem) {
      desenharContida(e, assinaturaImg, MARGEM + 6, e.y + 6, caixaL - 12, caixaA - 12, false);
    } else {
      e.escrever("Assinatura não carregou", MARGEM + 10, e.y + caixaA / 2 - 3, normal, 9, SUAVE);
    }
    const xn = MARGEM + caixaL + 14;
    const ln = LARGURA - caixaL - 14;
    let yn = e.y + caixaA - 12;
    e.escrever("Assinado por", xn, yn, normal, 9, SUAVE);
    for (const l of e.quebrar(d.assinatura.nome, negrito, 13, ln).slice(0, 2)) {
      yn -= 17;
      e.escrever(l, xn, yn, negrito, 13);
    }
    yn -= 15;
    e.escrever(dataHora(d.assinatura.em), xn, yn, normal, 10.5);
    e.y -= 4;
  } else if (d.assinatura?.tipo === "sem") {
    const texto = `SEM ASSINATURA — ${ROTULO_SEM_ASSINATURA[d.assinatura.motivo]}`;
    const extra = d.assinatura.nome ? `Nome informado: ${d.assinatura.nome}` : null;
    const altura = 30 + (extra ? 15 : 0);
    e.garantir(altura + 4);
    e.y -= altura;
    e.pagina.drawRectangle({ x: MARGEM, y: e.y, width: LARGURA, height: altura, borderColor: GRAFITE, borderWidth: 1.5 });
    e.escrever(texto, MARGEM + 10, e.y + altura - 19, negrito, 12.5);
    if (extra) e.escrever(extra, MARGEM + 10, e.y + 9, normal, 10.5);
    e.y -= 4;
  } else {
    e.paragrafo("Sem assinatura registrada.", { cor: SUAVE });
  }

  // ---------------- complementos
  if (d.complementos.length) {
    e.y -= 6;
    const alturaComplemento = (c: ComplementoPdf) => {
      const texto = c.texto?.trim();
      const linhas = texto ? e.quebrar(texto, normal, 10.5, LARGURA).length : 0;
      return 15 + linhas * 14 + (c.fotos.length ? alturaGrade(c.fotos.length) + 4 : 0) + 8;
    };
    e.secao(`Acrescentado depois da conclusão (${d.complementos.length})`, Math.min(alturaComplemento(d.complementos[0]), e.alturaPaginaNova - 32));
    d.complementos.forEach((c, n) => {
      const texto = c.texto?.trim() ?? "";
      const altura = alturaComplemento(c);
      if (altura <= e.alturaPaginaNova) e.garantir(altura);
      e.paragrafo(`${dataHora(c.criadoEm)} · ${c.criadoPor}`, { fonte: negrito, tamanho: 10.5, entrelinha: 15 });
      if (texto) e.paragrafo(texto, { tamanho: 10.5, entrelinha: 14 });
      if (c.fotos.length) {
        e.y -= 4;
        gradeFotos(e, complementosImg[n]);
      }
      e.y -= 8;
    });
  }

  // ---------------- rodapé e marca d'água em todas as páginas
  const codigo = formatarCodigoConferencia(d.hash);
  const total = e.paginas.length;
  e.paginas.forEach((p, i) => {
    e.pagina = p;
    e.linha(MARGEM + 12, 0.5);
    const partes = [`Gerado pelo MechaFlow em ${dataHora(agora.toISOString())}`];
    if (codigo) partes.push(`Código de conferência ${codigo}`);
    partes.push(`Pág. ${i + 1} de ${total}`);
    e.escrever(partes.join(" · "), MARGEM, MARGEM, normal, 8, SUAVE);
    if (d.anulada) {
      const t = "ANULADA";
      const tam = 60;
      const l = e.largura(t, negrito, tam);
      const cos = Math.SQRT1_2;
      const cx = PAGINA[0] / 2;
      const cy = PAGINA[1] / 2;
      // Texto girado 45° com o centro no meio da página.
      const x = cx - (l / 2) * cos + (tam * 0.35) * cos;
      const y = cy - (l / 2) * cos - (tam * 0.35) * cos;
      p.drawText(t, { x, y, size: tam, font: negrito.f, color: GRAFITE, opacity: 0.15, rotate: degrees(45) });
    }
  });

  return pdf.save({ useObjectStreams: true });
}
