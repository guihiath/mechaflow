import "server-only";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { FontesPdf } from "./base";

/*
 * Fontes dos PDFs (OFL, em src/assets/fonts). Toda rota que gera PDF precisa estar em
 * `outputFileTracingIncludes` do next.config.ts, senão os arquivos faltam só na Vercel.
 */

let fontes: Promise<FontesPdf> | null = null;

export function carregarFontesPdf(): Promise<FontesPdf> {
  if (!fontes) {
    const ler = (nome: string) => readFile(join(process.cwd(), "src", "assets", "fonts", nome)).then((b) => new Uint8Array(b));
    fontes = Promise.all([
      ler("Barlow-Medium.ttf"),
      ler("Barlow-Bold.ttf"),
      ler("BarlowCondensed-Bold.ttf"),
      ler("IBMPlexMono-SemiBold.ttf"),
    ]).then(([normal, negrito, condensada, mono]) => ({ normal, negrito, condensada, mono }));
    fontes.catch(() => {
      fontes = null; // tenta ler de novo na próxima requisição
    });
  }
  return fontes;
}
