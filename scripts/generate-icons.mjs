/**
 * Gera os icones do PWA em public/icons/ a partir de um SVG simples.
 * Uso: npm run icons
 * Para mudar a cor, altere PRIMARY (mesmo valor de --primary em globals.css).
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const PRIMARY = "#1e3a5f";
const FOREGROUND = "#ffffff";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = path.join(root, "public", "icons");

// Letra "M" desenhada com traco, numa grade de 512x512.
// `scale` controla o tamanho do simbolo (maskable precisa de margem maior).
function svg({ rounded, scale }) {
  const size = 512;
  const radius = rounded ? 112 : 0;
  const offset = (size * (1 - scale)) / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">
  <rect width="${size}" height="${size}" rx="${radius}" fill="${PRIMARY}"/>
  <g transform="translate(${offset} ${offset}) scale(${scale})">
    <path d="M136 376V144l120 136 120-136v232" fill="none" stroke="${FOREGROUND}" stroke-width="48" stroke-linecap="round" stroke-linejoin="round"/>
  </g>
</svg>
`;
}

async function png(source, size, file) {
  await sharp(Buffer.from(source)).resize(size, size).png().toFile(path.join(outDir, file));
  console.log(`ok  public/icons/${file}`);
}

await mkdir(outDir, { recursive: true });

const standard = svg({ rounded: true, scale: 1 });
const fullBleed = svg({ rounded: false, scale: 1 });
const maskable = svg({ rounded: false, scale: 0.75 }); // simbolo dentro da zona segura

await writeFile(path.join(outDir, "icon.svg"), standard);
console.log("ok  public/icons/icon.svg");
await png(standard, 192, "icon-192.png");
await png(standard, 512, "icon-512.png");
await png(maskable, 512, "icon-maskable-512.png");
// iOS aplica o proprio arredondamento: usar fundo inteiro, sem cantos.
await png(fullBleed, 180, "apple-touch-icon.png");
