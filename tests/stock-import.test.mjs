import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import vm from "node:vm";
import ExcelJS from "exceljs";
import { itemIconIds, validatedStock } from "../lib/inventory.js";

const source = readFileSync(new URL("../public/app.js", import.meta.url), "utf8");
const browserExcel = readFileSync(new URL("../node_modules/exceljs/dist/exceljs.min.js", import.meta.url), "utf8");
const headers = [
  "ชื่อของ", "จำนวน", "หน่วย", "หมวด", "ที่เก็บ", "วันที่ (ถ้ามี)", "ติดตามวันที่",
];

function app(items = [], useBrowserExcel = false) {
  const elements = new Map();
  const element = (selector) => {
    if (!elements.has(selector)) elements.set(selector, {
      open: false, hidden: true, value: "", textContent: "", disabled: false,
      classList: { add() {}, remove() {} },
      style: { setProperty() {}, removeProperty() {} },
      addEventListener() {}, removeEventListener() {}, append() {}, remove() {}, click() {},
      querySelectorAll: () => [],
      showModal() { this.open = true; },
      close() { this.open = false; },
    });
    return elements.get(selector);
  };
  let downloaded;
  const context = vm.createContext({
    Intl, Date, Blob, structuredClone, crypto: { randomUUID },
    setImmediate,
    console, location: { hash: "#stock" },
    setTimeout(callback, delay) {
      const timer = setTimeout(callback, delay);
      if (delay >= 1000) timer.unref();
      return timer;
    },
    clearTimeout, setInterval() {},
    fetch: () => new Promise(() => {}),
    URL: {
      createObjectURL(blob) { downloaded = blob; return "blob:test"; },
      revokeObjectURL() {},
    },
    document: {
      querySelector: element, querySelectorAll: () => [],
      addEventListener() {}, createElement: () => element("link"),
      body: { append() {}, classList: { add() {}, remove() {} } },
    },
    window: {
      ExcelJS,
      addEventListener() {},
      matchMedia: () => ({ matches: false }),
    },
  });
  if (useBrowserExcel) vm.runInContext(browserExcel, context);
  vm.runInContext(source, context);
  context.initial = { items, shopping: [], recipes: [], mealPlans: [], version: randomUUID() };
  vm.runInContext("stock = initial; draw = () => {};", context);
  return { context, element, getDownload: () => downloaded };
}

function workbook(rows) {
  const book = new ExcelJS.Workbook();
  const sheet = book.addWorksheet("นำเข้าของ");
  sheet.addRow(headers);
  rows.forEach((row) => sheet.addRow(row));
  return book;
}

const row = ["ข้าว", 1.125, "ถุง", "ของแห้ง", "ชั้นวาง", "", ""];

test("template round-trips with named dropdowns through row 2001 and existing units/locations", async () => {
  const { context, getDownload } = app([
    { name: "ข้าว", unit: "กระสอบ", location: "ชั้นบน" },
  ], true);
  await context.downloadStockTemplate();
  const book = new ExcelJS.Workbook();
  await book.xlsx.load(await getDownload().arrayBuffer());
  const sheet = book.getWorksheet("นำเข้าของ");
  assert.deepEqual(sheet.getRow(1).values.slice(1), headers);
  assert.equal(book.getWorksheet("Lists").state, "hidden");
  const expected = { 1: "ItemNames", 3: "UnitOptions", 4: "CategoryOptions",
    5: "LocationOptions", 7: "DateKindOptions" };
  for (const row of [2, 1000, 2001]) {
    for (const [column, name] of Object.entries(expected)) {
      const validation = sheet.getCell(row, Number(column)).dataValidation;
      assert.equal(validation.type, "list");
      assert.deepEqual(validation.formulae, [name]);
      assert.ok(book.definedNames.getRanges(name).ranges.length);
    }
  }
  assert.ok(book.getWorksheet("Lists").getColumn(2).values.includes("กระสอบ"));
  assert.ok(book.getWorksheet("Lists").getColumn(4).values.includes("ชั้นบน"));
  assert.ok(book.getWorksheet("Lists").getColumn(4).values.includes("ชั้นวาง"));
  assert.equal(sheet.getCell("D2").dataValidation.errorStyle, "stop");
  assert.equal(sheet.getCell("F2").numFmt, "dd/mm/yyyy");
  assert.ok(book.getWorksheet("วิธีกรอก"));
  sheet.getRow(2).values = [...row];
  const parsed = context.parseStockImport(book);
  assert.equal(parsed.errors.length, 0);
  assert.equal(parsed.items.length, 1);
});

test("valid imports meet server validation, default optional fields and preserve separate rows", () => {
  const { context } = app();
  const parsed = context.parseStockImport(workbook([
    ["ข้าว", "0.001", "หน่วยใหม่", "", "", " ", ""],
    ["ข้าว", 2, "หน่วยใหม่", "อาหารแห้ง", "ชั้นใหม่", "31/12/2026", "ตั้งใจใช้ภายใน"],
    ["<script>", 1, "ชิ้น", "ผัก", "", new Date("2028-02-29T00:00:00Z"), "วันหมดอายุ"],
  ]));
  assert.equal(parsed.errors.length, 0);
  assert.equal(parsed.items.length, 3);
  assert.equal(parsed.items[0].category, "อื่น ๆ");
  assert.equal(parsed.items[0].dateKind, "expiry");
  assert.equal(parsed.items[0].date, "");
  assert.equal(parsed.items[1].category, "ของแห้ง");
  assert.equal(parsed.items[1].date, "2026-12-31");
  assert.equal(parsed.items[1].dateKind, "plan");
  assert.notEqual(parsed.items[0].id, parsed.items[1].id);
  assert.equal(parsed.items[2].date, "2028-02-29");
  validatedStock({ items: parsed.items, shopping: [], version: parsed.version });
});

for (const [label, column, invalid] of [
  ["missing name", 0, ""], ["long name", 0, "x".repeat(81)],
  ["zero quantity", 1, 0], ["negative quantity", 1, -1],
  ["large quantity", 1, 1000000], ["too many decimals", 1, 1.0001],
  ["tiny quantity", 1, 0.00001], ["nonfinite quantity", 1, "Infinity"],
  ["missing unit", 2, ""], ["long unit", 2, "x".repeat(21)],
  ["unknown category", 3, "ไม่มีหมวดนี้"], ["long location", 4, "x".repeat(61)],
  ["impossible date", 5, "2026-02-30"], ["unknown date kind", 6, "อื่น"],
  ["formula", 0, { formula: '"ข้าว"', result: "ข้าว" }],
  ["cell error", 1, { error: "#VALUE!" }],
]) {
  test(`rejects ${label} without accepting a partial import`, () => {
    const { context } = app();
    const invalidRow = [...row];
    invalidRow[column] = invalid;
    const parsed = context.parseStockImport(workbook([row, invalidRow]));
    assert.equal(parsed.count, 2);
    assert.equal(parsed.errors.length, 1);
    assert.match(parsed.errors[0], /^แถว 3:/);
  });
}

test("rejects wrong sheets, headers, empty files and oversized sheets", () => {
  const { context } = app();
  assert.throws(() => context.parseStockImport(new ExcelJS.Workbook()), /ไม่พบชีต/);
  const wrong = workbook([row]);
  wrong.getWorksheet("นำเข้าของ").getCell("A1").value = "ชื่อผิด";
  assert.throws(() => context.parseStockImport(wrong), /หัวตาราง/);
  assert.throws(() => context.parseStockImport(workbook([])), /ไม่มีรายการ/);
  const large = workbook([row]);
  large.getWorksheet("นำเข้าของ").getCell("A10002").value = "เกิน";
  assert.throws(() => context.parseStockImport(large), /แถวมากเกินไป/);
});

test("capacity is measured against existing items; blanks do not consume slots", () => {
  const { context } = app(Array.from({ length: 1999 }, () => ({})));
  const accepted = context.parseStockImport(workbook([[], row, [" ", "", ""]]));
  assert.equal(accepted.count, 1);
  assert.equal(accepted.errors.length, 0);
  const rejected = context.parseStockImport(workbook([row, row]));
  assert.match(rejected.errors[0], /2,000/);
});

test("Excel serial dates handle 1900 and 1904 systems and reject impossible dates", () => {
  const { context } = app();
  assert.equal(context.stockImportDate(1), "1900-01-01");
  assert.equal(context.stockImportDate(61), "1900-03-01");
  assert.throws(() => context.stockImportDate(60), /วันที่ไม่ถูกต้อง/);
  assert.equal(context.stockImportDate(0, true), "1904-01-01");
  assert.throws(() => context.stockImportDate(NaN), /วันที่ไม่ถูกต้อง/);
  assert.throws(() => context.stockImportDate(1e20), /วันที่ไม่ถูกต้อง/);
});

test("preview blocks invalid rows and safely escapes user-controlled content", async () => {
  const { context, element } = app();
  const book = workbook([
    ["<img src=x onerror=alert(1)>", 1, "ถุง", "ของแห้ง", "", "", ""],
    ["ผิด", 0, "ถุง", "ของแห้ง", "", "", ""],
  ]);
  const bytes = await book.xlsx.writeBuffer();
  await context.readStockImport({ name: "items.xlsx", size: bytes.length,
    arrayBuffer: async () => bytes });
  assert.equal(element("#excel-import-dialog").open, true);
  assert.equal(element("#excel-import-confirm").disabled, true);
  assert.match(element("#excel-import-summary").innerHTML, /&lt;img/);
  assert.match(element("#excel-import-summary").innerHTML, /แถว 3/);
});

for (const status of [409, 0, 500]) {
  test(`failed save (${status}) disables retry to prevent stale or duplicate imports`, async () => {
    const { context, element } = app();
    context.book = workbook([row]);
    vm.runInContext("pendingStockImport = parseStockImport(book);", context);
    element("#excel-import-dialog").open = true;
    context.request = vm.runInContext(`async () => { throw new ApiError(${status}, "test"); }`, context);
    context.refresh = async () => {};
    await context.mutation(async () => {}, context.initial.version);
    assert.equal(element("#excel-import-confirm").disabled, true);
    assert.match(element("#excel-import-error").textContent, /อัปโหลดใหม่/);
  });
}

test("authentication expiry closes import preview and clears the household", async () => {
  const { context, element } = app();
  context.book = workbook([row]);
  vm.runInContext("pendingStockImport = parseStockImport(book);", context);
  element("#excel-import-dialog").open = true;
  context.request = vm.runInContext('async () => { throw new ApiError(401, ""); }', context);
  await context.mutation(async () => {}, context.initial.version);
  assert.equal(element("#excel-import-dialog").open, false);
  assert.equal(vm.runInContext("stock", context), null);
  assert.equal(element("#login").hidden, false);
});

test("successful import appends items while preserving the rest of the household", async () => {
  const existing = {
    id: randomUUID(), name: "ของเดิม", qty: 2, unit: "ชิ้น", category: "อื่น ๆ",
    location: "ตู้เย็น", date: "", dateKind: "expiry", photo: randomUUID(),
  };
  const { context, element } = app([existing]);
  context.initial.shopping.push({ id: randomUUID(), name: "ซื้อเดิม", qty: 1, unit: "ถุง" });
  const parsed = context.parseStockImport(workbook([row]));
  element("#excel-import-dialog").open = true;
  let written;
  const version = randomUUID();
  context.request = async (path, options) => {
    assert.equal(path, "stock");
    written = JSON.parse(options.body);
    validatedStock(written);
    return { version };
  };
  await context.mutation(async (next) => next.items.push(...parsed.items), parsed.version);
  assert.deepEqual(written.items[0], existing);
  assert.equal(written.items.length, 2);
  assert.deepEqual(written.shopping, context.initial.shopping);
  assert.deepEqual(written.recipes, []);
  assert.deepEqual(written.mealPlans, []);
  assert.equal(vm.runInContext("stock.version", context), version);
});

test("oversized, wrong-type and corrupt uploads report errors without a preview", async () => {
  const { context, element } = app();
  for (const file of [
    { name: "items.csv", size: 10 },
    { name: "items.xlsx", size: 10 * 1024 * 1024 + 1 },
    { name: "items.xlsx", size: 5, arrayBuffer: async () => new Uint8Array([1, 2, 3]) },
  ]) {
    await context.readStockImport(file);
    assert.equal(element("#excel-import-dialog").open, false);
    assert.equal(element("#notice").hidden, false);
    assert.ok(element("#notice").textContent.length > 0);
    assert.equal(vm.runInContext("busy", context), false);
  }
});

test("all add-action icons use a current-color badge with a transparent plus cutout", () => {
  const { context } = app();
  for (const kind of ["stock", "meal", "recipe", "shopping", "ingredient", "cooked"]) {
    const label = context.addActionLabel(kind, '<ชื่อ "ปุ่ม">');
    assert.match(label, /<svg class="add-action-plus"[^>]*fill="currentColor"/);
    assert.match(label, /fill-rule="evenodd"/);
    assert.doesNotMatch(label, /<span class="add-action-plus"/);
    assert.match(label, /&lt;ชื่อ &quot;ปุ่ม&quot;&gt;/);
    assert.match(label, /aria-hidden="true"/);
  }
});

test("shopping actions and navigation share the cart icon instead of the saved-recipe icon", () => {
  const { context } = app();
  const label = context.paperPlusLabel("จดรายการซื้อ");
  const icon = label.split("</svg>")[0];
  const recipe = context.addActionLabel("recipe", "เพิ่มเมนู").split("</svg>")[0];
  const html = readFileSync(new URL("../public/index.html", import.meta.url), "utf8");
  const navigation = html.split('<a href="#shopping"')[1].split("</a>")[0];
  const paths = [...icon.matchAll(/<(?:path|circle)[^>]+>/g)].map(([value]) =>
    value.replace(/\s*\/>$/, "").replace(/\s+/g, " "));
  assert.equal(paths.length, 3);
  for (const path of paths) assert.ok(navigation.includes(path));
  assert.notEqual(icon, recipe);
  assert.doesNotMatch(navigation, /M5 8h14/);
});

const mediaItem = () => ({
  id: randomUUID(), name: 'ข้าว <"ใหม่">', qty: 2.125, unit: "ถุง",
  category: "ของแห้ง", location: "ชั้นวาง", date: "2026-12-31",
  dateKind: "expiry", photo: null,
});

test("generated icon catalog matches server validation and rejects arbitrary markup", () => {
  const { context } = app();
  const ids = vm.runInContext("Object.keys(itemIcons)", context);
  assert.deepEqual(Array.from(ids), itemIconIds);
  assert.equal(context.itemIconSvg("__proto__"), "");
  for (const icon of itemIconIds) {
    const data = { items: [{ ...mediaItem(), icon }], shopping: [], version: null };
    assert.equal(validatedStock(data).items[0].icon, icon);
    assert.match(context.itemIconSvg(icon), /<svg[^>]+aria-hidden="true"/);
  }
  for (const icon of ["<svg onload=alert(1)>", "__proto__", 1, {}, []]) {
    assert.throws(() => validatedStock({
      items: [{ ...mediaItem(), icon }], shopping: [], version: null,
    }), /ไอคอน/);
  }
  assert.throws(() => validatedStock({
    items: [{ ...mediaItem(), icon: "egg", photo: randomUUID() }],
    shopping: [], version: null,
  }), /อย่างใดอย่างหนึ่ง/);
  const old = validatedStock({ items: [mediaItem()], shopping: [], version: null }).items[0];
  assert.equal(Object.hasOwn(old, "icon"), false);
});

test("stock placeholders are keyboard-accessible buttons; other pages remain unchanged", () => {
  const item = mediaItem();
  const { context } = app([item]);
  const placeholder = context.thumb(item, true);
  assert.match(placeholder, /<button type="button"/);
  assert.match(placeholder, /data-action="choose-item-media"/);
  assert.doesNotMatch(placeholder, /item-media-add|>\+</);
  assert.match(placeholder, /&lt;&quot;ใหม่&quot;&gt;/);
  assert.doesNotMatch(context.thumb(item), /<button/);
  assert.doesNotMatch(context.thumb({ ...item, icon: "egg" }, true), /item-media-add/);
  assert.match(context.thumb({ ...item, icon: "egg" }), /item-icon/);
  assert.match(context.row(item), /choose-item-media/);
  context.location.hash = "#today";
  assert.doesNotMatch(context.row(item), /choose-item-media/);
  context.location.hash = "#shopping";
  assert.doesNotMatch(context.row(item, true), /choose-item-media/);
});

test("media chooser deduplicates current photos and does not upload generated icons", async () => {
  const photo = randomUUID();
  const first = { ...mediaItem(), photo };
  const target = mediaItem();
  const { context, element } = app([first, { ...mediaItem(), photo }, target]);
  context.startItemMedia(target);
  assert.equal(element("#item-media-dialog").open, true);
  assert.equal((element("#item-media-photos").innerHTML.match(/select-item-photo/g) || []).length, 1);
  assert.match(element("#item-media-icons").innerHTML, /select-item-icon/);
  let calls = 0, written;
  context.request = async (path, options) => {
    calls++;
    assert.equal(path, "stock");
    written = JSON.parse(options.body);
    validatedStock(written);
    return { version: randomUUID() };
  };
  context.selectItemMedia(null, "egg");
  await context.saveItemMedia();
  assert.equal(calls, 1);
  assert.deepEqual(written.items[2], { ...target, icon: "egg" });
  assert.deepEqual(written.items[0], first);
  assert.equal(element("#item-media-dialog").open, false);
});

test("reusing a photo and clearing an icon save only the selected item's media", async () => {
  const photo = randomUUID();
  const original = { ...mediaItem(), photo };
  const target = { ...mediaItem(), icon: "grain" };
  const { context } = app([original, target]);
  let written;
  context.request = async (path, options) => {
    assert.equal(path, "stock");
    written = JSON.parse(options.body);
    validatedStock(written);
    return { version: randomUUID() };
  };
  context.startItemMedia(target);
  context.selectItemMedia(photo, null);
  await context.saveItemMedia();
  assert.deepEqual(written.items[1], { ...target, photo, icon: null });
  assert.deepEqual(written.items[0], original);
  context.startItemMedia(written.items[1]);
  context.selectItemMedia(null, null);
  await context.saveItemMedia();
  assert.deepEqual(written.items[1], { ...target, photo: null, icon: null });
});

test("new media uploads use the existing JPEG endpoint before saving the stock", async () => {
  const target = mediaItem();
  const { context } = app([target]);
  context.startItemMedia(target);
  const blob = new Blob(["test"], { type: "image/jpeg" });
  context.blob = blob;
  vm.runInContext("mediaDraft.blob = blob;", context);
  const photo = randomUUID(), paths = [];
  context.request = async (path, options) => {
    paths.push(path);
    if (path === "photo") {
      assert.equal(options.headers["Content-Type"], "image/jpeg");
      assert.equal(options.body, blob);
      return { id: photo };
    }
    const written = JSON.parse(options.body);
    assert.deepEqual(written.items[0], { ...target, photo, icon: null });
    return { version: randomUUID() };
  };
  await context.saveItemMedia();
  assert.deepEqual(paths, ["photo", "stock"]);
});

for (const status of [409, 0, 500, 401]) {
  test(`media save reports status ${status} and does not overwrite local stock`, async () => {
    const target = mediaItem();
    const { context, element } = app([target]);
    context.startItemMedia(target);
    context.selectItemMedia(null, "fruit");
    context.request = vm.runInContext(`async () => { throw new ApiError(${status}, "test"); }`, context);
    context.refresh = async () => {};
    await context.saveItemMedia();
    if (status === 401) {
      assert.equal(element("#item-media-dialog").open, false);
      assert.equal(element("#login").hidden, false);
    } else {
      assert.equal(element("#item-media-save").disabled, true);
      assert.match(element("#item-media-error").textContent, /ตัวเลือกรูปใหม่/);
      assert.equal(vm.runInContext("stock.items[0].icon", context), undefined);
    }
  });
}

test("editing ordinary item fields preserves an existing icon", () => {
  const target = { ...mediaItem(), icon: "grain" };
  const { context, element } = app([target]);
  context.target = target;
  vm.runInContext('draft = { mode: "edit-item", sourceId: target.id, photo: null, icon: target.icon };', context);
  for (const [id, value] of [
    ["f-name", target.name], ["f-unit", target.unit], ["f-qty", String(target.qty)],
    ["f-category", target.category], ["f-location", target.location],
    ["f-date", target.date], ["f-kind", target.dateKind],
  ]) element("#" + id).value = value;
  assert.deepEqual(JSON.parse(JSON.stringify(context.formItem())), target);
});
