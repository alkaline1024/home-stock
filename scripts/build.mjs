import { copyFileSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { build } from "esbuild";
import { build as viteBuild } from "vite";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { buildApp } from "./build-app.mjs";
import { buildStyles } from "./build-styles.mjs";
import { buildTailwind } from "./build-tailwind.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
buildApp();
buildStyles();
buildTailwind();
await viteBuild();
const itemIconSources = {
  box: "package-open",
  vegetables: "carrot",
  fruit: "apple",
  meat: "beef",
  fish: "fish",
  egg: "egg",
  milk: "milk",
  bottle: "bottle-wine",
  grain: "wheat",
  meal: "soup",
  snowflake: "snowflake",
};
const itemIconSymbols = Object.entries(itemIconSources)
  .map(([id, source]) => {
    const svg = readFileSync(
      resolve(root, "node_modules/lucide-static/icons", source + ".svg"),
      "utf8",
    );
    const viewBox = svg.match(/viewBox="([^"]+)"/)?.[1] || "0 0 24 24";
    const body = svg.match(/<svg\b[^>]*>([\s\S]*?)<\/svg>/)?.[1] || "";
    return `<symbol id="item-icon-${id}" viewBox="${viewBox}">${body}</symbol>`;
  })
  .join("");
writeFileSync(
  resolve(root, "public/item-icons.svg"),
  `<!-- Lucide icons, ISC license. -->\n<svg xmlns="http://www.w3.org/2000/svg" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${itemIconSymbols}</svg>\n`,
);
copyFileSync(
  resolve(root, "node_modules/exceljs/dist/exceljs.min.js"),
  resolve(root, "public/exceljs.min.js"),
);
copyFileSync(
  resolve(root, "node_modules/@vercel/analytics/dist/index.mjs"),
  resolve(root, "public/analytics.mjs"),
);
await build({
  entryPoints: [resolve(root, "scripts/barcode-scanner-entry.js")],
  outfile: resolve(root, "public/barcode-scanner.js"),
  platform: "browser",
  format: "esm",
  bundle: true,
  minify: true,
});
const ocr = resolve(root, "public/ocr");
const core = resolve(ocr, "core");
const lang = resolve(ocr, "lang");
mkdirSync(core, { recursive: true });
mkdirSync(lang, { recursive: true });
copyFileSync(
  resolve(root, "node_modules/tesseract.js/dist/tesseract.min.js"),
  resolve(ocr, "tesseract.min.js"),
);
copyFileSync(
  resolve(root, "node_modules/tesseract.js/dist/worker.min.js"),
  resolve(ocr, "worker.min.js"),
);
for (const name of readdirSync(resolve(root, "node_modules/tesseract.js-core"))) {
  if (/^tesseract-core(?:-simd|-relaxedsimd)?(?:-lstm)?\.wasm(?:\.js)?$/.test(name))
    copyFileSync(resolve(root, "node_modules/tesseract.js-core", name), resolve(core, name));
}
for (const language of ["tha", "eng"])
  copyFileSync(
    resolve(
      root,
      "node_modules/@tesseract.js-data",
      language,
      "4.0.0_best_int",
      language + ".traineddata.gz",
    ),
    resolve(lang, language + ".traineddata.gz"),
  );
console.log("Built public assets");
