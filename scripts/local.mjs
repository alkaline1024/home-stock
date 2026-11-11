import { createServer } from "node:http";
import { DatabaseSync } from "node:sqlite";
import { randomBytes, randomUUID } from "node:crypto";
import { networkInterfaces } from "node:os";
import { mkdirSync, readFileSync, writeFileSync, chmodSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { Readable } from "node:stream";
import { HttpError } from "../lib/http.js";
import { createStockHandlers } from "../lib/stock.js";
import { createPhotoHandlers } from "../lib/photo.js";
import { login } from "../lib/session.js";
import { createAlertHandlers, createCronHandler } from "../lib/alerts.js";
import { createReceiptAiHandlers } from "../lib/receipt-ai.js";

// Production uses api/ and private Vercel Blob.
const hostMode = process.argv.includes("--host");
const bindHost = hostMode ? "0.0.0.0" : "127.0.0.1";
const root = fileURLToPath(new URL("../", import.meta.url));
const dataDir = process.env.HOME_STOCK_DIR || resolve(root, ".local-stock");
mkdirSync(dataDir, { recursive: true, mode: 0o700 });
const keyPath = resolve(dataDir, "access-key.txt");
if (!process.env.HOME_STOCK_SECRET) {
  try {
    writeFileSync(keyPath, randomBytes(24).toString("base64url"), {
      flag: "wx",
      mode: 0o600,
    });
  } catch (error) {
    if (error.code !== "EEXIST") throw error;
  }
  process.env.HOME_STOCK_SECRET = readFileSync(keyPath, "utf8").trim();
}
const databasePath = resolve(dataDir, "stock.sqlite");
const db = new DatabaseSync(databasePath);
chmodSync(databasePath, 0o600);
db.exec(
  "CREATE TABLE IF NOT EXISTS objects(path TEXT PRIMARY KEY, version TEXT NOT NULL, bytes BLOB NOT NULL)",
);
const read = db.prepare("SELECT version,bytes FROM objects WHERE path=?");
const create = db.prepare("INSERT OR IGNORE INTO objects(path,version,bytes) VALUES(?,?,?)");
const replace = db.prepare("UPDATE objects SET version=?, bytes=? WHERE path=? AND version=?");
const remove = db.prepare("DELETE FROM objects WHERE path=?");
const store = {
  read: (path) => read.get(path) || null,
  write(path, bytes, { version }) {
    const next = randomUUID();
    const result =
      version === null ? create.run(path, next, bytes) : replace.run(next, bytes, path, version);
    if (!result.changes) throw new HttpError(409, "ข้อมูลมีการเปลี่ยนแปลง กรุณาลองอีกครั้ง");
    return next;
  },
  remove: (path) => {
    remove.run(path);
  },
};
const routes = {
  "/api/stock": createStockHandlers(store),
  "/api/alerts": createAlertHandlers(store),
  "/api/alerts-cron": { GET: createCronHandler(store) },
  "/api/photo": createPhotoHandlers(store),
  "/api/session": { POST: login },
  "/api/receipt-ai": createReceiptAiHandlers(),
};
const assets = new Map([
  ["/", ["index.html", "text/html; charset=utf-8"]],
  ["/index.html", ["index.html", "text/html; charset=utf-8"]],
  ["/app.js", ["app.js", "text/javascript; charset=utf-8"]],
  ["/ocr/tesseract.min.js", ["ocr/tesseract.min.js", "text/javascript; charset=utf-8"]],
  ["/receipt.js", ["receipt.js", "text/javascript; charset=utf-8"]],
  ["/receipt-parser.js", ["receipt-parser.js", "text/javascript; charset=utf-8"]],
  ["/ocr/worker.min.js", ["ocr/worker.min.js", "text/javascript; charset=utf-8"]],
  ["/barcode-scanner.js", ["barcode-scanner.js", "text/javascript; charset=utf-8"]],
  ["/sw.js", ["sw.js", "text/javascript; charset=utf-8"]],
  ["/manifest.webmanifest", ["manifest.webmanifest", "application/manifest+json"]],
  ["/app.css", ["app.css", "text/css; charset=utf-8"]],
  ["/item-icons.svg", ["item-icons.svg", "image/svg+xml"]],
  ["/favicon.ico", ["favicon.ico", "image/x-icon"]],
  [
    "/exceljs.min.js",
    ["../node_modules/exceljs/dist/exceljs.min.js", "text/javascript; charset=utf-8"],
  ],
  ["/home-stock.html", ["home-stock.html", "text/html; charset=utf-8"]],
]);
for (const name of readdirSync(resolve(root, "public/ocr/core")))
  assets.set("/ocr/core/" + name, [
    "ocr/core/" + name,
    name.endsWith(".wasm") ? "application/wasm" : "text/javascript; charset=utf-8",
  ]);
for (const name of readdirSync(resolve(root, "public/icons")))
  assets.set("/icons/" + name, [
    "icons/" + name,
    name.endsWith(".svg") ? "image/svg+xml" : "image/png",
  ]);
for (const language of ["tha", "eng"])
  assets.set("/ocr/lang/" + language + ".traineddata.gz", [
    "ocr/lang/" + language + ".traineddata.gz",
    "application/gzip",
  ]);
const server = createServer(async (req, res) => {
  try {
    const port = server.address().port;
    const hostHeader = req.headers.host;
    let requestOrigin;
    try {
      requestOrigin = new URL("http://" + hostHeader);
    } catch {
      res.writeHead(403).end();
      return;
    }
    const allowedHosts = new Set(["127.0.0.1", "localhost", "::1"]);
    if (hostMode) {
      for (const addresses of Object.values(networkInterfaces()))
        for (const address of addresses || [])
          allowedHosts.add(address.address.replace(/^::ffff:/, ""));
    }
    const requestHostname = requestOrigin.hostname.replace(/^\[|\]$/g, "");
    if (requestOrigin.port !== String(port) || !allowedHosts.has(requestHostname)) {
      res.writeHead(403).end();
      return;
    }
    const url = new URL(req.url, requestOrigin);
    if (url.host !== requestOrigin.host) {
      res.writeHead(403).end();
      return;
    }
    const handlers = Object.hasOwn(routes, url.pathname) && routes[url.pathname];
    if (handlers) {
      const handler = handlers[req.method];
      if (!handler) {
        res.writeHead(405).end();
        return;
      }
      const options = { method: req.method, headers: req.headers };
      if (req.method === "POST")
        Object.assign(options, { body: Readable.toWeb(req), duplex: "half" });
      const result = await handler(new Request(url, options));
      res.writeHead(result.status, Object.fromEntries(result.headers.entries()));
      res.end(Buffer.from(await result.arrayBuffer()));
      return;
    }
    const asset = assets.get(url.pathname);
    if (req.method !== "GET" || !asset) {
      res.writeHead(404).end();
      return;
    }
    const bytes = readFileSync(resolve(root, "public", asset[0]));
    res.writeHead(200, {
      "Content-Type": asset[1],
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    });
    res.end(bytes);
  } catch (error) {
    console.error("Request failed:", error.name, error.status || "");
    if (!res.headersSent)
      res.writeHead(error.status || 500, {
        "Content-Type": "application/json",
      });
    res.end(JSON.stringify({ error: "ดำเนินการไม่สำเร็จ" }));
  }
});
server.listen(Number(process.env.PORT || 4177), bindHost, () => {
  const port = server.address().port;
  console.log("home-stock: http://127.0.0.1:" + port);
  if (hostMode) {
    for (const addresses of Object.values(networkInterfaces()))
      for (const address of addresses || [])
        if (address.family === "IPv4" && !address.internal)
          console.log("Network: http://" + address.address + ":" + port);
    console.log("Network access enabled; use only on a trusted network.");
  }
  if (!process.env.HOME_STOCK_DIR) console.log("Local access key (if generated): " + keyPath);
});
