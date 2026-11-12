import assert from "node:assert/strict";
import { test } from "node:test";
import { createReceiptOcrHandlers } from "../lib/receipt-ocr.js";
import { login } from "../lib/session.js";

test("OpenThai proxy authenticates users, validates images and handles unavailable service", async () => {
  const previous = process.env.HOME_STOCK_SECRET;
  process.env.HOME_STOCK_SECRET = "openthai-test-secret";
  const origin = "https://home-stock.test";
  let cookie = "";
  const request = (body) =>
    new Request(origin + "/api/receipt-ocr", {
      method: body === undefined ? "GET" : "POST",
      headers: { origin, cookie, "content-type": "image/png" },
      ...(body === undefined ? {} : { body }),
    });
  let calls = 0;
  const handlers = createReceiptOcrHandlers(async (url, options) => {
    calls++;
    if (String(url).endsWith("health")) return Response.json({});
    assert.equal(options.headers["Content-Type"], "image/png");
    return Response.json({ text: "ไข่ไก่ 1 55.00" });
  });
  try {
    assert.equal((await handlers.GET(request())).status, 401);
    assert.equal(calls, 0);
    const response = await login(
      new Request(origin + "/api/session", {
        method: "POST",
        headers: { origin, "content-type": "application/json" },
        body: JSON.stringify({ password: process.env.HOME_STOCK_SECRET }),
      }),
    );
    cookie = response.headers.get("set-cookie").split(";")[0];
    assert.equal((await (await handlers.GET(request())).json()).available, true);
    assert.equal((await handlers.POST(request(Buffer.from("bad")))).status, 400);
    const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
    assert.equal((await (await handlers.POST(request(png))).json()).text, "ไข่ไก่ 1 55.00");
    const offline = createReceiptOcrHandlers(async () => {
      throw new Error("offline");
    });
    assert.equal((await (await offline.GET(request())).json()).available, false);
    assert.equal((await offline.POST(request(png))).status, 503);
  } finally {
    if (previous === undefined) delete process.env.HOME_STOCK_SECRET;
    else process.env.HOME_STOCK_SECRET = previous;
  }
});

test("receipt scanning selects OpenThai and falls back when it fails", async () => {
  const { readFileSync } = await import("node:fs");
  const vm = await import("node:vm");
  const source = readFileSync(new URL("../public/receipt.js", import.meta.url), "utf8")
    .replace(/^import .*;\n/, "")
    .replaceAll("export async function", "async function");
  for (const fail of [false, true]) {
    let terminated = false;
    let workerCreated = false;
    const context = vm.createContext({
      AbortSignal,
      parseReceipt: (text) => [{ name: text }],
      fetch: async (_url, options) => {
        if (!options?.method) return Response.json({ available: true });
        if (fail) throw new Error("offline");
        return Response.json({ text: "OpenThai text" });
      },
    });
    vm.runInContext(source, context);
    context.prepareImage = async () => "image";
    context.loadLibrary = async () => ({
      createWorker: async () => {
        workerCreated = true;
        return {
          recognize: async () => ({ data: { text: "Tesseract text" } }),
          terminate: async () => {
            terminated = true;
          },
        };
      },
    });
    const result = await context.scanReceipt({}, []);
    assert.equal(result.engine, fail ? "tesseract" : "openthai");
    assert.equal(workerCreated, fail);
    assert.equal(terminated, fail);
    assert.equal(result.rows[0].name, fail ? "Tesseract text" : "OpenThai text");
  }
});
