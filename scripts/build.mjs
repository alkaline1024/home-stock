import { copyFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const root = fileURLToPath(new URL("../", import.meta.url));
copyFileSync(
  resolve(root, "node_modules/exceljs/dist/exceljs.min.js"),
  resolve(root, "public/exceljs.min.js"),
);
console.log("Built public/exceljs.min.js");
