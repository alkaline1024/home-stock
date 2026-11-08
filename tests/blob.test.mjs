import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { BlobError, BlobNotFoundError, BlobPreconditionFailedError } from "@vercel/blob";
import { createBlobStore } from "../lib/blob.js";
import { HttpError } from "../lib/http.js";
import { mutate, readState } from "../lib/state.js";
import { login } from "../lib/session.js";
import { createStockHandlers } from "../lib/stock.js";

function storage() {
  let bytes = Buffer.from(JSON.stringify({
    version: randomUUID(), items: [], shopping: [], recipes: [], mealPlans: [],
    pending: [], retired: [],
  }));
  let etag = '"storage-1"';
  let exists = true;
  const calls = [];
  const sdk = {
    async head() {
      calls.push(["head"]);
      if (!exists) throw new BlobNotFoundError();
      return { etag };
    },
    async get(path, options) {
      calls.push(["get", path, options]);
      if (!exists) return null;
      return {
        blob: { etag: 'W/"download-representation"' },
        stream: new Response(bytes).body,
      };
    },
    async put(path, body, options) {
      calls.push(["put", path, options]);
      if (exists && (!options.allowOverwrite || options.ifMatch !== etag))
        throw new BlobPreconditionFailedError();
      bytes = Buffer.from(body);
      etag = '"' + randomUUID() + '"';
      exists = true;
      return { etag };
    },
    async del() { exists = false; },
  };
  return {
    sdk, calls,
    get etag() { return etag; },
    get bytes() { return bytes; },
    set exists(value) { exists = value; },
    change() {
      etag = '"' + randomUUID() + '"';
      const data = JSON.parse(bytes);
      data.shopping.push({ id: randomUUID(), name: "external", qty: 1, unit: "ชิ้น" });
      bytes = Buffer.from(JSON.stringify(data));
    },
  };
}

test("reproduces exhausted CAS retries with download ETag, then saves with storage metadata ETag", async () => {
  const fake = storage();
  const store = createBlobStore(fake.sdk);
  const oldStore = {
    ...store,
    async read(path) {
      const result = await fake.sdk.get(path, { access: "private", useCache: false });
      return { bytes: new Uint8Array(await new Response(result.stream).arrayBuffer()),
        version: result.blob.etag };
    },
  };
  await assert.rejects(mutate(oldStore, (data) => { data.recipes = []; }),
    (error) => error.status === 409 && /ข้อมูลมีการแก้ไขพร้อมกัน/.test(error.message));
  assert.equal(fake.calls.filter(([method]) => method === "put").length, 5);
  fake.calls.length = 0;
  await mutate(store, (data) => { data.version = randomUUID(); });
  assert.equal(fake.calls.filter(([method]) => method === "put").length, 1);
  const written = fake.calls.find(([method]) => method === "put")[2];
  assert.equal(written.ifMatch, '"storage-1"');
  assert.equal(written.allowOverwrite, true);
  assert.equal(written.addRandomSuffix, false);
  assert.equal(written.access, "private");
});

test("metadata brackets uncached content reads and retries if the object changes mid-read", async () => {
  const fake = storage();
  const originalGet = fake.sdk.get;
  let changed = false;
  fake.sdk.get = async (...args) => {
    const result = await originalGet(...args);
    if (!changed) { changed = true; fake.change(); }
    return result;
  };
  const result = await createBlobStore(fake.sdk).read("home-stock/stock.json");
  assert.equal(JSON.parse(result.bytes).shopping.length, 1);
  assert.equal(result.version, fake.etag);
  assert.equal(fake.calls.filter(([method]) => method === "get").length, 2);
  for (const [method, , options] of fake.calls) {
    if (method === "get") assert.deepEqual(options, { access: "private", useCache: false });
  }
});

test("continuous changes fail explicitly without returning mismatched bytes and version", async () => {
  const fake = storage();
  const get = fake.sdk.get;
  fake.sdk.get = async (...args) => {
    const result = await get(...args);
    fake.change();
    return result;
  };
  await assert.rejects(createBlobStore(fake.sdk).read("home-stock/stock.json"),
    (error) => error instanceof HttpError && error.status === 409);
  assert.equal(fake.calls.filter(([method]) => method === "get").length, 5);
});

test("missing state is created without overwriting an existing object", async () => {
  const fake = storage();
  fake.exists = false;
  const store = createBlobStore(fake.sdk);
  assert.equal(await store.read("home-stock/stock.json"), null);
  await mutate(store, (data) => { data.version = randomUUID(); });
  const options = fake.calls.find(([method]) => method === "put")[2];
  assert.equal(options.allowOverwrite, false);
  assert.equal(Object.hasOwn(options, "ifMatch"), false);
  assert.ok((await readState(store)).state.version);
});

test("real write conflicts are still rejected rather than overwritten", async () => {
  const fake = storage();
  const store = createBlobStore(fake.sdk);
  const read = await store.read("home-stock/stock.json");
  fake.change();
  await assert.rejects(store.write("home-stock/stock.json", read.bytes,
    { version: read.version, contentType: "application/json" }),
  (error) => error instanceof HttpError && error.status === 409);
  assert.equal(JSON.parse(fake.bytes).shopping.length, 1);
});

test("metadata errors and unusable validators never turn into create-only or unguarded writes", async () => {
  for (const etag of ["", 'W/"weak"']) {
    const fake = storage();
    fake.sdk.head = async () => ({ etag });
    await assert.rejects(createBlobStore(fake.sdk).read("home-stock/stock.json"),
      (error) => error.status === 503);
    assert.equal(fake.calls.filter(([method]) => method === "put").length, 0);
  }
  const fake = storage();
  const failure = new BlobError("storage unavailable");
  fake.sdk.head = async () => { throw failure; };
  await assert.rejects(createBlobStore(fake.sdk).read("home-stock/stock.json"),
    (error) => error === failure);
});

test("authenticated POST stock persists against the Blob adapter and rejects stale client versions", async () => {
  const previous = process.env.HOME_STOCK_SECRET;
  process.env.HOME_STOCK_SECRET = "blob-regression-test-only";
  const fake = storage();
  const handlers = createStockHandlers(createBlobStore(fake.sdk));
  const origin = "http://127.0.0.1:4188";
  try {
    const session = await login(new Request(origin + "/api/session", {
      method: "POST",
      headers: { origin, "Content-Type": "application/json" },
      body: JSON.stringify({ password: process.env.HOME_STOCK_SECRET }),
    }));
    assert.equal(session.status, 200);
    const cookie = session.headers.get("set-cookie").split(";")[0];
    const get = async () => {
      const response = await handlers.GET(new Request(origin + "/api/stock", { headers: { cookie } }));
      assert.equal(response.status, 200);
      return response.json();
    };
    const post = (data) => handlers.POST(new Request(origin + "/api/stock", {
      method: "POST", headers: { origin, cookie, "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }));
    const data = await get();
    data.items.push({
      id: randomUUID(), name: "ข้าว", qty: 1, unit: "ถุง", category: "ของแห้ง",
      location: "", date: "", dateKind: "expiry", photo: null,
    });
    const saved = await post(data);
    assert.equal(saved.status, 200, await saved.clone().text());
    const current = await get();
    assert.equal(current.items.length, 1);
    assert.notEqual(current.version, data.version);
    current.items[0].qty = 2;
    assert.equal((await post(current)).status, 200);
    assert.equal((await get()).items[0].qty, 2);
    assert.equal((await post(data)).status, 409);
    assert.equal((await get()).items[0].qty, 2);
  } finally {
    if (previous === undefined) delete process.env.HOME_STOCK_SECRET;
    else process.env.HOME_STOCK_SECRET = previous;
  }
});
