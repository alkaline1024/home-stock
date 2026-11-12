import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const root = fileURLToPath(new URL("../", import.meta.url));
const parts = [
  "core.js",
  "stock-import.js",
  "receipt-review.js",
  "views.js",
  "draw-and-selects.js",
  "editors.js",
  "dialogs-and-media.js",
  "barcode-and-mutations.js",
  "actions-and-startup.js",
];
// Preserve the original bundle's blank lines at section boundaries.
const blankLineAfter = new Set([
  "core.js",
  "views.js",
  "draw-and-selects.js",
  "editors.js",
  "dialogs-and-media.js",
  "barcode-and-mutations.js",
]);

export function buildApp() {
  const output = resolve(root, "public/app.js");
  const source = parts
    .map(
      (part) =>
        readFileSync(resolve(root, "src/app", part), "utf8") +
        (blankLineAfter.has(part) ? "\n" : ""),
    )
    .join("");
  try {
    if (readFileSync(output, "utf8") === source) return false;
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  writeFileSync(output, source);
  return true;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) buildApp();
