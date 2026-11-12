import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const root = fileURLToPath(new URL("../", import.meta.url));

export function buildTailwind() {
  execFileSync(
    resolve(root, "node_modules/.bin/tailwindcss"),
    [
      "-i",
      resolve(root, "src/styles/tailwind.css"),
      "-o",
      resolve(root, "public/tailwind.css"),
      "--minify",
    ],
    { cwd: root, stdio: "pipe" },
  );
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) buildTailwind();
