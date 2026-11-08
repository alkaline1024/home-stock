import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { HttpError } from "../lib/http.js";
import { login } from "../lib/session.js";
import { createStockHandlers } from "../lib/stock.js";
import { createPhotoHandlers } from "../lib/photo.js";

test("authenticated media lifecycle persists icons and safely reuses and retires photos", async () => {
  const previousSecret = process.env.HOME_STOCK_SECRET;
  process.env.HOME_STOCK_SECRET = "media-api-test-only";
  const objects = new Map();
  const store = {
    read(path) { return objects.get(path) || null; },
    write(path, bytes, { version }) {
      if ((objects.get(path)?.version ?? null) !== version)
        throw new HttpError(409, "test conflict");
      const next = randomUUID();
      objects.set(path, { bytes: Buffer.from(bytes), version: next });
      return next;
    },
    remove(path) { objects.delete(path); },
  };
  const stock = createStockHandlers(store), photos = createPhotoHandlers(store);
  const origin = "http://127.0.0.1:4188";
  let cookie = "";
  const request = (path, body, contentType = "application/json") =>
    new Request(origin + "/api/" + path, {
      method: body === undefined ? "GET" : "POST",
      headers: { origin, cookie, "Content-Type": contentType },
      ...(body === undefined ? {} : {
        body: contentType === "application/json" ? JSON.stringify(body) : body,
      }),
    });
  const read = async () => {
    const response = await stock.GET(request("stock"));
    assert.equal(response.status, 200);
    return response.json();
  };
  const write = async (data, status = 200) => {
    const response = await stock.POST(request("stock", data));
    assert.equal(response.status, status, await response.clone().text());
  };
  try {
    assert.equal((await stock.GET(request("stock"))).status, 401);
    assert.equal((await photos.POST(request("photo", Buffer.from([1]), "image/jpeg"))).status, 401);
    assert.equal((await login(request("session", { password: "wrong-password" }))).status, 401);
    const loggedIn = await login(request("session", { password: process.env.HOME_STOCK_SECRET }));
    assert.equal(loggedIn.status, 200);
    cookie = loggedIn.headers.get("set-cookie").split(";")[0];
    const initial = await read();
    initial.items = ["ข้าว", "นม"].map((name) => ({
      id: randomUUID(), name, qty: 2, unit: "ชิ้น", category: "ของสด",
      location: "", date: "", dateKind: "expiry", photo: null, icon: "box",
    }));
    await write(initial);
    assert.equal((await read()).items[0].icon, "box");

    const uploaded = await photos.POST(request(
      "photo", Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0xff, 0xd9]), "image/jpeg",
    ));
    assert.equal(uploaded.status, 201);
    const { id } = await uploaded.json();
    const withPhoto = await read();
    withPhoto.items[0].photo = id;
    withPhoto.items[0].icon = null;
    await write(withPhoto);
    const shared = await read();
    shared.items[1].photo = id;
    shared.items[1].icon = null;
    await write(shared);
    assert.equal((await photos.GET(request("photo?id=" + id))).status, 200);

    const firstIcon = await read();
    firstIcon.items[0].photo = null;
    firstIcon.items[0].icon = "grain";
    await write(firstIcon);
    assert.equal((await photos.GET(request("photo?id=" + id))).status, 200);
    assert.equal((await read()).items[1].photo, id);

    const invalid = await read();
    invalid.items[0].icon = "<svg>";
    await write(invalid, 400);
    assert.equal((await read()).items[0].icon, "grain");
    const stale = await read();
    const updated = structuredClone(stale);
    updated.items[0].qty = 3;
    await write(updated);
    stale.items[0].icon = "egg";
    await write(stale, 409);
    assert.equal((await read()).items[0].icon, "grain");

    const lastIcon = await read();
    lastIcon.items[1].photo = null;
    lastIcon.items[1].icon = "milk";
    await write(lastIcon);
    assert.equal((await photos.GET(request("photo?id=" + id))).status, 404);
    assert.equal((await read()).items[1].icon, "milk");
    const retired = await read();
    retired.items[0].photo = id;
    retired.items[0].icon = null;
    await write(retired, 400);
  } finally {
    objects.clear();
    if (previousSecret === undefined) delete process.env.HOME_STOCK_SECRET;
    else process.env.HOME_STOCK_SECRET = previousSecret;
  }
});
