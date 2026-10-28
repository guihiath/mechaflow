/**
 * Gera os icones do PWA em public/icons/ a partir do SVG do DESIGN.md (secao 7):
 * porca sextavada amarela com "M" grafite, sobre fundo grafite.
 * Uso: npm run icons
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const GRAFITE = "#14161A";
const PRIMARIA = "#F5B800";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = path.join(root, "public", "icons");

// O desenho ja fica dentro da area segura do maskable (circulo de 80%),
// entao o mesmo SVG serve para "any", "maskable" e apple-touch-icon.
const icon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <rect width="512" height="512" fill="${GRAFITE}"/>
  <polygon points="256,96 394.56,176 394.56,336 256,416 117.44,336 117.44,176" fill="${PRIMARIA}"/>
  <path d="M186 322 V196 L256 266 L326 196 V322" fill="none" stroke="${GRAFITE}" stroke-width="38" stroke-linejoin="miter" stroke-linecap="square"/>
</svg>
`;

async function png(size, file) {
  await sharp(Buffer.from(icon)).resize(size, size).png().toFile(path.join(outDir, file));
  console.log(`ok  public/icons/${file}`);
}

await mkdir(outDir, { recursive: true });
await writeFile(path.join(outDir, "icon.svg"), icon);
console.log("ok  public/icons/icon.svg");
await png(192, "icon-192.png");
await png(512, "icon-512.png");
await png(512, "icon-maskable-512.png");
await png(180, "apple-touch-icon.png");
