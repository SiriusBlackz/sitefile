/**
 * Generate PWA icons from the Sitefile S-Strata mark.
 * Run: npx tsx scripts/generate-icons.ts
 *
 * Emits SVG icons at every size the manifest references (SVG scales, but
 * per-size files keep the manifest contract stable), plus apple-touch-icon.
 */
import { writeFileSync } from "fs";
import { join } from "path";

const sizes = [72, 96, 128, 144, 152, 192, 384, 512];

function generateSvg(size: number): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 64 64">
  <rect width="64" height="64" rx="14" fill="#2563eb"/>
  <rect x="22" y="14" width="28" height="9" rx="4.5" fill="#fff"/>
  <rect x="14" y="27.5" width="36" height="9" rx="4.5" fill="#bfdbfe"/>
  <rect x="14" y="41" width="28" height="9" rx="4.5" fill="#fff"/>
</svg>`;
}

const outDir = join(process.cwd(), "public", "icons");

for (const size of sizes) {
  writeFileSync(join(outDir, `icon-${size}x${size}.svg`), generateSvg(size));
  console.log(`Generated icon-${size}x${size}.svg`);
}

writeFileSync(join(outDir, "apple-touch-icon.svg"), generateSvg(180));
console.log("Generated apple-touch-icon.svg");
