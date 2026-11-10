import { copyFileSync } from "node:fs";
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
console.log("Built public assets");
