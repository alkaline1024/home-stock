import { copyFileSync, mkdirSync, readdirSync } from "node:fs";
import { build } from "esbuild";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const root = fileURLToPath(new URL("../", import.meta.url));
copyFileSync(
  resolve(root, "node_modules/exceljs/dist/exceljs.min.js"),
  resolve(root, "public/exceljs.min.js"),
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
copyFileSync(resolve(root, "node_modules/tesseract.js/dist/tesseract.min.js"), resolve(ocr, "tesseract.min.js"));
copyFileSync(resolve(root, "node_modules/tesseract.js/dist/worker.min.js"), resolve(ocr, "worker.min.js"));
for (const name of readdirSync(resolve(root, "node_modules/tesseract.js-core"))) {
  if (/^tesseract-core(?:-simd|-relaxedsimd)?(?:-lstm)?\.wasm(?:\.js)?$/.test(name))
    copyFileSync(resolve(root, "node_modules/tesseract.js-core", name), resolve(core, name));
}
for (const language of ["tha", "eng"])
  copyFileSync(resolve(root, "node_modules/@tesseract.js-data", language,
    "4.0.0_best_int", language + ".traineddata.gz"),
    resolve(lang, language + ".traineddata.gz"));
console.log("Built public assets");
