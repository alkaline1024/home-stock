import assert from "node:assert/strict";
import { test } from "node:test";
import { parseReceipt } from "../public/receipt-parser.js";

test("parses Thai and English product lines while excluding payment lines", () => {
  const rows = parseReceipt("นมสด 2 x 45.00 90.00\nRICE 1 150.00\nรวม 240.00\nเงินสด 300.00");
  assert.equal(rows.length, 2);
  assert.deepEqual(
    rows.map(({ name, qty }) => ({ name, qty })),
    [
      { name: "นมสด", qty: 2 },
      { name: "RICE", qty: 1 },
    ],
  );
});

test("reuses a known item unit, category, location and barcode", () => {
  const rows = parseReceipt("นมสด 1 45.00", [
    { name: "นมสด", unit: "กล่อง", category: "ของสด", location: "ตู้เย็น", barcode: "12345678" },
  ]);
  assert.deepEqual(rows[0], {
    name: "นมสด",
    qty: 1,
    unit: "กล่อง",
    category: "ของสด",
    location: "ตู้เย็น",
    barcode: "12345678",
    raw: "นมสด 1 45.00",
  });
});

test("does not mistake receipt headings or arbitrary text for products", () => {
  assert.deepEqual(parseReceipt("ใบเสร็จ\nวันที่ 10/11/2026\nขอบคุณค่ะ\nรายการสินค้า\nABC"), []);
});

test("pairs Thai receipt product, barcode and price rows without duplicate products", () => {
  const text =
    "โยเกิร์ตรสธรรมชาติ 450 ก 55.00\n(8851262054018)2 1 * 55.00\n55.00\n" +
    "เห็ดหอมสด 300 กรัม 69.00\nBB (28239031)1 1 * 69.00\n69.00\n" +
    "อกไก่บด กก.ละ 90.00\n(210057220090000005220.522 * 47.00\n" +
    "ยอดเงินรวม 171.00\nTOTAL 171.00";
  const rows = parseReceipt(text);
  assert.deepEqual(
    rows.map(({ qty, unit, barcode }) => ({ qty, unit, barcode })),
    [
      { qty: 1, unit: "ชิ้น", barcode: "8851262054018" },
      { qty: 1, unit: "ชิ้น", barcode: "28239031" },
      { qty: 0.522, unit: "กก.", barcode: "" },
    ],
  );
});

test("a known barcode restores the saved product name when Thai OCR is garbled", () => {
  const rows = parseReceipt("ผูกขมไทย 500กรัม แพคละ\n(29595013)1 1 * 79.00", [
    { name: "ผักขมไทย 500 กรัม", unit: "แพ็ค", category: "ผัก", location: "ตู้เย็น", barcode: "29595013" },
  ]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].name, "ผักขมไทย 500 กรัม");
  assert.equal(rows[0].unit, "แพ็ค");
});

test("document scans without prices still yield items from barcode rows", () => {
  const rows = parseReceipt(
    "ผักขมไทย 500กรัม แพ็คละ\n(29595013)1 1 *\n" + "สันในไก่ กก.ละ\n(210044310103000003640.364 *",
  );
  assert.equal(rows.length, 2);
  assert.equal(rows[0].barcode, "29595013");
  assert.equal(rows[1].qty, 0.364);
  assert.equal(rows[1].unit, "กก.");
});
