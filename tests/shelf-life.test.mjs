import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import vm from "node:vm";
import { validatedStock } from "../lib/inventory.js";

const dictionary = readFileSync(new URL("../public/shelf-life-data.js", import.meta.url), "utf8");
const calculator = readFileSync(new URL("../src/app/core.js", import.meta.url), "utf8");

function suggestion(name, receivedDate, category, location) {
  const context = vm.createContext({});
  vm.runInContext(dictionary, context);
  const start = calculator.indexOf("const key =");
  const end = calculator.indexOf("const amount =", start);
  vm.runInContext(calculator.slice(start, end), context);
  return vm.runInContext(
    `suggestedShelfLife(${JSON.stringify(name)}, ${JSON.stringify(receivedDate)}, ${JSON.stringify(category)}, ${JSON.stringify(location)})`,
    context,
  );
}

test("suggests a date from food name, received date, category and storage", () => {
  assert.equal(suggestion("ผักชีสด", "2026-11-11", "ผัก", "ตู้เย็น")?.date, "2026-11-16");
  assert.equal(suggestion("ผักกาดขาว", "2026-11-11", "ผัก", "ช่องผัก")?.date, "2026-11-18");
  assert.equal(suggestion("อกไก่", "2026-11-11", "เนื้อสัตว์", "ช่องแช่แข็ง")?.date, "2027-03-11");
  assert.equal(suggestion("ไข่ไก่", "2026-11-11", "ของสด", "ตู้เย็น")?.date, "2026-12-02");
});

test("does not invent a date for unsupported combinations", () => {
  assert.equal(suggestion("ผักชี", "2026-11-11", "ผัก", "ชั้นวาง"), null);
  assert.equal(suggestion("ไข่ไก่", "2026-11-11", "ขนม", "ตู้เย็น"), null);
  assert.equal(suggestion("อาหารไม่รู้จัก", "2026-11-11", "ผัก", "ตู้เย็น"), null);
  assert.equal(suggestion("ผักชี", "2026-02-30", "ผัก", "ตู้เย็น"), null);
});

test("expanded dictionary covers common foods without confusing similar names", () => {
  const context = vm.createContext({});
  vm.runInContext(dictionary, context);
  assert.ok(context.shelfLifeRules.length >= 100);
  for (const rule of context.shelfLifeRules) {
    assert.ok(rule.name && rule.keywords.length && rule.categories.length);
    assert.ok(Object.values(rule.days).every((days) => Number.isInteger(days) && days > 0));
  }
  assert.equal(suggestion("ผักกาด", "2026-11-11", "ผัก", "ตู้เย็น")?.days, 2);
  assert.equal(suggestion("ผักกาดขาว", "2026-11-11", "ผัก", "ตู้เย็น")?.days, 7);
  assert.equal(suggestion("ดอกกะหล่ำ", "2026-11-11", "ผัก", "ตู้เย็น")?.days, 5);
  assert.equal(suggestion("ต้นกระเทียม", "2026-11-11", "ผัก", "ตู้เย็น")?.days, 7);
  assert.equal(suggestion("มะม่วงสุก", "2026-11-11", "ของสด", "ตู้เย็น")?.days, 7);
  assert.equal(suggestion("มันฝรั่ง", "2026-11-11", "ผัก", "ชั้นวาง")?.days, 30);
  assert.equal(suggestion("ปลานิล", "2026-11-11", "เนื้อสัตว์", "ตู้เย็น")?.days, 2);
  assert.equal(suggestion("สลัดทูน่า", "2026-11-11", "อาหารปรุงสุก", "ตู้เย็น")?.days, 3);
  assert.equal(suggestion("เนื้อไก่", "2026-11-11", "เนื้อสัตว์", "ชั้นวาง"), null);
  assert.equal(suggestion("กระเทียม", "2026-11-11", "เครื่องปรุง", "ชั้นวาง")?.days, 30);
  assert.equal(suggestion("ผักขมไทย", "2026-11-11", "ผัก", "ตู้เย็น")?.days, 2);
  assert.equal(suggestion("สันคอหมูบั้ง", "2026-11-11", "เนื้อสัตว์", "ตู้เย็น")?.days, 3);
  assert.equal(suggestion("สันในไก่", "2026-11-11", "เนื้อสัตว์", "ตู้เย็น")?.days, 2);
});

test("received date survives stock validation", () => {
  const state = validatedStock({
    version: null,
    items: [
      {
        id: randomUUID(),
        name: "ผักชี",
        qty: 1,
        unit: "กำ",
        category: "ผัก",
        location: "ตู้เย็น",
        receivedDate: "2026-11-11",
        date: "2026-11-16",
        dateKind: "best-before",
        photo: null,
      },
    ],
    shopping: [],
  });
  assert.equal(state.items[0].receivedDate, "2026-11-11");
  assert.equal(state.items[0].dateKind, "best-before");
});

test("frozen name selects freezer once and preserves a later manual location", () => {
  const name = { value: "อกไก่ แช่แข็ง" };
  const location = { value: "ตู้เย็น" };
  const draft = { frozenNameSeen: false, freezerLocationManual: false };
  const context = vm.createContext({
    draft,
    $: (selector) => (selector === "#f-name" ? name : location),
    refreshShelfLifeSuggestion() {},
  });
  vm.runInContext(
    "const key = (value) => value.trim().normalize('NFC').toLocaleLowerCase();",
    context,
  );
  const start = calculator.indexOf("function selectFreezerForFrozenName(");
  const end = calculator.indexOf("const amount =", start);
  vm.runInContext(calculator.slice(start, end), context);
  vm.runInContext("selectFreezerForFrozenName()", context);
  assert.equal(location.value, "ช่องแช่แข็ง");

  location.value = "ตู้เย็น";
  draft.freezerLocationManual = true;
  name.value = "อกไก่ แช่แข็ง แพ็กใหญ่";
  vm.runInContext("selectFreezerForFrozenName()", context);
  assert.equal(location.value, "ตู้เย็น");
});
