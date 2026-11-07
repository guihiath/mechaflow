import type { PDFFont } from "pdf-lib";

/*
 * Texto no PDF (base comum da vistoria e da OS): limpeza de caracteres que a fonte embutida não
 * tem e quebra de linha por largura. Puro (sem Supabase nem fs).
 */

/** Fonte embutida + o conjunto de caracteres que ela desenha. */
export type Fonte = { f: PDFFont; caracteres: Set<number> };

/** Troca caracteres que a fonte não tem (emoji etc.) e controles; normaliza acentos (NFC). */
export function limpar(texto: string, fonte: Fonte, manterQuebras = false): string {
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
