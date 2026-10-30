/**
 * Preparo da foto NO NAVEGADOR (DESIGN §11.4, ARQUITETURA F3.6 passo 1):
 * gira pela orientação EXIF, reduz para no máximo 1600 px no lado maior,
 * JPEG ~80 % e gera a miniatura (400 px). Recodificar sempre também tira o
 * EXIF (GPS do celular) do arquivo que sobe.
 *
 * Por que `<img>` e não `createImageBitmap`: o Safari do iPhone (13.4+) gira
 * a `<img>` e o `drawImage` pela orientação EXIF, e o `createImageBitmap` de
 * Blob teve comportamento diferente entre versões do WebKit. O `<img>` também
 * decodifica HEIC no Safari. Se o navegador NÃO girar sozinho (teste com uma
 * imagem 2×1 marcada como "girar 90°"), o código gira à mão pela orientação lida
 * do arquivo. `createImageBitmap` fica de reserva se a `<img>` não abrir.
 *
 * Memória no Safari: o limite é a soma das áreas dos canvas (~16,7 MP cada).
 * Cada canvas intermediário fica abaixo de 16 MP e é zerado logo depois do uso.
 */

export const LADO_MAXIMO = 1600;
export const LADO_MINIATURA = 400;
export const QUALIDADE_FOTO = 0.8;
export const QUALIDADE_MINIATURA = 0.75;
/** Limite do bucket `os-fotos` (5 MB), conferido depois de comprimir. */
export const BYTES_MAXIMO = 5 * 1024 * 1024;
const AREA_MAXIMA_CANVAS = 16_000_000;

export type CodigoErroFoto = "vazio" | "formato" | "grande_demais" | "memoria";

const MENSAGEM_ERRO_FOTO: Record<CodigoErroFoto, string> = {
  vazio: "Nenhuma foto foi escolhida.",
  formato: "Não deu para abrir esta foto neste celular. Tire a foto de novo pela câmera do app.",
  grande_demais: "A foto ficou grande demais (máximo 5 MB). Tire de novo.",
  memoria: "O celular ficou sem memória para preparar a foto. Feche outros apps e tente de novo.",
};

export class ErroFoto extends Error {
  codigo: CodigoErroFoto;
  constructor(codigo: CodigoErroFoto, detalhe?: string) {
    super(MENSAGEM_ERRO_FOTO[codigo]);
    this.codigo = codigo;
    this.name = "ErroFoto";
    if (detalhe) this.cause = detalhe;
  }
}

export type EtapaTempo = { etapa: string; ms: number };

export type DiagnosticoPreparo = {
  nomeArquivo: string;
  tipoOriginal: string;
  bytesOriginal: number;
  /** Dimensões como o navegador abriu (já giradas, se ele gira sozinho). */
  larguraAberta: number;
  alturaAberta: number;
  /** Orientação EXIF lida do arquivo (1 = normal; null = sem EXIF / não é JPEG). */
  orientacaoExif: number | null;
  navegadorGira: boolean;
  giradoAMao: boolean;
  metodo: "img" | "bitmap";
  qualidade: number;
  largura: number;
  altura: number;
  bytesFoto: number;
  larguraMini: number;
  alturaMini: number;
  bytesMini: number;
  etapas: EtapaTempo[];
  totalMs: number;
};

export type FotoPreparada = {
  foto: Blob;
  mini: Blob;
  largura: number;
  altura: number;
  diag: DiagnosticoPreparo;
};

// ------------------------------------------------------------ orientação

/** JPEG 2×1 com EXIF Orientation = 6 (girar 90°). Se abrir 1×2, o navegador gira sozinho. */
const JPEG_TESTE_ORIENTACAO =
  "data:image/jpeg;base64,/9j/4QC8RXhpZgAASUkqAAgAAAAGABIBAwABAAAABgAAABoBBQABAAAAVgAAABsBBQABAAAAXgAAACgBAwABAAAAAgAAABMCAwABAAAAAQAAAGmHBAABAAAAZgAAAAAAAAA4YwAA6AMAADhjAADoAwAABgAAkAcABAAAADAyMTABkQcABAAAAAECAwAAoAcABAAAADAxMDABoAMAAQAAAP//AAACoAQAAQAAAAIAAAADoAQAAQAAAAEAAAAAAAAA/9sAQwAQCwwODAoQDg0OEhEQExgoGhgWFhgxIyUdKDozPTw5Mzg3QEhcTkBEV0U3OFBtUVdfYmdoZz5NcXlwZHhcZWdj/9sAQwEREhIYFRgvGhovY0I4QmNjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2Nj/8AAEQgAAQACAwEiAAIRAQMRAf/EABUAAQEAAAAAAAAAAAAAAAAAAAAF/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/EABUBAQEAAAAAAAAAAAAAAAAAAAUG/8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAwDAQACEQMRAD8AigC14//Z";

let giraSozinho: Promise<boolean> | null = null;

/** O navegador aplica a orientação EXIF na `<img>`? (resultado guardado) */
export function navegadorGiraSozinho(): Promise<boolean> {
  giraSozinho ??= new Promise<boolean>((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img.naturalWidth === 1 && img.naturalHeight === 2);
    img.onerror = () => resolve(true);
    img.src = JPEG_TESTE_ORIENTACAO;
  });
  return giraSozinho;
}

/** Lê a tag Orientation (0x0112) do EXIF de um JPEG. null se não houver. */
export async function lerOrientacaoExif(arquivo: Blob): Promise<number | null> {
  try {
    const buf = await arquivo.slice(0, 256 * 1024).arrayBuffer();
    const v = new DataView(buf);
    if (v.byteLength < 4 || v.getUint16(0) !== 0xffd8) return null;
    let p = 2;
    while (p + 4 <= v.byteLength) {
      const marcador = v.getUint16(p);
      const tamanho = v.getUint16(p + 2);
      if (marcador === 0xffe1 && p + 10 <= v.byteLength && v.getUint32(p + 4) === 0x45786966) {
        const tiff = p + 10;
        const le = v.getUint16(tiff) === 0x4949;
        const ifd = tiff + v.getUint32(tiff + 4, le);
        if (ifd + 2 > v.byteLength) return null;
        const n = v.getUint16(ifd, le);
        for (let i = 0; i < n; i++) {
          const e = ifd + 2 + i * 12;
          if (e + 12 > v.byteLength) return null;
          if (v.getUint16(e, le) === 0x0112) {
            const o = v.getUint16(e + 8, le);
            return o >= 1 && o <= 8 ? o : null;
          }
        }
        return null;
      }
      if ((marcador & 0xff00) !== 0xff00 || marcador === 0xffda) return null;
      p += 2 + tamanho;
    }
    return null;
  } catch {
    return null;
  }
}

// ------------------------------------------------------------ canvas

function novoCanvas(l: number, a: number) {
  const c = document.createElement("canvas");
  c.width = l;
  c.height = a;
  const ctx = c.getContext("2d");
  if (!ctx) throw new ErroFoto("memoria", "getContext null");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  return { c, ctx };
}

function liberar(c: HTMLCanvasElement) {
  c.width = 0;
  c.height = 0;
}

function paraBlob(c: HTMLCanvasElement, qualidade: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    c.toBlob((b) => (b && b.size > 0 ? resolve(b) : reject(new ErroFoto("memoria", "toBlob vazio"))), "image/jpeg", qualidade);
  });
}

/** Desenha a fonte já girada à mão (orientações 2..8) num canvas do tamanho final. */
function desenharGirado(
  fonte: CanvasImageSource,
  orientacao: number,
  larguraBruta: number,
  alturaBruta: number,
  escala: number,
) {
  const troca = orientacao >= 5;
  const lf = Math.max(1, Math.round((troca ? alturaBruta : larguraBruta) * escala));
  const af = Math.max(1, Math.round((troca ? larguraBruta : alturaBruta) * escala));
  const { c, ctx } = novoCanvas(lf, af);
  // Tamanho da imagem bruta já na escala de destino.
  const lb = troca ? af : lf;
  const ab = troca ? lf : af;
  switch (orientacao) {
    case 2: ctx.transform(-1, 0, 0, 1, lb, 0); break;
    case 3: ctx.transform(-1, 0, 0, -1, lb, ab); break;
    case 4: ctx.transform(1, 0, 0, -1, 0, ab); break;
    case 5: ctx.transform(0, 1, 1, 0, 0, 0); break;
    case 6: ctx.transform(0, 1, -1, 0, ab, 0); break;
    case 7: ctx.transform(0, -1, -1, 0, ab, lb); break;
    case 8: ctx.transform(0, -1, 1, 0, 0, lb); break;
  }
  ctx.drawImage(fonte, 0, 0, lb, ab);
  return c;
}

/**
 * Reduz em etapas (cada uma no máximo 2×), para a foto não ficar serrilhada,
 * sem nenhum canvas acima de 16 MP.
 */
function reduzir(fonte: CanvasImageSource, l: number, lf: number, af: number) {
  const tamanhos: [number, number][] = [[lf, af]];
  let w = lf;
  let h = af;
  while (w * 2 < l && w * 2 * (h * 2) <= AREA_MAXIMA_CANVAS) {
    w *= 2;
    h *= 2;
    tamanhos.unshift([w, h]);
  }
  let atual: CanvasImageSource = fonte;
  let anterior: HTMLCanvasElement | null = null;
  for (const [cw, ch] of tamanhos) {
    const { c, ctx } = novoCanvas(cw, ch);
    // drawImage com 5 argumentos (fonte inteira): o recorte de origem não depende da orientação.
    ctx.drawImage(atual, 0, 0, cw, ch);
    if (anterior) liberar(anterior);
    anterior = c;
    atual = c;
  }
  return anterior!;
}

function escalaPara(l: number, a: number, lado: number) {
  return Math.min(1, lado / Math.max(l, a));
}

// ------------------------------------------------------------ abrir o arquivo

type Aberta = { fonte: CanvasImageSource; l: number; a: number; metodo: "img" | "bitmap"; fechar: () => void };

async function abrir(arquivo: Blob): Promise<Aberta> {
  const url = URL.createObjectURL(arquivo);
  try {
    const img = new Image();
    img.decoding = "async";
    img.src = url;
    await img.decode();
    if (!img.naturalWidth || !img.naturalHeight) throw new Error("sem dimensão");
    return {
      fonte: img,
      l: img.naturalWidth,
      a: img.naturalHeight,
      metodo: "img",
      fechar: () => {
        img.src = "";
        URL.revokeObjectURL(url);
      },
    };
  } catch (e1) {
    URL.revokeObjectURL(url);
    if (typeof createImageBitmap !== "function") throw new ErroFoto("formato", String(e1));
    try {
      const bmp = await createImageBitmap(arquivo, { imageOrientation: "from-image" });
      return { fonte: bmp, l: bmp.width, a: bmp.height, metodo: "bitmap", fechar: () => bmp.close() };
    } catch (e2) {
      throw new ErroFoto("formato", `${String(e1)} / ${String(e2)}`);
    }
  }
}

// ------------------------------------------------------------ principal

export async function prepararFoto(arquivo: File): Promise<FotoPreparada> {
  if (!arquivo || arquivo.size === 0) throw new ErroFoto("vazio");
  const etapas: EtapaTempo[] = [];
  const t0 = performance.now();
  let t = t0;
  const marcar = (etapa: string) => {
    const agora = performance.now();
    etapas.push({ etapa, ms: Math.round(agora - t) });
    t = agora;
  };

  const [orientacaoExif, gira] = await Promise.all([lerOrientacaoExif(arquivo), navegadorGiraSozinho()]);
  marcar("ler orientação");

  const aberta = await abrir(arquivo);
  marcar("abrir a foto");

  let foto: HTMLCanvasElement | null = null;
  let mini: HTMLCanvasElement | null = null;
  try {
    const giradoAMao = aberta.metodo === "img" && !gira && orientacaoExif != null && orientacaoExif > 1;
    let fonte: CanvasImageSource = aberta.fonte;
    let l = aberta.l;
    let a = aberta.a;
    let temporario: HTMLCanvasElement | null = null;
    if (giradoAMao) {
      // Gira já reduzindo para no máximo 2× o tamanho final (cabe na memória).
      const escala = escalaPara(l, a, LADO_MAXIMO * 2);
      temporario = desenharGirado(fonte, orientacaoExif!, l, a, escala);
      fonte = temporario;
      l = temporario.width;
      a = temporario.height;
    }
    const e = escalaPara(l, a, LADO_MAXIMO);
    const lf = Math.max(1, Math.round(l * e));
    const af = Math.max(1, Math.round(a * e));
    foto = reduzir(fonte, l, lf, af);
    if (temporario && temporario !== foto) liberar(temporario);
    aberta.fechar();
    marcar("reduzir");

    let qualidade = QUALIDADE_FOTO;
    let blobFoto = await paraBlob(foto, qualidade);
    if (blobFoto.size > BYTES_MAXIMO) {
      qualidade = 0.65;
      blobFoto = await paraBlob(foto, qualidade);
    }
    marcar("gerar JPEG");
    if (blobFoto.size > BYTES_MAXIMO) throw new ErroFoto("grande_demais", `${blobFoto.size} bytes`);

    const em = escalaPara(lf, af, LADO_MINIATURA);
    mini = reduzir(foto, lf, Math.max(1, Math.round(lf * em)), Math.max(1, Math.round(af * em)));
    const blobMini = await paraBlob(mini, QUALIDADE_MINIATURA);
    marcar("miniatura");

    const diag: DiagnosticoPreparo = {
      nomeArquivo: arquivo.name,
      tipoOriginal: arquivo.type || "(vazio)",
      bytesOriginal: arquivo.size,
      larguraAberta: aberta.l,
      alturaAberta: aberta.a,
      orientacaoExif,
      navegadorGira: gira,
      giradoAMao,
      metodo: aberta.metodo,
      qualidade,
      largura: lf,
      altura: af,
      bytesFoto: blobFoto.size,
      larguraMini: mini.width,
      alturaMini: mini.height,
      bytesMini: blobMini.size,
      etapas,
      totalMs: Math.round(performance.now() - t0),
    };
    return { foto: blobFoto, mini: blobMini, largura: lf, altura: af, diag };
  } catch (e) {
    if (e instanceof ErroFoto) throw e;
    throw new ErroFoto("memoria", String(e));
  } finally {
    aberta.fechar();
    if (foto) liberar(foto);
    if (mini) liberar(mini);
  }
}
