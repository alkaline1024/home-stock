import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import vm from "node:vm";
import { validatedStock } from "../lib/inventory.js";

const source = readFileSync(new URL("../public/app.js", import.meta.url), "utf8");
const rowStart = source.indexOf("let receiptRowId = 0;");
const rowEnd = source.indexOf("function receiptField(", rowStart);
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

test("receipt review exposes every add-item field in the same order", () => {
  const context = vm.createContext({
    stock: { items: [{ name: "ข้าว", location: "ชั้นวาง" }], recentItems: [] },
    rooms: ["ตู้เย็น", "ช่องแช่แข็ง"],
    categories: ["ของสด", "อื่น ๆ"],
    document: { createElement: () => ({}) },
    esc: (value) => String(value),
    opts: () => "",
    calendarDateKey: (year, month, day) =>
      `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
    dateInputLabel: (value) => value,
  });
  vm.runInContext(source.slice(rowStart, rowEnd), context);
  const card = vm.runInContext("receiptRow({ name: 'ไข่ไก่', qty: 0 })", context);
  const fields = [...card.innerHTML.matchAll(/data-field="([^"]+)"/g)].map((match) => match[1]);
  assert.deepEqual(fields, [
    "name",
    "qty",
    "unit",
    "category",
    "location",
    "barcode",
    "receivedDate",
    "dateKind",
    "date",
    "notifyBeforeDays",
  ]);
  assert.match(card.innerHTML, /data-field="qty"[^>]*inputmode="decimal"[^>]*value="0"/);
  assert.match(card.innerHTML, /data-field="location"[^>]*value="ชั้นวาง"/);
  assert.match(card.innerHTML, /data-field="receivedDate"[^>]*value="\d{4}-\d{2}-\d{2}"/);
  for (const action of ["receipt-pick-media", "receipt-scan-barcode", "receipt-apply-shelf-life"])
    assert.match(card.innerHTML, new RegExp(`data-action="${action}"`));
  assert.match(card.innerHTML, /receipt-barcode-zoom/);
  assert.match(card.innerHTML, /receipt-barcode-torch/);
  assert.match(card.innerHTML, /ใส่ 0 เพื่อเตือนในวันที่กำหนด/);
});

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
