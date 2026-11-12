import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { test } from "node:test";

function worker() {
  const listeners = new Map();
  const stored = new Map();
  let requests = 0;
  let status = 200;
  const context = vm.createContext({
    URL,
    self: {
      location: { origin: "https://home-stock.test" },
      addEventListener: (type, listener) => listeners.set(type, listener),
    },
    caches: {
      open: async () => ({
        match: async (request) => stored.get(request.url)?.clone(),
        put: async (request, response) => stored.set(request.url, response),
      }),
      delete: async () => stored.clear(),
    },
    fetch: async () => {
      requests++;
      return new Response("image", { status, headers: { "content-type": "image/jpeg" } });
    },
  });
  vm.runInContext(readFileSync(new URL("../public/sw.js", import.meta.url), "utf8"), context);
  return {
    get requests() {
      return requests;
    },
    set status(value) {
      status = value;
    },
    get size() {
      return stored.size;
    },
    async fetch(path, options) {
      let result;
      listeners.get("fetch")({
        request: new Request("https://home-stock.test" + path, options),
        respondWith: (response) => {
          result = response;
        },
      });
      return await result;
    },
  };
}
const first = "/api/photo?id=00000000-0000-4000-8000-000000000001";
const second = "/api/photo?id=00000000-0000-4000-8000-000000000002";
test("photos are fetched once per ID and a replacement ID fetches a new image", async () => {
  const app = worker();
  assert.equal(await (await app.fetch(first)).text(), "image");
  await app.fetch(first);
  assert.equal(app.requests, 1);
  await app.fetch(second);
  assert.equal(app.requests, 2);
  assert.equal(app.size, 2);
});
test("failed photo responses are not cached and logout clears stored images", async () => {
  const app = worker();
  app.status = 404;
  await app.fetch(first);
  await app.fetch(first);
  assert.equal(app.size, 0);
  assert.equal(app.requests, 2);
  app.status = 200;
  await app.fetch(first);
  await app.fetch("/api/session", { method: "POST", body: JSON.stringify({ logout: true }) });
  assert.equal(app.size, 0);
  await app.fetch(first);
  assert.equal(app.requests, 5);
});
