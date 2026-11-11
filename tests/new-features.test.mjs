import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { validatedStock } from "../lib/inventory.js";
import { createAlertHandlers, createCronHandler } from "../lib/alerts.js";

const pass = "test-only-password-1234567890123456";
process.env.HOME_STOCK_SECRET = pass;
const origin = "https://home-stock.test";
const encode = (body) =>
  new Request(origin + "/api/alerts", {
    method: "POST",
    headers: { origin, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
const store = () => {
  let object;
  return {
    read: () => object || null,
    write: (_, bytes, { version }) => {
      if (version !== (object?.version ?? null)) throw new Error("CAS mismatch");
      const next = randomUUID();
      object = { version: next, bytes };
      return next;
    },
    remove: () => {},
  };
};
const auth = async () => {
  const { login } = await import("../lib/session.js");
  const request = new Request(origin + "/api/session", {
    method: "POST",
    headers: { origin, "content-type": "application/json" },
    body: JSON.stringify({ password: pass }),
  });
  return (await login(request)).headers.get("set-cookie").split(";")[0];
};

test("old snapshot accepts new purchase history and minimum settings", () => {
  const old = { items: [], shopping: [], version: null };
  assert.equal(validatedStock(old).items.length, 0);
  const newState = validatedStock({
    ...old,
    recentItems: [{ name: "ไข่", unit: "ฟอง", category: "ของสด", location: "ตู้เย็น" }],
    minLevels: [{ name: "ไข่", unit: "ฟอง", qty: 4 }],
  });
  assert.equal(newState.minLevels[0].qty, 4);
  assert.throws(() =>
    validatedStock({ ...old, minLevels: [{ name: "ไข่", unit: "ฟอง", qty: -1 }] }),
  );
});

test("alerts require login and cron secret; settings persist without stock version change", async () => {
  const data = store();
  const api = createAlertHandlers(data);
  assert.equal((await api.POST(encode({ days: 3 }))).status, 401);
  const cookie = await auth();
  const request = encode({
    days: 3,
    subscription: {
      endpoint: "https://push.example/subscription",
      keys: { p256dh: "abc", auth: "def" },
    },
  });
  request.headers.set("cookie", cookie);
  assert.equal((await api.POST(request)).status, 200);
  const result = await api.GET(new Request(origin + "/api/alerts", { headers: { cookie } }));
  assert.equal((await result.json()).days, 3);
  const snapshot = JSON.parse(
    Buffer.from((await data.read("home-stock/stock.json")).bytes).toString(),
  );
  assert.equal(snapshot.version, null);
  assert.equal(snapshot.subscriptions.length, 1);
  const cron = createCronHandler(data);
  assert.equal((await cron(new Request(origin + "/api/alerts-cron"))).status, 401);
  process.env.CRON_SECRET = "cron-test-123";
  const response = await cron(
    new Request(origin + "/api/alerts-cron", {
      headers: { authorization: "Bearer cron-test-123" },
    }),
  );
  assert.deepEqual(await response.json(), { sent: 0 });
});

test("barcode persists on products and purchase history while older rows stay valid", () => {
  const item = {
    id: randomUUID(),
    name: "นม",
    qty: 1,
    unit: "กล่อง",
    category: "ของสด",
    location: "ตู้เย็น",
    date: "",
    dateKind: "expiry",
    photo: null,
    barcode: "8851234567890",
  };
  const data = validatedStock({
    items: [item],
    shopping: [],
    recentItems: [
      { name: "นม", unit: "กล่อง", category: "ของสด", location: "ตู้เย็น", barcode: item.barcode },
    ],
    version: null,
  });
  assert.equal(data.items[0].barcode, item.barcode);
  assert.equal(data.recentItems[0].barcode, item.barcode);
  const { barcode: _unused, ...oldItem } = item;
  assert.equal(
    Object.hasOwn(
      validatedStock({ items: [oldItem], shopping: [], version: null }).items[0],
      "barcode",
    ),
    false,
  );
  assert.throws(() =>
    validatedStock({ items: [{ ...item, barcode: "bad code" }], shopping: [], version: null }),
  );
});
