import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import vm from "node:vm";
import { validatedStock } from "../lib/inventory.js";

const source = readFileSync(new URL("../public/app.js", import.meta.url), "utf8");
const start = source.indexOf("function receiptItem(");
const end = source.indexOf("function enhanceReceiptRow(", start);

function makeItem(
  overrides = {},
  media = { photo: null, icon: "egg", iconColor: "#14532d", iconBackground: "#dcfce7" },
) {
  const fields = {
    name: "ไข่ไก่",
    qty: "10",
    unit: "ฟอง",
    category: "ของสด",
    location: "ตู้เย็น",
    barcode: "12345678",
    receivedDate: "2026-11-11",
    dateKind: "best-before",
    date: "2026-12-02",
    notifyBeforeDays: "0",
    ...overrides,
  };
  const card = {
    receiptMedia: media,
    querySelector(selector) {
      const field = /\[data-field="([^"]+)"\]/.exec(selector)?.[1];
      return { value: fields[field] };
    },
  };
  const context = vm.createContext({
    crypto: { randomUUID },
    round: (number) => Math.round(number * 1000) / 1000,
    receiptField: (entry, name) => entry.querySelector(`[data-field="${name}"]`),
  });
  vm.runInContext(source.slice(start, end), context);
  context.card = card;
  return vm.runInContext("receiptItem(card, 1)", context);
}

test("receipt review saves dates, reminder, barcode and icon colors", () => {
  const item = makeItem();
  const saved = validatedStock({ version: null, items: [item], shopping: [] }).items[0];
  assert.equal(saved.receivedDate, "2026-11-11");
  assert.equal(saved.dateKind, "best-before");
  assert.equal(saved.date, "2026-12-02");
  assert.equal(saved.notifyBeforeDays, 0);
  assert.equal(saved.barcode, "12345678");
  assert.equal(saved.icon, "egg");
  assert.equal(saved.iconColor, "#14532d");
  assert.equal(saved.iconBackground, "#dcfce7");
});

test("receipt review keeps pending photo for upload and rejects bad reminder", () => {
  const blob = { bytes: "photo" };
  const item = makeItem({}, { photo: null, icon: null, blob });
  assert.equal(item.pendingPhoto, blob);
  assert.equal(item.photo, null);
  assert.throws(() => makeItem({ notifyBeforeDays: "366" }), /จำนวนวันแจ้งเตือน/);
});
