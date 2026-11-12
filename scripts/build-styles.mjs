import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const root = fileURLToPath(new URL("../", import.meta.url));
const parts = [
  "base.css",
  "entry-and-loading.css",
  "navigation-and-stock.css",
  "calendar-and-meals.css",
  "items-and-forms.css",
  "responsive.css",
  "barcode-and-receipts.css",
];

export function buildStyles() {
  const output = resolve(root, "public/app.css");
  const source = parts
    .map(
      (part) =>
        readFileSync(resolve(root, "src/styles", part), "utf8") +
        (part === "responsive.css" ? "\n" : ""),
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

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) buildStyles();
