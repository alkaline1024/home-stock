"use strict";

const $ = (selector) => document.querySelector(selector);
const categories = [
  "เนื้อสัตว์",
  "ผัก",
  "ของสด",
  "ของแช่แข็ง",
  "ของแห้ง",
  "เครื่องปรุง",
  "อาหารปรุงสุก",
  "ขนม",
  "อื่น ๆ",
];
const categoryAliases = { อาหารสด: "ของสด", อาหารแห้ง: "ของแห้ง" };
const rooms = ["ตู้เย็น", "ช่องแช่แข็ง", "ชั้นวาง"];
const titles = {
  today: "หน้าหลัก",
  stock: "ของในบ้าน",
  shopping: "รายการซื้อ",
  meals: "แผนทำอาหาร",
  recipes: "เมนูที่บันทึกไว้",
  settings: "การตั้งค่า",
};
const animationModes = ["full", "minimal", "off"];
const animationStorageKey = "home-stock-animation";
const dateFormat = new Intl.DateTimeFormat("th-TH", {
  day: "numeric",
  month: "short",
  year: "numeric",
});
const amountFormat = new Intl.NumberFormat("th-TH", {
  maximumFractionDigits: 3,
});
const round = (number) => Math.round(number * 1000) / 1000;
const esc = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c],
  );
const key = (value) => value.trim().normalize("NFC").toLocaleLowerCase();
function suggestedStorage(location) {
  const value = key(location);
  if (/แช่แข็ง|ช่องฟรีซ|ตู้ฟรีซ|freezer|freezing/.test(value)) return "freezer";
  if (/ตู้เย็น|แช่เย็น|ช่องผัก|fridge|refrigerator/.test(value)) return "fridge";
  if (/ชั้นวาง|อุณหภูมิห้อง|ตู้กับข้าว|pantry|room temperature/.test(value)) return "pantry";
  return "";
}
function suggestedShelfLife(name, receivedDate, category, location) {
  if (!name.trim() || !/^\d{4}-\d{2}-\d{2}$/.test(receivedDate) || !category || !location.trim())
    return null;
  const storage = suggestedStorage(location);
  if (!storage) return null;
  const normalized = key(name);
  const matches = (globalThis.shelfLifeRules || []).flatMap((rule) =>
    rule.categories.includes(category) && Number.isInteger(rule.days[storage])
      ? rule.keywords
          .filter((word) => normalized.includes(key(word)))
          .map((word) => ({ rule, length: key(word).length }))
      : [],
  );
  matches.sort((a, b) => b.length - a.length);
  if (!matches.length) return null;
  const start = new Date(receivedDate + "T00:00:00Z");
  if (Number.isNaN(start.getTime()) || start.toISOString().slice(0, 10) !== receivedDate)
    return null;
  const { rule } = matches[0];
  const date = new Date(start.getTime() + rule.days[storage] * 86400000).toISOString().slice(0, 10);
  return { date, days: rule.days[storage], name: rule.name };
}
function refreshShelfLifeSuggestion() {
  const button = $("#apply-shelf-life-suggestion");
  if (!button) return;
  const suggestion = suggestedShelfLife(
    $("#f-name").value,
    $("#f-received-date").value,
    $("#f-category").value,
    $("#f-location").value,
  );
  button.hidden = !suggestion;
  if (suggestion) {
    button.textContent = `แนะนำ BBE ${dateInputLabel(suggestion.date)} · ${suggestion.name} (${suggestion.days} วัน)`;
    button.dataset.date = suggestion.date;
  } else delete button.dataset.date;
}
function selectFreezerForFrozenName() {
  const name = $("#f-name");
  const location = $("#f-location");
  if (!draft || !name || !location) return;
  if (!key(name.value).includes("แช่แข็ง")) {
    draft.frozenNameSeen = false;
    return;
  }
  if (draft.frozenNameSeen || draft.freezerLocationManual) return;
  location.value = "ช่องแช่แข็ง";
  draft.frozenNameSeen = true;
  refreshShelfLifeSuggestion();
}
const amount = (item) => amountFormat.format(item.qty) + " " + item.unit;
const loadingButtons = new WeakMap();
let pendingActionButton = null;
function startButtonLoading(button) {
  if (!button || typeof button.getBoundingClientRect !== "function" || loadingButtons.has(button))
    return;
  const bounds = button.getBoundingClientRect();
  loadingButtons.set(button, {
    html: button.innerHTML,
    label: button.getAttribute("aria-label"),
    width: button.style.width,
    height: button.style.height,
  });
  button.style.width = bounds.width + "px";
  button.style.height = bounds.height + "px";
  button.setAttribute("aria-label", "กำลังดำเนินการ");
  button.setAttribute("aria-busy", "true");
  button.innerHTML = '<span class="button-spinner" aria-hidden="true"></span>';
  button.classList.add("is-loading");
}
function stopButtonLoading(button) {
  const saved = button && loadingButtons.get(button);
  if (!saved) return;
  button.innerHTML = saved.html;
  button.style.width = saved.width;
  button.style.height = saved.height;
  if (saved.label === null) button.removeAttribute("aria-label");
  else button.setAttribute("aria-label", saved.label);
  button.removeAttribute("aria-busy");
  button.classList.remove("is-loading");
  loadingButtons.delete(button);
}
let stock = null;
// Home-screen shortcuts open /?shortcut=<name>; run it once stock has loaded.
let pendingShortcut = /[?&]shortcut=([\w-]+)/.exec(location.search || "")?.[1] || "";
if (pendingShortcut) history.replaceState(null, "", location.pathname + location.hash);
let busy = false;
let generation = 0;
let draft = null;
let mealDraft = null;
let mealIngredientSequence = 0;
let excelJsPromise = null;
let pendingStockImport = null;
let pendingReceipt = null;
let mediaDraft = null;
let pendingShortageAction = null;
const itemIcons = {
  box: { label: "กล่อง" },
  vegetables: { label: "ผัก" },
  fruit: { label: "ผลไม้" },
  meat: { label: "เนื้อสัตว์" },
  fish: { label: "ปลา" },
  egg: { label: "ไข่" },
  milk: { label: "นม" },
  bottle: { label: "ขวด" },
  grain: { label: "ข้าวและธัญพืช" },
  meal: { label: "อาหารปรุงสุก" },
  snowflake: { label: "ของแช่แข็ง" },
};
const itemIconColors = {
  green: { label: "เขียว", value: "#386641" },
  blue: { label: "น้ำเงิน", value: "#25658a" },
  teal: { label: "เขียวอมฟ้า", value: "#167d79" },
  coral: { label: "ปะการัง", value: "#c4513d" },
  orange: { label: "ส้ม", value: "#bd6d1e" },
  berry: { label: "แดงเบอร์รี", value: "#a73e5a" },
  purple: { label: "ม่วง", value: "#7451a6" },
  slate: { label: "เทาเข้ม", value: "#48525b" },
};
const itemIconBackgrounds = {
  mint: { label: "มิ้นต์", value: "#e2efe1" },
  cream: { label: "ครีม", value: "#f2eadb" },
  sky: { label: "ฟ้า", value: "#e0eef4" },
  rose: { label: "ชมพู", value: "#f7e6e7" },
  lilac: { label: "ลาเวนเดอร์", value: "#ede8f7" },
  peach: { label: "พีช", value: "#f8e6d9" },
  butter: { label: "เหลืองอ่อน", value: "#f4edcf" },
  white: { label: "ขาว", value: "#ffffff" },
};
const customHexColor = /^#[0-9a-f]{6}$/i;
function iconColorValue(value, palette, fallback) {
  if (typeof value === "string" && customHexColor.test(value)) return value.toLowerCase();
  return Object.hasOwn(palette, value) ? palette[value].value : palette[fallback].value;
}

function itemIconStyle(item) {
  const foreground = iconColorValue(item?.iconColor, itemIconColors, "green");
  const background = iconColorValue(item?.iconBackground, itemIconBackgrounds, "mint");
  return ' style="--item-icon-color:' + foreground + ";--item-icon-bg:" + background + '"';
}

function itemIconSvg(id, className = "item-icon", color = "green", background = "mint") {
  if (!Object.hasOwn(itemIcons, id)) return "";
  const foreground = iconColorValue(color, itemIconColors, "green");
  const back = iconColorValue(background, itemIconBackgrounds, "mint");
  return (
    '<svg class="' +
    className +
    '" style="color:' +
    foreground +
    ";--item-icon-bg:" +
    back +
    '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><use href="/item-icons.svg#item-icon-' +
    id +
    '"></use></svg>'
  );
}
const stockImportHeaders = [
  "ชื่อของ",
  "จำนวน",
  "หน่วย",
  "หมวด",
  "ที่เก็บ",
  "วันที่ (ถ้ามี)",
  "ติดตามวันที่",
  "แจ้งเตือนก่อนกำหนดภายใน (วัน)",
];
const legacyStockImportHeaders = stockImportHeaders.slice(0, 7);
let previewUrl = "";
let noticeAction = null;
let noticeTimer = 0;
let lastDrawDay = "";
let lastActive = Date.now();
let lastReadStarted = 0;
let calendarYear = new Date().getFullYear();
let calendarMonth = new Date().getMonth();
let selectedCalendarDate = "";
const idleAfter = 5 * 60 * 1000;
let pantryLoadingStartedAt = 0;
let animationMode = (() => {
  try {
    const saved = localStorage.getItem(animationStorageKey);
    return animationModes.includes(saved) ? saved : "full";
  } catch (error) {
    console.error("อ่านการตั้งค่าแอนิเมชันไม่ได้", error);
    return "full";
  }
})();

function showPantryLoading() {
  const loader = $("#pantry-loading");
  if (animationMode === "off" || !loader.hidden) return;
  pantryLoadingStartedAt = Date.now();
  loader.classList.remove("is-opening");
  loader.classList.remove("is-fading");
  loader.hidden = false;
  document.body.classList.add("pantry-loading-active");
  $("#entry").inert = true;
  $("#app").inert = true;
}

function hidePantryLoading() {
  const loader = $("#pantry-loading");
  loader.hidden = true;
  loader.classList.remove("is-opening");
  loader.classList.remove("is-fading");
  loader.style.removeProperty("--pantry-open-duration");
  loader.style.removeProperty("--pantry-fade-duration");
  $("#app").style.removeProperty("--pantry-open-duration");
  $("#app").classList.remove("pantry-content-approach");
  pantryLoadingStartedAt = 0;
  document.body.classList.remove("pantry-loading-active");
  $("#entry").inert = false;
  $("#app").inert = false;
}

async function revealPantry(current) {
  const loader = $("#pantry-loading");
  if (animationMode === "off" || loader.hidden) return;
  const minimumWait = 250;
  const wait = Math.max(0, minimumWait - (Date.now() - pantryLoadingStartedAt));
  await new Promise((resolve) => setTimeout(resolve, wait));
  if (current !== generation || loader.hidden) return;
  const openingDuration = 1400;
  const fadeDuration = 350;
  loader.style.setProperty("--pantry-fade-duration", fadeDuration + "ms");
  const animationFinished = new Promise((resolve) => {
    const finish = (event) => {
      if (event.target !== loader || event.animationName !== "pantry-scene-fade") return;
      loader.removeEventListener("animationend", finish);
      clearTimeout(fallback);
      resolve();
    };
    const fallback = setTimeout(
      () => {
        loader.removeEventListener("animationend", finish);
        resolve();
      },
      openingDuration + fadeDuration + 300,
    );
    loader.addEventListener("animationend", finish);
  });
  if (animationMode === "minimal") {
    loader.classList.add("is-fading");
    await animationFinished;
    if (current === generation) hidePantryLoading();
    return;
  }
  loader.style.setProperty("--pantry-open-duration", openingDuration + "ms");
  $("#app").style.setProperty("--pantry-open-duration", openingDuration + "ms");
  $("#app").classList.add("pantry-content-approach");
  loader.classList.add("is-opening");
  await new Promise((resolve) => setTimeout(resolve, Math.max(0, openingDuration - 100)));
  if (current !== generation || loader.hidden) return;
  loader.classList.add("is-fading");
  await animationFinished;
  if (current === generation) hidePantryLoading();
}

function tab() {
  const path = location.hash.slice(1);
  return Object.hasOwn(titles, path) ? path : "today";
}

function localDay(value) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day, 12);
}

function dateInputLabel(value) {
  return value ? dateFormat.format(localDay(value)) : "";
}

function calendarDateKey(year, month, day) {
  return (
    String(year).padStart(4, "0") +
    "-" +
    String(month + 1).padStart(2, "0") +
    "-" +
    String(day).padStart(2, "0")
  );
}

function daysLeft(value) {
  if (!value) return Infinity;
  const now = new Date();
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  const [year, month, day] = value.split("-").map(Number);
  return (Date.UTC(year, month - 1, day) - today) / 86400000;
}

function dateLabel(item) {
  if (!item.date) return "";
  const days = daysLeft(item.date);
  const prefix =
    item.dateKind === "plan"
      ? "ตั้งใจใช้"
      : item.dateKind === "best-before"
        ? "BBE : ควรบริโภคก่อน"
        : "EXP : วันหมดอายุ";
  const relative = days === 0 ? "วันนี้" : days === 1 ? "พรุ่งนี้" : "";
  return prefix + relative + " · " + dateFormat.format(localDay(item.date));
}
function shortDateLabel(item) {
  if (!item.date) return "";
  const [year, month, day] = item.date.split("-");
  const prefix =
    item.dateKind === "plan" ? "ใช้ภายใน" : item.dateKind === "best-before" ? "BBE" : "EXP";
  return prefix + " " + day + "/" + month + "/" + year.slice(-2);
}

function humanDuration(days) {
  if (days < 14) return days + " วัน";
  if (days < 60) return Math.round(days / 7) + " สัปดาห์";
  if (days < 365) return Math.round(days / 30) + " เดือน";
  return Math.round(days / 365) + " ปี";
}

function gridDateBadge(item) {
  if (!item.date) return "";
  const days = daysLeft(item.date);
  const alertDays = Number.isInteger(item.notifyBeforeDays) ? item.notifyBeforeDays : 3;
  const tone = days < 0 ? "past" : days <= alertDays ? "danger" : days <= 7 ? "warning" : "normal";
  const remaining =
    days < 0
      ? "เลยกำหนด " + humanDuration(-days)
      : days === 0
        ? "ครบกำหนดวันนี้"
        : "เหลือ " + humanDuration(days);
  const exactDate = shortDateLabel(item);
  return (
    '<span class="item-card-time item-card-time--' +
    tone +
    '" title="' +
    esc(exactDate) +
    '" aria-label="' +
    esc(exactDate + " · " + remaining) +
    '"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg><span class="item-card-time-label">' +
    esc(remaining) +
    "</span></span>"
  );
}

function byDate(a, b) {
  return (a.date || "9999").localeCompare(b.date || "9999") || a.name.localeCompare(b.name, "th");
}

function sortStockItems(items, mode) {
  const byName = (a, b) => a.name.localeCompare(b.name, "th");
  return [...items].sort((a, b) => {
    if (mode === "name-asc") return byName(a, b) || byDate(a, b);
    if (mode === "name-desc") return byName(b, a) || byDate(a, b);
    if (mode === "qty-asc") return a.qty - b.qty || byName(a, b);
    if (mode === "qty-desc") return b.qty - a.qty || byName(a, b);
    if (mode === "date-desc") {
      if (!a.date) return b.date ? 1 : byName(a, b);
      if (!b.date) return -1;
      return b.date.localeCompare(a.date) || byName(a, b);
    }
    return byDate(a, b);
  });
}

class ApiError extends Error {
  constructor(status, detail) {
    super(detail);
    this.status = status;
  }
}

async function request(path, options = {}) {
  let response;
  try {
    response = await fetch("/api/" + path, { cache: "no-store", ...options });
  } catch {
    throw new ApiError(0, "เชื่อมต่อไม่ได้ กรุณาตรวจอินเทอร์เน็ตแล้วลองอีกครั้ง");
  }
  let body;
  try {
    body = await response.json();
  } catch {
    body = {};
  }
  if (!response.ok) throw new ApiError(response.status, body.error || "");
  return body;
}

function post(path, data) {
  return request(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

function errorText(error) {
  if (error.status === 0) return error.message;
  if (error.status === 401) return "เซสชันหมดอายุ กรุณาเข้าสู่ระบบอีกครั้ง";
  if (error.status === 503) return "บริการเก็บข้อมูลยังไม่พร้อมใช้งาน กรุณาตรวจการตั้งค่า Vercel แล้วลองอีกครั้ง";
  if (error.status === 413) return "ไฟล์รูปหรือรายการมีขนาดใหญ่เกินไป";
  if (error.status === 429) return "มีคำขอมากเกินไป กรุณารอสักครู่แล้วลองอีกครั้ง";
  if (error.status === 400 || error.status === 422)
    return error.message || "ข้อมูลไม่ถูกต้อง กรุณาตรวจสอบรายการอีกครั้ง";
  return "ติดต่อบริการไม่สำเร็จ กรุณาลองอีกครั้ง";
}

function entry(mode, message = "") {
  generation++;
  hidePantryLoading();
  stock = null;
  if ($("#editor").open) $("#editor").close();
  if ($("#meal-editor").open) $("#meal-editor").close();
  if ($("#excel-import-dialog").open) $("#excel-import-dialog").close();
  if ($("#receipt-dialog").open) $("#receipt-dialog").close();
  if ($("#item-media-dialog").open) $("#item-media-dialog").close();
  if ($("#shortage-summary-dialog").open) $("#shortage-summary-dialog").close();
  $(".excel-dropdown").open = false;
  $("#app").hidden = true;
  $("#entry").hidden = false;
  $("#login").hidden = mode !== "login";
  $("#checking").hidden = mode !== "checking";
  $("#unavailable").hidden = mode !== "unavailable";
  $("#unavailable-text").textContent = message;
  $("#login-error").textContent = mode === "login" ? message : "";
  $("#password").value = "";
  $("#notice").hidden = true;
  $("#sync-error").hidden = true;
}

async function refresh(force = false) {
  if (
    !force &&
    (busy ||
      $("#editor").open ||
      $("#meal-editor").open ||
      $("#excel-import-dialog").open ||
      $("#receipt-dialog").open ||
      $("#item-media-dialog").open ||
      $("#shortage-summary-dialog").open)
  )
    return;
  if (!force && Date.now() - lastReadStarted < 3000) return;
  lastReadStarted = Date.now();
  if (!stock) showPantryLoading();
  const current = ++generation;
  try {
    const newer = await request("stock");
    if (current !== generation) return;
    if (!Array.isArray(newer.items) || !Array.isArray(newer.shopping)) throw new Error();
    newer.items = newer.items.map((item) => ({
      ...item,
      category: categoryAliases[item.category] || item.category,
    }));
    const changed =
      !stock || stock.version !== newer.version || lastDrawDay !== new Date().toDateString();
    stock = newer;
    $("#entry").hidden = true;
    $("#app").hidden = false;
    $("#sync-error").hidden = true;
    if (changed) draw();
    await revealPantry(current);
    if (pendingShortcut === "add" && current === generation) {
      pendingShortcut = "";
      startEditor("add");
    }
  } catch (error) {
    if (current !== generation) return;
    if (error.status === 401) return entry("login");
    const message = errorText(error);
    if (!stock) return entry("unavailable", message);
    $("#sync-error").textContent = message + " · กำลังแสดงข้อมูลล่าสุดที่เปิดไว้";
    $("#sync-error").hidden = false;
  }
}

$("#login").addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = $("#login button");
  startButtonLoading(button);
  button.disabled = true;
  $("#login-error").textContent = "";
  try {
    await post("session", { password: $("#password").value });
    $("#password").value = "";
    await refresh(true);
  } catch (error) {
    $("#login-error").textContent = error.status === 401 ? "รหัสผ่านไม่ถูกต้อง" : errorText(error);
  } finally {
    stopButtonLoading(button);
    button.disabled = false;
  }
});

function alertUser(text, action, label, secondaryAction, secondaryLabel) {
  clearTimeout(noticeTimer);
  const notice = $("#notice");
  notice.textContent = text;
  const options = [
    [action, label],
    [secondaryAction, secondaryLabel],
  ].filter(([fn]) => fn);
  for (const [index, [, caption]] of options.entries()) {
    const button = document.createElement("button");
    button.type = "button";
    const addKinds = {
      จดซื้อ: "shopping",
      เพิ่มของที่ขาด: "shopping",
      เพิ่มของในบ้าน: "stock",
    };
    button.innerHTML = addKinds[caption]
      ? addActionLabel(addKinds[caption], caption)
      : esc(caption);
    button.dataset.action = "notice-action";
    button.dataset.index = String(index);
    notice.append(button);
  }
  noticeAction = options.map(([fn]) => fn);
  notice.hidden = false;
  noticeTimer = setTimeout(() => {
    notice.hidden = true;
    noticeAction = null;
  }, 11000);
}

function button(action, label, id = "", className = "action") {
  const role = className
    .split(" ")
    .some((name) => ["item-menu-option", "shortage-menu-option"].includes(name))
    ? ' role="menuitem"'
    : "";
  return (
    '<button type="button" class="' +
    className +
    '" data-action="' +
    action +
    '" data-id="' +
    esc(id) +
    '"' +
    role +
    ">" +
    label +
    "</button>"
  );
}
function paperPlusLabel(label) {
  return addActionLabel("shopping", label);
}
const addActionIcons = {
  stock: '<path d="m3 7 9-4 9 4-9 4-9-4Z"/><path d="M3 7v10l9 4 9-4V7"/><path d="M12 11v10"/>',
  meal: '<path d="M3 11h18"/><path d="M5 11v6a3 3 0 0 0 3 3h8a3 3 0 0 0 3-3v-6"/><path d="M12 3v4"/><path d="M7 4l2 3"/><path d="m17 4-2 3"/>',
  recipe: '<path d="M6 3h12v18l-6-4-6 4V3Z"/><path d="M9 8h6m-6 4h6"/>',
  shopping:
    '<path d="M2 3h2l3 12h12l3-9H5"/><circle cx="9" cy="20" r="1"/><circle cx="18" cy="20" r="1"/>',
  ingredient:
    '<path d="M4 20c4-1 6-4 8-8"/><path d="m10 7 7-4 4 4-4 7"/><path d="m13 9 2 2m-5 1 2 2m-5 1 2 2"/>',
  cooked:
    '<path d="M3 12h18"/><path d="M5 12a7 7 0 0 0 14 0"/><path d="M12 3v3m-5-2 1 2m9-2-1 2"/>',
};
function addActionLabel(kind, label) {
  return (
    '<span class="add-action-label"><span class="add-action-icon-wrap"><svg class="add-action-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    (addActionIcons[kind] || addActionIcons.stock) +
    '</svg><svg class="add-action-plus" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path fill-rule="evenodd" d="M8 0a8 8 0 1 1 0 16A8 8 0 0 1 8 0ZM7 4h2v3h3v2H9v3H7V9H4V7h3Z"/></svg></span><span class="add-action-text">' +
    esc(label) +
    "</span></span>"
  );
}

async function loadExcelJS() {
  if (window.ExcelJS) return window.ExcelJS;
  if (!excelJsPromise) {
    excelJsPromise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "/exceljs.min.js";
      script.onload = () =>
        window.ExcelJS ? resolve(window.ExcelJS) : reject(new Error("โหลด ExcelJS ไม่สำเร็จ"));
      script.onerror = () => {
        script.remove();
        reject(new Error("โหลด ExcelJS ไม่สำเร็จ กรุณาลองอีกครั้ง"));
      };
      document.head.append(script);
    }).catch((error) => {
      excelJsPromise = null;
      throw error;
    });
  }
  return excelJsPromise;
}

async function downloadStockTemplate() {
  const ExcelJS = await loadExcelJS();
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "home-stock";
  const sheet = workbook.addWorksheet("นำเข้าของ");
  const options = workbook.addWorksheet("Lists");
  options.state = "hidden";

  const lists = [
    ["ItemNames", [...new Set((stock.items || []).map((item) => item.name).filter(Boolean))]],
    [
      "UnitOptions",
      [
        ...new Set([
          "ชิ้น",
          "กล่อง",
          "ถุง",
          "ฟอง",
          "ขวด",
          "แพ็ก",
          "กก.",
          "ลิตร",
          "ที่",
          ...stock.items.map((item) => item.unit),
        ]),
      ],
    ],
    ["CategoryOptions", categories],
    [
      "LocationOptions",
      [...new Set([...rooms, ...(stock.items || []).map((item) => item.location)])]
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b, "th")),
    ],
    ["DateKindOptions", ["(EXP : วันหมดอายุ)", "(BBE : ควรบริโภคก่อน)", "ตั้งใจใช้ภายใน"]],
  ];
  const listColumns = ["A", "B", "C", "D", "E"];
  for (const [index, [name, values]] of lists.entries()) {
    const column = listColumns[index];
    const choices = values.length ? values : [""];
    choices.forEach((value, row) => {
      options.getCell(row + 1, index + 1).value = value;
    });
    workbook.definedNames.add(`Lists!$${column}$1:$${column}$${choices.length}`, name);
  }

  sheet.columns = [
    { width: 28 },
    { width: 13 },
    { width: 16 },
    { width: 20 },
    { width: 22 },
    { width: 18 },
    { width: 22 },
    { width: 28 },
  ];
  sheet.getRow(1).values = stockImportHeaders;
  sheet.views = [{ state: "frozen", ySplit: 1 }];
  sheet.autoFilter = { from: "A1", to: "H1" };
  sheet.getRow(1).height = 24;
  sheet.getRow(1).eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF235242" },
    };
    cell.alignment = { vertical: "middle" };
  });

  const validations = [
    [1, "ItemNames", true, false],
    [3, "UnitOptions", true, false],
    [4, "CategoryOptions", true, true],
    [5, "LocationOptions", true, false],
    [7, "DateKindOptions", true, true],
  ];
  for (let row = 2; row <= 2001; row++) {
    for (const [column, name, allowBlank, showErrorMessage] of validations) {
      sheet.getCell(row, column).dataValidation = {
        type: "list",
        allowBlank,
        formulae: [name],
        showErrorMessage,
        errorStyle: showErrorMessage ? "stop" : "warning",
        errorTitle: "ค่าที่ไม่อยู่ในรายการ",
        error: showErrorMessage ? "กรุณาเลือกค่าจาก dropdown" : "เลือกจาก dropdown หรือกรอกค่าใหม่",
      };
    }
    sheet.getCell(row, 2).dataValidation = {
      type: "decimal",
      operator: "between",
      allowBlank: true,
      formulae: [0.001, 999999],
      showErrorMessage: true,
      errorStyle: "stop",
      errorTitle: "จำนวนไม่ถูกต้อง",
      error: "กรอกจำนวนมากกว่า 0 และไม่เกิน 999,999",
    };
    sheet.getCell(row, 6).numFmt = "dd/mm/yyyy";
    sheet.getCell(row, 8).dataValidation = {
      type: "whole",
      operator: "between",
      allowBlank: true,
      formulae: [0, 365],
      showErrorMessage: true,
      errorStyle: "stop",
      errorTitle: "จำนวนวันไม่ถูกต้อง",
      error: "ใส่จำนวนเต็ม 0 ถึง 365 วัน หรือเว้นว่าง",
    };
  }

  const help = workbook.addWorksheet("วิธีกรอก");
  [
    "กรอกข้อมูลในชีต นำเข้าของ โดยไม่เปลี่ยนหัวตาราง",
    "รองรับสูงสุด 2,000 รายการ รวมของที่มีอยู่แล้วในบ้าน",
    "ชื่อของ จำนวน และหน่วย เป็นข้อมูลที่ต้องกรอก",
    "จำนวนมากกว่า 0 ถึง 999999 ทศนิยมไม่เกิน 3 ตำแหน่ง",
    "หน่วยและที่เก็บเลือกจาก dropdown หรือพิมพ์ค่าใหม่ได้",
    "หมวดและติดตามวันที่เลือกจาก dropdown; เว้นว่างใช้ อื่น ๆ และ (EXP : วันหมดอายุ)",
    "แจ้งเตือนก่อนกำหนดใส่จำนวนเต็ม 0 ถึง 365 วัน; เว้นว่างใช้ค่าเริ่มต้นใน Settings",
    "วันที่เว้นว่างได้ หรือกรอกวัน/เดือน/ปี ค.ศ. เช่น 31/12/2026 หรือ 2026-12-31",
    "ไม่รองรับสูตรในเซลล์ กรุณาวางเป็นค่าแทน",
    "นำเข้าเป็นรายการใหม่ ไม่มีรูป และไม่แก้ไขหรือลบรายการเดิม",
    "ตรวจสอบพรีวิวแล้วกดนำเข้า; อัปโหลดไฟล์เดิมซ้ำจะเพิ่มรายการซ้ำ",
  ].forEach((text) => help.addRow([text]));
  help.getColumn(1).width = 110;

  const buffer = await workbook.xlsx.writeBuffer();
  const url = URL.createObjectURL(
    new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = "home-stock-import-template.xlsx";
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function stockImportValue(cell) {
  const value = cell.value;
  if (value === null || value === undefined) return "";
  if (typeof value === "string" || typeof value === "number" || value instanceof Date) return value;
  if (value.richText) return value.richText.map((part) => part.text).join("");
  throw new Error("ไม่รองรับสูตร ลิงก์ หรือค่าผิดพลาดในเซลล์ กรุณาวางเป็นค่า");
}

function stockImportDate(value, date1904 = false) {
  if (value === "" || (typeof value === "string" && !value.trim())) return "";
  let date;
  if (value instanceof Date) {
    if (!Number.isFinite(value.getTime())) throw new Error("วันที่ไม่ถูกต้อง");
    date = value.toISOString().slice(0, 10);
  } else if (typeof value === "number") {
    if (
      !Number.isFinite(value) ||
      value < (date1904 ? 0 : 1) ||
      (!date1904 && Math.floor(value) === 60)
    )
      throw new Error("วันที่ไม่ถูกต้อง");
    const epoch = Date.UTC(date1904 ? 1904 : 1899, date1904 ? 0 : 11, date1904 ? 1 : 31);
    const serial = Math.floor(value);
    const parsed = new Date(epoch + (serial - (!date1904 && serial > 60 ? 1 : 0)) * 86400000);
    if (!Number.isFinite(parsed.getTime())) throw new Error("วันที่ไม่ถูกต้อง");
    date = parsed.toISOString().slice(0, 10);
  } else {
    const text = String(value).trim();
    const parts = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(text);
    date = parts
      ? parts[3] + "-" + parts[2].padStart(2, "0") + "-" + parts[1].padStart(2, "0")
      : text;
  }
  const parsed = new Date(date + "T00:00:00Z");
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
    !Number.isFinite(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== date
  )
    throw new Error("วันที่ไม่ถูกต้อง ใช้วัน/เดือน/ปี ค.ศ. หรือ YYYY-MM-DD");
  return date;
}

function parseStockImport(workbook) {
  const sheet = workbook.getWorksheet("นำเข้าของ");
  if (!sheet) throw new Error("ไม่พบชีต นำเข้าของ กรุณาใช้ไฟล์เทมเพลต");
  const actualHeaders = stockImportHeaders.map((_, index) =>
    stockImportValue(sheet.getCell(1, index + 1)),
  );
  const legacyTemplate =
    legacyStockImportHeaders.every((header, index) => actualHeaders[index] === header) &&
    !actualHeaders[7];
  if (
    !legacyTemplate &&
    stockImportHeaders.some((header, index) => actualHeaders[index] !== header)
  )
    throw new Error("หัวตารางไม่ตรงกับเทมเพลต กรุณาดาวน์โหลดเทมเพลตใหม่");
  if (sheet.rowCount > 10001) throw new Error("ชีตมีแถวมากเกินไป กรุณาใช้เทมเพลตไม่เกิน 2,000 รายการ");
  const items = [],
    errors = [];
  let count = 0;
  for (let row = 2; row <= sheet.rowCount; row++) {
    const cells = (legacyTemplate ? legacyStockImportHeaders : stockImportHeaders).map((_, index) =>
      sheet.getCell(row, index + 1),
    );
    if (
      cells.every(
        (cell) =>
          cell.value === null ||
          cell.value === undefined ||
          (typeof cell.value === "string" && !cell.value.trim()),
      )
    )
      continue;
    count++;
    try {
      const values = cells.map(stockImportValue);
      const text = (index, max, required, label) => {
        if (values[index] instanceof Date) throw new Error(label + "ต้องเป็นข้อความ");
        const value = String(values[index]).trim();
        if ((required && !value) || value.length > max)
          throw new Error(
            label + "ต้อง" + (required ? "ไม่ว่างและ" : "") + "ยาวไม่เกิน " + max + " ตัวอักษร",
          );
        return value;
      };
      const name = text(0, 80, true, "ชื่อของ");
      const quantity = String(values[1]).trim();
      const qty = Number(quantity);
      if (
        !/^(?:\d+(?:\.\d+)?|\.\d+)$/.test(quantity) ||
        !(qty > 0 && qty <= 999999) ||
        Math.abs(qty * 1000 - Math.round(qty * 1000)) > 0.0000001 ||
        Math.round(qty * 1000) === 0
      )
        throw new Error("จำนวนต้องมากกว่า 0 ถึง 999999 ทศนิยมไม่เกิน 3 ตำแหน่ง");
      const unit = text(2, 20, true, "หน่วย");
      const categoryText = text(3, 30, false, "หมวด") || "อื่น ๆ";
      const category = categoryAliases[categoryText] || categoryText;
      if (!categories.includes(category)) throw new Error("หมวดไม่อยู่ในรายการ dropdown");
      const location = text(4, 60, false, "ที่เก็บ");
      const date = stockImportDate(values[5], workbook.properties.date1904);
      const kind = text(6, 40, false, "ติดตามวันที่") || "(EXP : วันหมดอายุ)";
      if (!["วันหมดอายุ", "(EXP : วันหมดอายุ)", "(BBE : ควรบริโภคก่อน)", "ตั้งใจใช้ภายใน"].includes(kind))
        throw new Error("ติดตามวันที่ไม่อยู่ในรายการ dropdown");
      let notifyBeforeDays;
      if (values[7] !== undefined && String(values[7]).trim() !== "") {
        notifyBeforeDays = Number(values[7]);
        if (!Number.isInteger(notifyBeforeDays) || notifyBeforeDays < 0 || notifyBeforeDays > 365)
          throw new Error("แจ้งเตือนก่อนกำหนดต้องเป็นจำนวนเต็ม 0 ถึง 365 วัน");
      }
      items.push({
        id: crypto.randomUUID(),
        name,
        qty: round(qty),
        unit,
        category,
        location,
        date,
        dateKind:
          kind === "ตั้งใจใช้ภายใน"
            ? "plan"
            : kind === "(BBE : ควรบริโภคก่อน)"
              ? "best-before"
              : "expiry",
        photo: null,
        ...(notifyBeforeDays === undefined ? {} : { notifyBeforeDays }),
      });
    } catch (error) {
      errors.push("แถว " + row + ": " + error.message);
    }
  }
  if (!count) throw new Error("ไฟล์ไม่มีรายการให้นำเข้า");
  if (count + stock.items.length > 2000)
    errors.push("รวมของเดิมแล้วเกิน 2,000 รายการ กรุณาลดรายการก่อนนำเข้า");
  return { items, errors, count, version: stock.version, stale: false };
}

async function readStockImport(file) {
  if (!file || busy || !stock) return;
  busy = true;
  ++generation;
  try {
    if (!/\.xlsx$/i.test(file.name)) throw new Error("กรุณาเลือกไฟล์ .xlsx");
    if (file.size > 10 * 1024 * 1024) throw new Error("ไฟล์ Excel ต้องไม่เกิน 10 MB");
    const ExcelJS = await loadExcelJS();
    const workbook = new ExcelJS.Workbook();
    try {
      await workbook.xlsx.load(await file.arrayBuffer());
    } catch {
      throw new Error("อ่านไฟล์ Excel ไม่ได้ ไฟล์อาจเสียหายหรือมีรหัสผ่าน");
    }
    pendingStockImport = parseStockImport(workbook);
    const { items, errors, count } = pendingStockImport;
    $("#excel-import-summary").innerHTML =
      '<p class="excel-import-count">พบ ' +
      count +
      " รายการ · เพิ่มเป็นรายการใหม่ ไม่ทับของเดิม ไม่มีรูป</p>" +
      (errors.length
        ? "<p>กรุณาแก้ไขไฟล์แล้วอัปโหลดใหม่ (" +
          errors.length +
          " ข้อผิดพลาด)</p><ul>" +
          errors
            .slice(0, 10)
            .map((error) => "<li>" + esc(error) + "</li>")
            .join("") +
          "</ul>"
        : "") +
      (items.length
        ? '<div class="excel-preview"><table><thead><tr>' +
          stockImportHeaders.map((header) => "<th>" + esc(header) + "</th>").join("") +
          "</tr></thead><tbody>" +
          items
            .slice(0, 20)
            .map(
              (item) =>
                "<tr>" +
                [
                  item.name,
                  item.qty,
                  item.unit,
                  item.category,
                  item.location,
                  item.date,
                  item.dateKind === "plan"
                    ? "ตั้งใจใช้ภายใน"
                    : item.dateKind === "best-before"
                      ? "(BBE : ควรบริโภคก่อน)"
                      : "(EXP : วันหมดอายุ)",
                  item.notifyBeforeDays ?? "",
                ]
                  .map((value) => "<td>" + esc(value) + "</td>")
                  .join("") +
                "</tr>",
            )
            .join("") +
          "</tbody></table></div>" +
          (items.length > 20 ? "<p>แสดงตัวอย่าง 20 รายการแรก</p>" : "")
        : "");
    $("#excel-import-error").textContent = "";
    $("#excel-import-confirm").disabled = errors.length > 0;
    $("#excel-import-dialog").showModal();
  } catch (error) {
    pendingStockImport = null;
    alertUser(error.message || "อ่านไฟล์นำเข้าไม่ได้");
  } finally {
    busy = false;
    $("#stock-import-file").value = "";
  }
}

$("#stock-import-file").addEventListener("change", (event) =>
  readStockImport(event.target.files[0]),
);
$("#excel-import-dialog").addEventListener("cancel", (event) => {
  if (busy) event.preventDefault();
});
$("#excel-import-dialog").addEventListener("close", () => {
  pendingStockImport = null;
});
$("#excel-import-confirm").addEventListener("click", () => {
  if (!pendingStockImport || pendingStockImport.errors.length || pendingStockImport.stale) return;
  const { items, version } = pendingStockImport;
  mutation(
    async (next) => {
      if (next.items.length + items.length > 2000) throw new Error("รวมของเดิมแล้วเกิน 2,000 รายการ");
      next.items.push(...items);
    },
    version,
    () => {
      $("#excel-import-dialog").close();
      alertUser("นำเข้าของแล้ว " + items.length + " รายการ");
    },
  );
});
let receiptRowId = 0;
const receiptUnits = ["ชิ้น", "กล่อง", "ถุง", "ฟอง", "ขวด", "แพ็ก", "กก.", "ลิตร"];
function receiptRow(row = {}) {
  const id = ++receiptRowId;
  const today = new Date();
  const receivedDate =
    row.receivedDate ?? calendarDateKey(today.getFullYear(), today.getMonth(), today.getDate());
  const names = [
    ...new Set([...(stock?.recentItems || []), ...(stock?.items || [])].map((i) => i.name)),
  ];
  const locations = [
    ...new Set([...rooms, ...(stock?.items || []).map((i) => i.location).filter(Boolean)]),
  ];
  const card = document.createElement("div");
  card.className = "receipt-row";
  card.receiptMedia = {
    photo: row.photo || null,
    icon: row.icon || null,
    iconColor: row.iconColor || "green",
    iconBackground: row.iconBackground || "mint",
    blob: row.blob || null,
    preview: "",
  };
  card.frozenNameSeen = Boolean(row.frozenNameSeen);
  card.freezerLocationManual = Boolean(row.freezerLocationManual);
  card.innerHTML =
    '<div class="receipt-row-header"><small>' +
    esc(row.raw || "เพิ่มเอง") +
    "</small>" +
    '<button type="button" class="text-button danger" data-action="receipt-remove-row">ลบรายการ</button></div>' +
    '<div class="receipt-fields"><label class="receipt-name">ชื่อของ<input data-field="name" maxlength="80" list="receipt-names-' +
    id +
    '" value="' +
    esc(row.name || "") +
    '"><datalist id="receipt-names-' +
    id +
    '">' +
    opts(names) +
    "</datalist></label>" +
    '<label>จำนวน<input data-field="qty" type="number" min="0.001" max="999999" step="0.001" value="' +
    esc(row.qty || 1) +
    '"></label>' +
    '<label>หน่วย<input data-field="unit" maxlength="20" list="receipt-units-' +
    id +
    '" value="' +
    esc(row.unit || "ชิ้น") +
    '"><datalist id="receipt-units-' +
    id +
    '">' +
    opts(receiptUnits) +
    "</datalist></label>" +
    '<label>หมวด<select data-field="category">' +
    opts(categories, row.category || "อื่น ๆ") +
    "</select></label>" +
    '<label>ที่เก็บ<input data-field="location" maxlength="60" list="receipt-rooms-' +
    id +
    '" value="' +
    esc(
      row.freezerLocationManual
        ? row.location || ""
        : row.location || stock?.items?.at(-1)?.location || "",
    ) +
    '"><datalist id="receipt-rooms-' +
    id +
    '">' +
    opts(locations) +
    "</datalist></label>" +
    '<div class="receipt-wide receipt-media-field"><span class="receipt-field-label">รูปภาพหรือไอคอน (ถ้ามี)</span><button type="button" class="secondary receipt-media-button" data-action="receipt-pick-media">เลือกรูปหรือไอคอน</button><div class="receipt-media-preview"></div></div>' +
    '<div class="receipt-wide barcode-field"><label for="receipt-barcode-' +
    id +
    '">บาร์โค้ดสินค้า (ถ้ามี)</label><div class="barcode-input-row"><input id="receipt-barcode-' +
    id +
    '" data-field="barcode" inputmode="numeric" pattern="[0-9]{8,14}" maxlength="14" value="' +
    esc(row.barcode || "") +
    '"><button type="button" class="secondary" data-action="receipt-scan-barcode">สแกน</button></div><p class="receipt-barcode-hint form-help" role="status"></p>' +
    '<div class="receipt-barcode-scanner barcode-scanner" hidden><video class="receipt-barcode-video" autoplay muted playsinline></video><div class="barcode-camera-controls"><label>ซูม<input class="receipt-barcode-zoom" type="range" min="1" max="1" step="0.1" value="1" disabled></label><button type="button" class="secondary receipt-barcode-torch" data-action="toggle-barcode-torch" hidden>เปิดไฟฉาย</button><button type="button" class="secondary" data-action="stop-barcode">ปิดกล้อง</button></div></div></div>' +
    '<label>วันที่รับเข้า<span class="date-control"><span class="date-display" aria-hidden="true">' +
    esc(dateInputLabel(receivedDate)) +
    '</span><input data-field="receivedDate" type="date" value="' +
    esc(receivedDate) +
    '"></span></label>' +
    '<div class="receipt-wide shelf-life-suggestion"><button type="button" class="secondary receipt-shelf-life-button" data-action="receipt-apply-shelf-life" hidden></button><p class="form-help">วันที่แนะนำเป็นค่าประมาณ ตรวจสภาพอาหารก่อนใช้เสมอ</p></div>' +
    '<label>ติดตามวันที่<select data-field="dateKind"><option value="expiry"' +
    ((row.dateKind || "expiry") === "expiry" ? " selected" : "") +
    '>(EXP : วันหมดอายุ)</option><option value="best-before"' +
    (row.dateKind === "best-before" ? " selected" : "") +
    '>(BBE : ควรบริโภคก่อน)</option><option value="plan"' +
    (row.dateKind === "plan" ? " selected" : "") +
    ">ตั้งใจใช้ภายใน</option></select></label>" +
    '<label>วันที่ (ถ้ามี)<span class="date-control"><span class="date-display" aria-hidden="true">' +
    esc(dateInputLabel(row.date || "")) +
    '</span><input data-field="date" type="date" value="' +
    esc(row.date || "") +
    '"></span></label>' +
    '<label class="receipt-wide">แจ้งเตือนก่อนกำหนดภายใน (วัน)<input data-field="notifyBeforeDays" type="number" inputmode="numeric" min="0" max="365" step="1" placeholder="ใช้ค่าเริ่มต้นจาก Settings" value="' +
    esc(row.notifyBeforeDays ?? "") +
    '"><span class="form-help">เว้นว่างเพื่อใช้ค่าเริ่มต้นจาก Settings · ใช้กับ EXP/BBE</span></label></div>';
  return card;
}

function receiptField(card, name) {
  return card.querySelector('[data-field="' + name + '"]');
}

function selectReceiptFreezer(card) {
  const name = receiptField(card, "name")?.value || "";
  if (!key(name).includes("แช่แข็ง")) {
    card.frozenNameSeen = false;
    return;
  }
  if (card.frozenNameSeen || card.freezerLocationManual) return;
  receiptField(card, "location").value = "ช่องแช่แข็ง";
  card.frozenNameSeen = true;
}

function refreshReceiptShelfLife(card) {
  const button = card.querySelector(".receipt-shelf-life-button");
  const result = suggestedShelfLife(
    receiptField(card, "name").value,
    receiptField(card, "receivedDate").value,
    receiptField(card, "category").value,
    receiptField(card, "location").value,
  );
  button.hidden = !result;
  if (result)
    button.textContent = `แนะนำ BBE ${dateInputLabel(result.date)} · ${result.name} (${result.days} วัน)`;
}

function releaseReceiptMedia(card) {
  const media = card.receiptMedia;
  if (media?.preview) URL.revokeObjectURL(media.preview);
  if (media) media.preview = "";
}

function renderReceiptMedia(card) {
  const media = card.receiptMedia;
  if (!media) return;
  if (media.blob && !media.preview) media.preview = URL.createObjectURL(media.blob);
  const src =
    media.preview || (media.photo ? "/api/photo?id=" + encodeURIComponent(media.photo) : "");
  card.querySelector(".receipt-media-preview").innerHTML = src
    ? '<img alt="รูปของที่เลือก" src="' + esc(src) + '">'
    : media.icon
      ? '<span class="thumb placeholder"' +
        itemIconStyle(media) +
        ">" +
        itemIconSvg(media.icon, "item-icon", media.iconColor, media.iconBackground) +
        "</span>"
      : '<span class="form-help">ยังไม่เลือกรูปหรือไอคอน</span>';
  card.querySelector(".receipt-media-button").textContent =
    src || media.icon ? "เปลี่ยนรูปหรือไอคอน" : "เลือกรูปหรือไอคอน";
}

function receiptRowValues(card) {
  const value = (name) => receiptField(card, name).value.trim();
  return {
    name: value("name"),
    qty: value("qty"),
    unit: value("unit"),
    category: value("category"),
    location: value("location"),
    barcode: value("barcode"),
    receivedDate: value("receivedDate"),
    dateKind: value("dateKind"),
    date: value("date"),
    notifyBeforeDays: value("notifyBeforeDays"),
    frozenNameSeen: card.frozenNameSeen,
    freezerLocationManual: card.freezerLocationManual,
    ...card.receiptMedia,
  };
}

function receiptItem(card, index) {
  const field = (name) => receiptField(card, name).value.trim();
  const name = field("name"),
    unit = field("unit"),
    qty = Number(field("qty"));
  if (
    !name ||
    !unit ||
    !Number.isFinite(qty) ||
    qty < 0.001 ||
    qty > 999999 ||
    round(qty) !== qty ||
    name.length > 80 ||
    unit.length > 20
  )
    throw new Error("รายการที่ " + index + ": กรุณาตรวจชื่อ จำนวน และหน่วย");
  const barcode = field("barcode");
  if (barcode && !/^\d{8,14}$/.test(barcode))
    throw new Error("รายการที่ " + index + ": บาร์โค้ดต้องเป็นตัวเลข 8–14 หลัก");
  const notificationDays = field("notifyBeforeDays");
  const notifyBeforeDays = notificationDays === "" ? null : Number(notificationDays);
  if (
    notifyBeforeDays !== null &&
    (!Number.isInteger(notifyBeforeDays) || notifyBeforeDays < 0 || notifyBeforeDays > 365)
  )
    throw new Error("รายการที่ " + index + ": จำนวนวันแจ้งเตือนต้องเป็น 0–365");
  const media = card.receiptMedia;
  return {
    id: crypto.randomUUID(),
    name,
    qty: round(qty),
    unit,
    category: field("category"),
    location: field("location"),
    receivedDate: field("receivedDate"),
    date: field("date"),
    dateKind: field("dateKind"),
    ...(notifyBeforeDays === null ? {} : { notifyBeforeDays }),
    photo: media.photo,
    ...(media.icon
      ? { icon: media.icon, iconColor: media.iconColor, iconBackground: media.iconBackground }
      : {}),
    ...(media.blob ? { pendingPhoto: media.blob } : {}),
    ...(barcode ? { barcode } : {}),
  };
}

function enhanceReceiptRow(card) {
  enhanceSelects(card);
  enhanceDatalists(card);
  selectReceiptFreezer(card);
  refreshReceiptShelfLife(card);
  renderReceiptMedia(card);
}

function renderReceiptReview() {
  const review = $("#receipt-review");
  review.querySelectorAll(".receipt-row").forEach(releaseReceiptMedia);
  review.replaceChildren();
  const summary = document.createElement("p");
  summary.className = "form-help";
  summary.textContent = pendingReceipt.rows.length
    ? "อ่านได้ " + pendingReceipt.rows.length + " รายการ · ลบรายการที่ไม่ต้องการ แล้วตรวจแก้ก่อนบันทึก"
    : "ยังแยกรายการสินค้าไม่ได้ กรุณาดูข้อความที่อ่านได้แล้วเพิ่มรายการเอง";
  review.append(summary);
  for (const row of pendingReceipt.rows) {
    const card = receiptRow(row);
    review.append(card);
    enhanceReceiptRow(card);
  }
  const details = document.createElement("details");
  const heading = document.createElement("summary");
  heading.textContent = "ดูข้อความที่อ่านจากใบเสร็จ";
  const raw = document.createElement("pre");
  raw.textContent = pendingReceipt.text || "(อ่านตัวอักษรไม่ได้)";
  details.append(heading, raw);
  review.append(details);
}

async function readReceipt(file) {
  if (!file || busy || !stock) return;
  const button = $("#receipt-trigger");
  const progress = $("#receipt-progress");
  busy = true;
  startButtonLoading(button);
  button.disabled = true;
  progress.textContent = "กำลังอ่านใบเสร็จ…";
  try {
    if (!file.type.startsWith("image/")) throw new Error("กรุณาเลือกรูปใบเสร็จ");
    const { scanReceipt } = await import("/receipt.js");
    const version = stock.version;
    const { text, rows } = await scanReceipt(
      file,
      [...stock.items, ...(stock.recentItems || [])],
      (percent) => {
        progress.textContent = "กำลังอ่านใบเสร็จ " + percent + "%";
      },
    );
    pendingReceipt = { text, rows, version, file, stale: false };
    renderReceiptReview();
    $("#receipt-error").textContent = "";
    $("#receipt-ai-status").textContent = "";
    $("#receipt-ai-tools").hidden = true;
    $("#receipt-dialog").showModal();
    try {
      const availability = await request("receipt-ai");
      if (pendingReceipt && availability.available) $("#receipt-ai-tools").hidden = false;
    } catch {
      /* Local OCR remains available without the AI service. */
    }
  } catch (error) {
    alertUser(error.message || "อ่านใบเสร็จไม่ได้ กรุณาลองใช้รูปที่ชัดขึ้น");
  } finally {
    busy = false;
    stopButtonLoading(button);
    button.disabled = false;
    progress.textContent = "";
    $("#receipt-file").value = "";
  }
}

$("#receipt-file").addEventListener("change", (event) => readReceipt(event.target.files[0]));
$("#receipt-dialog").addEventListener("cancel", (event) => {
  if (busy) event.preventDefault();
});
$("#receipt-dialog").addEventListener("close", () => {
  stopBarcodeScan();
  $("#receipt-review").querySelectorAll(".receipt-row").forEach(releaseReceiptMedia);
  pendingReceipt = null;
});
function updateReceiptRow(event) {
  const card = event.target.closest?.(".receipt-row");
  if (!card) return;
  const field = event.target.dataset.field;
  if (field === "location") card.freezerLocationManual = true;
  if (field === "name") {
    if (event.type === "change") {
      const known = [...stock.items, ...(stock.recentItems || [])]
        .reverse()
        .find((item) => key(item.name) === key(receiptField(card, "name").value));
      if (known) {
        if (receiptField(card, "unit").value === "ชิ้น")
          receiptField(card, "unit").value = known.unit;
        if (!receiptField(card, "location").value)
          receiptField(card, "location").value = known.location || "";
        if (receiptField(card, "category").value === "อื่น ๆ") {
          receiptField(card, "category").value = known.category;
          refreshSearchSelect(receiptField(card, "category"));
        }
        if (!receiptField(card, "barcode").value)
          receiptField(card, "barcode").value = known.barcode || "";
      }
    }
    selectReceiptFreezer(card);
  }
  if (field === "barcode" && event.type === "change")
    applyBarcode(event.target.value.trim(), barcodeContext(card));
  if (["name", "location", "category", "receivedDate"].includes(field))
    refreshReceiptShelfLife(card);
}
$("#receipt-review").addEventListener("input", updateReceiptRow);
$("#receipt-review").addEventListener("change", updateReceiptRow);
$("#receipt-ai-button").addEventListener("click", async () => {
  if (!pendingReceipt || busy || pendingReceipt.stale) return;
  stopBarcodeScan();
  const button = $("#receipt-ai-button");
  const status = $("#receipt-ai-status");
  busy = true;
  button.disabled = true;
  startButtonLoading(button);
  status.textContent = "AI กำลังวิเคราะห์รูปใบเสร็จ…";
  $("#receipt-error").textContent = "";
  try {
    const { prepareAiImage } = await import("/receipt.js");
    const image = await prepareAiImage(pendingReceipt.file);
    const result = await post("receipt-ai", {
      ...image,
      ocrText: pendingReceipt.text,
      model: $("#receipt-ai-model").value,
    });
    if (!result.rows?.length) throw new Error("AI ไม่พบรายการที่ชัดเจน กรุณาใช้ผลสแกนเดิม");
    const old = [...$("#receipt-review").querySelectorAll(".receipt-row")].map(receiptRowValues);
    pendingReceipt.rows = result.rows.map((row, index) => {
      const previous =
        old.find((item) => item.barcode && item.barcode === row.barcode) || old[index];
      return {
        ...row,
        date: previous?.date || "",
        location: previous?.freezerLocationManual
          ? previous.location
          : previous?.location || row.location,
        receivedDate: previous?.receivedDate,
        dateKind: previous?.dateKind,
        notifyBeforeDays: previous?.notifyBeforeDays,
        photo: previous?.photo,
        icon: previous?.icon,
        iconColor: previous?.iconColor,
        iconBackground: previous?.iconBackground,
        blob: previous?.blob,
        frozenNameSeen: previous?.frozenNameSeen,
        freezerLocationManual: previous?.freezerLocationManual,
      };
    });
    renderReceiptReview();
    status.textContent = "AI แนะนำ " + result.rows.length + " รายการ · กรุณาตรวจแก้ก่อนรับเข้าบ้าน";
  } catch (error) {
    if (error.status === 401) entry("login", errorText(error));
    else status.textContent = error.message || "AI ตรวจใบเสร็จไม่ได้ กรุณาใช้ผลสแกนเดิม";
  } finally {
    busy = false;
    stopButtonLoading(button);
    button.disabled = false;
  }
});
$("#receipt-confirm").addEventListener("click", () => {
  if (!pendingReceipt || pendingReceipt.stale) return;
  const selected = [...$("#receipt-review").querySelectorAll(".receipt-row")];
  const error = $("#receipt-error");
  if (!selected.length) {
    error.textContent = "ไม่มีรายการให้รับเข้าบ้าน กรุณาเพิ่มรายการอย่างน้อย 1 รายการ";
    return;
  }
  const items = [];
  for (const [index, card] of selected.entries()) {
    try {
      items.push(receiptItem(card, index + 1));
    } catch (validationError) {
      error.textContent = validationError.message;
      return;
    }
  }
  error.textContent = "";
  stopBarcodeScan();
  mutation(
    async (next) => {
      if (next.items.length + items.length > 2000) throw new Error("รวมของเดิมแล้วเกิน 2,000 รายการ");
      for (const item of items) {
        if (!item.pendingPhoto) continue;
        const uploaded = await request("photo", {
          method: "POST",
          headers: { "Content-Type": "image/jpeg" },
          body: item.pendingPhoto,
        });
        item.photo = uploaded.id;
        delete item.pendingPhoto;
      }
      next.items.push(...items);
      for (const item of items) {
        const remembered = {
          name: item.name,
          unit: item.unit,
          category: item.category,
          location: item.location,
          barcode: item.barcode || "",
        };
        next.recentItems = [
          remembered,
          ...(next.recentItems || []).filter(
            (entry) => key(entry.name) !== key(item.name) || key(entry.unit) !== key(item.unit),
          ),
        ].slice(0, 100);
      }
    },
    pendingReceipt.version,
    () => {
      $("#receipt-dialog").close();
      alertUser("รับเข้าสต็อกแล้ว " + items.length + " รายการ");
    },
  );
});
function thumb(item, editable = false) {
  const content = item.photo
    ? '<img class="thumb" decoding="async" loading="lazy" alt="" src="/api/photo?id=' +
      encodeURIComponent(item.photo) +
      '">'
    : '<span aria-hidden="true" class="thumb placeholder"' +
      itemIconStyle(item) +
      ">" +
      (itemIconSvg(item.icon, "item-icon", item.iconColor) || esc([...item.name][0] || "·")) +
      "</span>";
  if (!editable) return content;
  return (
    '<button type="button" class="item-media-trigger" data-action="choose-item-media" data-id="' +
    esc(item.id) +
    '" aria-label="' +
    esc((item.photo || item.icon ? "เปลี่ยนรูปหรือไอคอนของ " : "เพิ่มรูปหรือไอคอนของ ") + item.name) +
    '">' +
    content +
    "</button>"
  );
}
const badgeDetails = {
  category: {
    เนื้อสัตว์: { icon: "🥩", tone: "meat" },
    ผัก: { icon: "🥦", tone: "vegetables" },
    ของสด: { icon: "🧺", tone: "fresh" },
    ของแช่แข็ง: { icon: "🧊", tone: "frozen" },
    ของแห้ง: { icon: "🌾", tone: "dry" },
    เครื่องปรุง: { icon: "🧂", tone: "seasonings" },
    อาหารปรุงสุก: { icon: "🍲", tone: "cooked" },
    ขนม: { icon: "🍪", tone: "snacks" },
    "อื่น ๆ": { icon: "📦", tone: "other" },
    ทุกหมวด: { icon: "✦", tone: "all" },
  },
  location: {
    ตู้เย็น: { icon: "🧊", tone: "fridge" },
    ช่องแช่แข็ง: { icon: "❄️", tone: "freezer" },
    ชั้นวาง: { icon: "🗄️", tone: "pantry" },
    ทุกที่เก็บ: { icon: "✦", tone: "all" },
  },
};
function valueBadge(value, type) {
  const detail =
    badgeDetails[type][value] ||
    (type === "location" ? { icon: "📍", tone: "custom" } : { icon: "📦", tone: "other" });
  return (
    '<span class="stock-badge stock-badge--' +
    detail.tone +
    '"><span class="stock-badge-icon" aria-hidden="true">' +
    detail.icon +
    "</span><span>" +
    esc(value) +
    "</span></span>"
  );
}
function cardFilterBadge(value, type) {
  const label = type === "category" ? "หมวด" : "ที่เก็บ";
  return (
    '<button type="button" class="item-card-filter" data-action="filter-card-badge" data-filter-type="' +
    type +
    '" data-filter-value="' +
    esc(value) +
    '" aria-label="กรองของในบ้านตาม' +
    label +
    " " +
    esc(value) +
    '">' +
    valueBadge(value, type) +
    "</button>"
  );
}
function getItemView(page) {
  try {
    return localStorage.getItem("home-stock-item-view-" + page) === "grid" ? "grid" : "list";
  } catch {
    return "list";
  }
}
function itemViewToggle(page) {
  const mode = getItemView(page);
  const icons = {
    list: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 6h13M8 12h13M8 18h13"/><path d="M3 6h.01M3 12h.01M3 18h.01"/></svg>',
    grid: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>',
  };
  const option = (value, label) =>
    '<button type="button" class="item-view-option' +
    (mode === value ? " is-active" : "") +
    '" data-action="set-item-view" data-id="' +
    value +
    '" aria-label="แสดงแบบ' +
    label +
    '" title="' +
    label +
    '" aria-pressed="' +
    (mode === value) +
    '">' +
    icons[value] +
    "</button>";
  return (
    '<div class="item-view-toggle" role="group" aria-label="รูปแบบการแสดงผล">' +
    option("list", "รายการ") +
    option("grid", "รูปใหญ่") +
    "</div>"
  );
}
function itemMenu(item, shopping = false, gridMode = false) {
  const editLabel =
    '<svg class="item-menu-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z"/></svg><span>แก้ไข</span>';
  const mediaLabel =
    '<svg class="item-menu-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/></svg><span>เปลี่ยนรูปหรือไอคอน</span>';
  const choices = shopping
    ? button("receive", "รับเข้าบ้าน", item.id, "item-menu-option") +
      button("edit-shopping", editLabel, item.id, "item-menu-option")
    : gridMode
      ? button(
          "use",
          item.qty < 1 ? "- ใช้หมด" : "- 1 " + esc(item.unit),
          item.id,
          "item-menu-option",
        ) +
        button("custom-use", "- ระบุจำนวน", item.id, "item-menu-option") +
        button("edit-item", editLabel, item.id, "item-menu-option") +
        (tab() === "stock"
          ? button("choose-item-media", mediaLabel, item.id, "item-menu-option")
          : "") +
        button(
          "shopping-from-item",
          paperPlusLabel("เพิ่มไปในรายการซื้อ"),
          item.id,
          "item-menu-option",
        ) +
        button("confirm-remove-item", "ลบรายการ", item.id, "item-menu-option danger")
      : button("edit-item", editLabel, item.id, "item-menu-option") +
        button(
          "shopping-from-item",
          paperPlusLabel("เพิ่มไปในรายการซื้อ"),
          item.id,
          "item-menu-option",
        ) +
        button("confirm-remove-item", "ลบรายการ", item.id, "item-menu-option danger");
  return (
    '<div class="item-menu-wrap"><button type="button" class="item-menu-trigger" data-action="toggle-item-menu" data-id="' +
    esc(item.id) +
    '" aria-label="การทำงานเพิ่มเติมสำหรับ ' +
    esc(item.name) +
    '" aria-haspopup="menu" aria-expanded="false"><span aria-hidden="true">⋮</span></button>' +
    '<div class="item-menu" role="menu" hidden>' +
    choices +
    "</div></div>"
  );
}
function row(item, shopping = false) {
  let meta, detail, actions;
  const gridMode = !shopping && ["today", "stock"].includes(tab()) && getItemView(tab()) === "grid";
  if (shopping) {
    const total = totalFor(item);
    detail = "ซื้อ " + amount(item);
    meta = "ที่บ้านเหลือ " + amountFormat.format(total) + " " + item.unit;
    actions =
      button("receive", addActionLabel("stock", "ซื้อแล้ว"), item.id) +
      button("edit-shopping", "แก้ไข", item.id, "action small");
  } else {
    detail = amount(item);
    meta = [
      item.category && valueBadge(item.category, "category"),
      item.location && valueBadge(item.location, "location"),
    ]
      .filter(Boolean)
      .join("");
    actions = gridMode
      ? itemMenu(item, false, true)
      : button(
          "use",
          item.qty < 1 ? "- ใช้หมด" : "- 1 " + esc(item.unit),
          item.id,
          "stock-action stock-action-use",
        ) +
        button("custom-use", "- ระบุจำนวน", item.id, "stock-action stock-action-custom") +
        itemMenu(item);
  }
  const date =
    shopping || gridMode
      ? ""
      : '<div class="meta ' +
        (daysLeft(item.date) <= 0 ? "warn" : "") +
        '">' +
        esc(dateLabel(item)) +
        "</div>";
  const media = gridMode
    ? '<div class="item-card-media">' + thumb(item) + gridDateBadge(item) + "</div>"
    : thumb(item, !shopping && tab() === "stock");
  const gridBadges = gridMode
    ? '<div class="item-grid-badges">' +
      (item.category ? cardFilterBadge(item.category, "category") : "") +
      (item.location ? cardFilterBadge(item.location, "location") : "") +
      "</div>"
    : "";
  const nameAndQty = gridMode
    ? '<div class="item-name">' +
      esc(item.name) +
      '</div><div class="qty item-grid-qty">' +
      esc(detail) +
      "</div>"
    : '<div class="item-name">' +
      esc(item.name) +
      ' <span class="qty">· ' +
      esc(detail) +
      "</span></div>";
  return (
    '<article class="line-item' +
    (gridMode ? " is-grid-card" : "") +
    '"' +
    (gridMode
      ? ' data-action="toggle-card-menu" role="button" tabindex="0" aria-haspopup="menu" aria-expanded="false" aria-label="เปิด action menu ของ ' +
        esc(item.name) +
        '"'
      : "") +
    ">" +
    media +
    '<div class="item-info">' +
    nameAndQty +
    gridBadges +
    date +
    (gridMode
      ? ""
      : '<div class="meta' +
        (shopping ? "" : " item-badges") +
        '">' +
        (shopping ? esc(meta) : meta) +
        "</div>") +
    '</div><div class="item-actions">' +
    actions +
    "</div></article>"
  );
}
function totalFor(item) {
  return round(
    stock.items
      .filter((i) => key(i.name) === key(item.name) && key(i.unit) === key(item.unit))
      .reduce((sum, i) => sum + i.qty, 0),
  );
}
function section(title, items, options = {}) {
  const mode =
    options.shopping || !["today", "stock"].includes(tab()) ? "list" : getItemView(tab());
  return (
    '<section class="section' +
    (options.dashboardDue ? " dashboard-due" : "") +
    '"><div class="section-head ' +
    (options.urgent ? "urgent" : "") +
    '"><h2>' +
    esc(title) +
    "</h2><span>" +
    items.length +
    " รายการ</span></div>" +
    '<div class="item-collection view-' +
    mode +
    '">' +
    items.map((i) => row(i, options.shopping)).join("") +
    "</div>" +
    "</section>"
  );
}
function empty(title, description, action = "", label = "") {
  const actionLabel =
    action === "add"
      ? addActionLabel("stock", label)
      : action === "new-shopping"
        ? addActionLabel("shopping", label)
        : label;
  return (
    '<section class="empty"><h2>' +
    esc(title) +
    "</h2><p>" +
    esc(description) +
    "</p>" +
    (action ? button(action, actionLabel, "", "secondary") : "") +
    "</section>"
  );
}

function mealShortages(plan, items = stock?.items || []) {
  const required = new Map();
  for (const ingredient of plan.ingredients) {
    const groupKey = key(ingredient.name) + "\u0000" + key(ingredient.unit);
    const group = required.get(groupKey) || {
      name: ingredient.name,
      unit: ingredient.unit,
      qty: 0,
    };
    group.qty = round(group.qty + ingredient.qty);
    required.set(groupKey, group);
  }
  return [...required.values()]
    .map((ingredient) => {
      const available = round(
        items
          .filter(
            (item) =>
              key(item.name) === key(ingredient.name) && key(item.unit) === key(ingredient.unit),
          )
          .reduce((sum, item) => sum + item.qty, 0),
      );
      return { ...ingredient, missing: round(ingredient.qty - available) };
    })
    .filter((ingredient) => ingredient.missing > 0.0001);
}

function stockMatchesForName(name) {
  if (!name) return [];
  const groups = new Map();
  for (const item of stock.items) {
    if (key(item.name) !== key(name)) continue;
    const unitKey = key(item.unit);
    const group = groups.get(unitKey) || { unit: item.unit, qty: 0 };
    group.qty = round(group.qty + item.qty);
    groups.set(unitKey, group);
  }
  return [...groups.values()].sort((a, b) => b.qty - a.qty);
}

function ingredientUnitFieldHtml(rowId, unit, locked) {
  if (locked) {
    return (
      '<input class="meal-ingredient-unit" required value="' +
      esc(unit) +
      '" readonly tabindex="-1">'
    );
  }
  const unitList = "meal-unit-options-" + rowId;
  const units = [
    ...new Set([
      "ชิ้น",
      "กล่อง",
      "ถุง",
      "ฟอง",
      "ขวด",
      "แพ็ก",
      "กก.",
      "ลิตร",
      ...stock.items.map((entry) => entry.unit),
    ]),
  ];
  return (
    '<input class="meal-ingredient-unit" required autocomplete="off" maxlength="20" list="' +
    unitList +
    '" value="' +
    esc(unit || "ชิ้น") +
    '"><datalist id="' +
    unitList +
    '">' +
    opts(units) +
    "</datalist>"
  );
}

function ingredientHintHtml(locked, stockQty, qty, unit) {
  if (!locked) return '<span class="stock-badge stock-badge--custom">ไม่มีในบ้าน</span>';
  const remaining = round(stockQty - (Number(qty) || 0));
  const remainingHtml =
    remaining < 0
      ? '<span class="meal-ingredient-remaining meal-ingredient-remaining--short">ไม่พอ ขาดอีก ' +
        esc(amountFormat.format(-remaining)) +
        " " +
        esc(unit) +
        "</span>"
      : '<span class="meal-ingredient-remaining">กรอกแล้วเหลือ ' +
        esc(amountFormat.format(remaining)) +
        " " +
        esc(unit) +
        "</span>";
  return (
    '<span class="stock-badge stock-badge--in-stock">อยู่ในบ้าน · มี ' +
    esc(amountFormat.format(stockQty)) +
    " " +
    esc(unit) +
    "</span>" +
    remainingHtml
  );
}

function refreshIngredientRow(row) {
  const name = row.querySelector(".meal-ingredient-name")?.value.trim() || "";
  const matches = stockMatchesForName(name);
  const locked = matches.length > 0;
  const currentUnit = row.querySelector(".meal-ingredient-unit")?.value.trim() || "";
  const match =
    (currentUnit && matches.find((entry) => key(entry.unit) === key(currentUnit))) || matches[0];
  const unit = locked ? match.unit : currentUnit;
  row.dataset.locked = locked ? "1" : "0";
  row.dataset.stockUnit = unit;
  row.dataset.stockQty = String(locked ? match.qty : 0);
  const unitWrap = row.querySelector(".meal-ingredient-unit-field");
  unitWrap.innerHTML = ingredientUnitFieldHtml(row.dataset.ingredientId, unit, locked);
  if (!locked) enhanceDatalists(unitWrap);
  updateIngredientHint(row);
}

function updateIngredientHint(row) {
  const locked = row.dataset.locked === "1";
  const stockQty = Number(row.dataset.stockQty) || 0;
  const unit = row.dataset.stockUnit || "";
  const qty = Number(row.querySelector(".meal-ingredient-qty")?.value) || 0;
  row.querySelector(".meal-ingredient-hint").innerHTML = ingredientHintHtml(
    locked,
    stockQty,
    qty,
    unit,
  );
}

function shortageDropdown(planId) {
  return (
    '<details class="shortage-dropdown"><summary class="secondary">' +
    addActionLabel("stock", "เพิ่มของที่ขาด") +
    '</summary><div class="shortage-dropdown-menu" role="menu">' +
    button(
      "add-shortages-inventory",
      addActionLabel("stock", "เพิ่มของในบ้าน"),
      planId,
      "shortage-menu-option",
    ) +
    button(
      "add-shortages-shopping",
      addActionLabel("shopping", "จดรายการซื้อ"),
      planId,
      "shortage-menu-option",
    ) +
    "</div></details>"
  );
}

function mealPlanCard(plan) {
  const shortages = plan.status === "planned" ? mealShortages(plan) : [];
  const ingredients = plan.ingredients
    .map((item) => esc(item.name) + " " + esc(amount(item)))
    .join(" · ");
  let actions = "";
  if (plan.status === "planned") {
    actions =
      button("edit-meal-plan", "แก้ไขแผน", plan.id, "secondary action small") +
      (shortages.length
        ? shortageDropdown(plan.id)
        : button("mark-meal-cooked", "ทำอาหารแล้ว", plan.id, "primary")) +
      button("remove-meal-plan", "ลบแผน", plan.id, "text-button danger");
  } else if (plan.status === "cooked") {
    actions =
      (!plan.cookedItemCreated
        ? button(
            "create-cooked-stock",
            addActionLabel("cooked", "เพิ่มเข้ารายการปรุงสุก"),
            plan.id,
            "secondary",
          )
        : "") + button("complete-meal-plan", "เสร็จสิ้น", plan.id, "primary");
  }
  const statusLabel =
    plan.status === "completed" ? "เสร็จสิ้นแล้ว" : plan.status === "cooked" ? "ทำแล้ว" : "วางแผน";
  const dateLabel = dateFormat.format(localDay(plan.date));
  return (
    '<article class="meal-plan-card"><div class="meal-plan-card-head"><h4>🍲 ' +
    esc(plan.name) +
    '</h4><span class="meal-plan-status' +
    (plan.status !== "planned" ? " is-cooked" : "") +
    '">' +
    statusLabel +
    '</span></div><p class="meal-plan-summary">' +
    esc(dateLabel) +
    " · " +
    plan.servings +
    " ที่ · " +
    (plan.recipeId ? "จากเมนูที่บันทึกไว้" : "แผนเฉพาะมื้อ") +
    '</p><p class="meal-plan-ingredients">' +
    ingredients +
    "</p>" +
    (shortages.length
      ? '<p class="meal-plan-shortage">ของขาด: ' +
        shortages
          .map(
            (item) =>
              esc(item.name) + " " + amountFormat.format(item.missing) + " " + esc(item.unit),
          )
          .join(" · ") +
        "</p>"
      : plan.status === "planned"
        ? '<p class="meal-plan-available">วัตถุดิบครบ</p>'
        : "") +
    (actions ? '<div class="meal-plan-actions">' + actions + "</div>" : "") +
    "</article>"
  );
}

function mealPlanListRow(plan) {
  const shortages = plan.status === "planned" ? mealShortages(plan) : [];
  const ingredients = plan.ingredients
    .map((item) => esc(item.name) + " " + esc(amount(item)))
    .join(" · ");
  const actions =
    (plan.status === "planned"
      ? button("edit-meal-plan", "แก้ไขแผน", plan.id, "secondary") +
        (shortages.length
          ? shortageDropdown(plan.id)
          : button("mark-meal-cooked", "ทำอาหารแล้ว", plan.id, "primary"))
      : plan.status === "cooked"
        ? (!plan.cookedItemCreated
            ? button(
                "create-cooked-stock",
                addActionLabel("cooked", "เพิ่มเข้ารายการปรุงสุก"),
                plan.id,
                "secondary",
              )
            : "") + button("complete-meal-plan", "เสร็จสิ้น", plan.id, "primary")
        : "") + button("remove-meal-plan", "ลบแผน", plan.id, "text-button danger");
  const statusLabel =
    plan.status === "completed" ? "เสร็จสิ้นแล้ว" : plan.status === "cooked" ? "ทำแล้ว" : "วางแผน";
  return (
    '<article class="meal-plan-list-row"><div class="meal-plan-list-main"><div class="meal-plan-list-title"><h3>🍲 ' +
    esc(plan.name) +
    '</h3><span class="meal-plan-status' +
    (plan.status !== "planned" ? " is-cooked" : "") +
    '">' +
    statusLabel +
    '</span></div><p class="meal-plan-summary">' +
    esc(dateFormat.format(localDay(plan.date))) +
    " · " +
    plan.servings +
    " ที่ · " +
    ingredients +
    "</p>" +
    (shortages.length
      ? '<p class="meal-plan-shortage">ของขาด: ' +
        shortages
          .map(
            (item) =>
              esc(item.name) + " " + amountFormat.format(item.missing) + " " + esc(item.unit),
          )
          .join(" · ") +
        "</p>"
      : plan.status === "planned"
        ? '<p class="meal-plan-available">วัตถุดิบครบ</p>'
        : "") +
    '</div><div class="meal-plan-list-actions">' +
    actions +
    "</div></article>"
  );
}

function mealRecipeCard(recipe) {
  const ingredients = recipe.ingredients
    .map(
      (item) =>
        '<span class="recipe-ingredient"><span>' +
        esc(item.name) +
        "</span><strong>" +
        esc(amount(item)) +
        "</strong></span>",
    )
    .join("");
  return (
    '<article class="meal-plan-card meal-recipe-card"><div class="recipe-card-header"><div class="recipe-card-title"><span class="recipe-card-icon" aria-hidden="true">📖</span><div><h3>' +
    esc(recipe.name) +
    '</h3><span class="meal-plan-status">เมนูที่บันทึกไว้</span></div></div><span class="recipe-servings">' +
    recipe.servings +
    ' ที่</span></div><div class="recipe-ingredients">' +
    ingredients +
    '</div><div class="recipe-card-actions">' +
    button("plan-recipe", addActionLabel("meal", "วางแผนเมนูนี้"), recipe.id, "primary") +
    button("edit-recipe", "แก้ไขเมนู", recipe.id, "secondary") +
    button("remove-recipe", "ลบเมนู", recipe.id, "text-button danger") +
    "</div></article>"
  );
}

function mealCollectionSection(
  title,
  items,
  emptyMessage,
  renderItem,
  listClass = "meal-plan-list",
) {
  return (
    '<section class="section meal-page-section"><div class="section-head"><h2>' +
    esc(title) +
    "</h2><span>" +
    items.length +
    " รายการ</span></div>" +
    (items.length
      ? '<div class="' + listClass + '">' + items.map(renderItem).join("") + "</div>"
      : '<p class="meal-page-empty">' + esc(emptyMessage) + "</p>") +
    "</section>"
  );
}

function expiryCalendar(items, plans = stock?.mealPlans || []) {
  const firstDay = new Date(calendarYear, calendarMonth, 1);
  const daysInMonth = new Date(calendarYear, calendarMonth + 1, 0).getDate();
  const today = new Date();
  const todayKey = calendarDateKey(today.getFullYear(), today.getMonth(), today.getDate());
  const counts = new Map();
  const planCounts = new Map();
  for (const item of items) {
    if (!item.date || !["expiry", "best-before"].includes(item.dateKind)) continue;
    counts.set(item.date, (counts.get(item.date) || 0) + 1);
  }
  for (const plan of plans) {
    if (plan.status !== "planned") continue;
    planCounts.set(plan.date, (planCounts.get(plan.date) || 0) + 1);
  }

  const weekdays = ["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"];
  let cells = weekdays.map((day) => '<span class="calendar-weekday">' + day + "</span>").join("");
  const leadingDays = firstDay.getDay();
  const gridDays = Math.ceil((leadingDays + daysInMonth) / 7) * 7;
  for (let index = 0; index < gridDays; index++) {
    const date = new Date(calendarYear, calendarMonth, index - leadingDays + 1, 12);
    const dateYear = date.getFullYear();
    const dateMonth = date.getMonth();
    const day = date.getDate();
    const dateKey = calendarDateKey(dateYear, dateMonth, day);
    const count = counts.get(dateKey) || 0;
    const mealCount = planCounts.get(dateKey) || 0;
    const countBadges = [
      count &&
        '<span class="calendar-day-count calendar-expiry-count" aria-label="วันกำหนด EXP/BBE ' +
          count +
          '">' +
          count +
          "</span>",
      mealCount &&
        '<span class="calendar-day-count calendar-meal-count" aria-label="แผนทำอาหาร ' +
          mealCount +
          '">' +
          mealCount +
          "</span>",
    ]
      .filter(Boolean)
      .join("");
    const selected = dateKey === selectedCalendarDate;
    const inCurrentMonth = dateMonth === calendarMonth;
    const dateLabel = new Intl.DateTimeFormat("th-TH", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    }).format(date);
    cells +=
      '<button type="button" class="calendar-day' +
      (inCurrentMonth ? "" : " is-adjacent") +
      (count ? " has-expiry" : " is-empty") +
      (mealCount ? " has-meals" : "") +
      (dateKey === todayKey ? " is-today" : "") +
      (selected ? " is-selected" : "") +
      '" data-action="select-expiry-date" data-id="' +
      dateKey +
      '" aria-label="' +
      esc(dateLabel + ", วันกำหนด EXP/BBE " + count + " รายการ, แผนทำอาหาร " + mealCount + " เมนู") +
      '" aria-pressed="' +
      selected +
      '"' +
      (dateKey === todayKey ? ' aria-current="date"' : "") +
      '"><span class="calendar-day-number">' +
      day +
      "</span>" +
      (countBadges ? '<span class="calendar-day-counts">' + countBadges + "</span>" : "") +
      "</button>";
  }

  let details = "";
  if (selectedCalendarDate) {
    const selectedItems = items.filter(
      (item) =>
        ["expiry", "best-before"].includes(item.dateKind) && item.date === selectedCalendarDate,
    );
    const selectedPlans = plans.filter(
      (plan) => plan.status === "planned" && plan.date === selectedCalendarDate,
    );
    const selectedLabel = new Intl.DateTimeFormat("th-TH", {
      day: "numeric",
      month: "long",
      year: "numeric",
    }).format(localDay(selectedCalendarDate));
    details =
      '<div class="calendar-details" aria-live="polite"><section class="calendar-detail-group"><h3>วันกำหนด EXP/BBE วันที่ ' +
      esc(selectedLabel) +
      " · " +
      selectedItems.length +
      " รายการ</h3>" +
      (selectedItems.length
        ? selectedItems.map((item) => row(item)).join("")
        : '<p class="calendar-no-expiry">ไม่มีของถึงกำหนดวันนี้</p>') +
      '</section><section class="calendar-detail-group"><h3>แผนทำอาหาร · ' +
      selectedPlans.length +
      " เมนู</h3>" +
      (selectedPlans.length
        ? '<div class="meal-plan-list">' + selectedPlans.map(mealPlanCard).join("") + "</div>"
        : '<p class="calendar-no-expiry">ยังไม่มีแผนทำอาหารวันนี้</p>') +
      "</section></div>";
  }

  const monthLabel = new Intl.DateTimeFormat("th-TH", {
    month: "long",
    year: "numeric",
  }).format(firstDay);
  return (
    '<section class="expiry-calendar" aria-labelledby="expiry-calendar-title"><div class="calendar-head"><h2 id="expiry-calendar-title">ปฏิทิน</h2><div class="calendar-month"><button type="button" class="calendar-nav" data-action="calendar-prev" aria-label="เดือนก่อน">‹</button><h3>' +
    esc(monthLabel) +
    '</h3><button type="button" class="calendar-nav" data-action="calendar-next" aria-label="เดือนถัดไป">›</button></div>' +
    button(
      "add-meal-plan",
      addActionLabel("meal", "วางแผนทำอาหาร"),
      selectedCalendarDate || todayKey,
      "secondary calendar-add-plan",
    ) +
    '</div><div class="calendar-legend"><span><i class="calendar-legend-expiry"></i>EXP / BBE · วันหมดอายุ / ควรบริโภคก่อน</span><span><i class="calendar-legend-meal"></i>แผนทำอาหาร</span></div><div class="calendar-grid">' +
    cells +
    "</div>" +
    details +
    "</section>"
  );
}

function settingsContent() {
  const choices = [
    ["full", "เต็ม", "เปิดประตู ซูมเข้า และขยายเนื้อหาแบบ parallax"],
    ["minimal", "แบบย่อ", "แสดงประตูกับลูกบิดหมุนระหว่างโหลด แล้วค่อย ๆ จางหาย"],
    ["off", "ปิด", "ไม่แสดงฉากแอนิเมชันตอนโหลด"],
  ];
  return (
    '<section class="settings-panel"><h2>แอนิเมชันตอนเปิดแอป</h2>' +
    '<p class="form-help">เลือกรูปแบบฉากระหว่างรอโหลด และระบบจะจดจำการตั้งค่านี้ไว้ในอุปกรณ์</p>' +
    '<fieldset class="animation-options"><legend>รูปแบบแอนิเมชัน</legend>' +
    choices
      .map(
        ([value, title, description]) =>
          '<label class="animation-choice"><input type="radio" name="animation-mode" value="' +
          value +
          '"' +
          (animationMode === value ? " checked" : "") +
          "><span><strong>" +
          title +
          "</strong><small>" +
          description +
          "</small></span></label>",
      )
      .join("") +
    '</fieldset><p id="settings-error" class="error" role="alert"></p>' +
    '<section class="settings-stock"><h2>จำนวนขั้นต่ำ</h2><p class="form-help">เมื่อของเหลือน้อยกว่าที่ตั้งไว้ แอปจะแสดงในรายการซื้อ</p>' +
    minimumSettings() +
    "</section>" +
    '<section class="settings-stock"><h2>แจ้งเตือนของใกล้หมดอายุ</h2>' +
    '<p class="form-help">ส่งวันละครั้งประมาณ 09:00 น. ค่าใน Settings เป็นค่าเริ่มต้น; รายการที่กำหนดวันเตือนเองจะใช้ค่านั้นแทน</p>' +
    '<label>เตือนล่วงหน้า<select id="alert-days"><option value="0">ปิด</option><option value="1">1 วัน</option><option value="3">3 วัน</option><option value="7">7 วัน</option></select></label>' +
    '<button type="button" class="secondary" data-action="save-alerts">บันทึกการแจ้งเตือน</button>' +
    '<div class="alert-test-controls"><button type="button" class="secondary" data-action="test-alert-now">[ทดสอบ] ส่งการแจ้งเตือน</button>' +
    '<div class="alert-test-delay"><label for="alert-test-seconds">[ทดสอบ] ส่งการแจ้งเตือนในอีก</label> ' +
    '<input id="alert-test-seconds" type="number" inputmode="numeric" min="1" max="3600" step="1" value="5"> วินาที ' +
    '<button type="button" class="secondary" data-action="test-alert-later">เริ่มจับเวลา</button></div></div>' +
    '<p id="alert-status" class="form-help" role="status"></p></section>' +
    '<button type="button" class="secondary settings-logout" data-action="logout">ออกจากระบบ</button></section>'
  );
}

function minimumSettings() {
  const names = new Map();
  for (const item of [...(stock.recentItems || []), ...stock.items])
    names.set(key(item.name) + "\u0000" + key(item.unit), item);
  return (
    [...names.values()]
      .sort((a, b) => a.name.localeCompare(b.name, "th"))
      .map((item) => {
        const level = (stock.minLevels || []).find(
          (entry) => key(entry.name) === key(item.name) && key(entry.unit) === key(item.unit),
        );
        return (
          '<label class="minimum-row"><span>' +
          esc(item.name) +
          " · " +
          esc(item.unit) +
          '</span><input type="number" inputmode="decimal" min="0" max="999999" step=".001" placeholder="ไม่ตั้ง" value="' +
          esc(level?.qty ?? "") +
          '" data-min-name="' +
          esc(item.name) +
          '" data-min-unit="' +
          esc(item.unit) +
          '"></label>'
        );
      })
      .join("") || '<p class="form-help">เพิ่มของชิ้นแรกก่อนตั้งจำนวนขั้นต่ำ</p>'
  );
}

function lowStockSection() {
  const needs = (stock.minLevels || [])
    .map((level) => {
      const remaining = round(
        stock.items
          .filter(
            (item) => key(item.name) === key(level.name) && key(item.unit) === key(level.unit),
          )
          .reduce((sum, item) => sum + item.qty, 0),
      );
      return { ...level, remaining, missing: round(level.qty - remaining) };
    })
    .filter((item) => item.missing > 0);
  if (!needs.length) return "";
  return (
    '<section class="low-stock"><h2>ใกล้หมด · ควรซื้อเพิ่ม</h2>' +
    needs
      .map(
        (item) =>
          '<div class="low-stock-row"><span>' +
          esc(item.name) +
          " เหลือ " +
          amountFormat.format(item.remaining) +
          " " +
          esc(item.unit) +
          " จากขั้นต่ำ " +
          amountFormat.format(item.qty) +
          "</span>" +
          button(
            "buy-low",
            "จดซื้อ " + amountFormat.format(item.missing) + " " + esc(item.unit),
            encodeURIComponent(item.name) + "|" + encodeURIComponent(item.unit),
            "secondary",
          ) +
          "</div>",
      )
      .join("") +
    "</section>"
  );
}

async function loadAlertSettings() {
  try {
    const settings = await request("alerts");
    const select = $("#alert-days");
    if (select) select.value = String(settings.days || 0);
    if (!settings.publicKey && $("#alert-status"))
      $("#alert-status").textContent = "ยังไม่พร้อมใช้งาน กรุณาตั้งค่าเซิร์ฟเวอร์แจ้งเตือน";
  } catch (error) {
    if ($("#alert-status")) $("#alert-status").textContent = errorText(error);
  }
}

async function saveAlertSettings() {
  const status = $("#alert-status");
  const button = document.querySelector('[data-action="save-alerts"]');
  startButtonLoading(button);
  button.disabled = true;
  try {
    const days = Number($("#alert-days").value);
    const hasItemAlerts = (stock?.items || []).some(
      (item) =>
        item.date &&
        ["expiry", "best-before"].includes(item.dateKind) &&
        Number.isInteger(item.notifyBeforeDays),
    );
    if (days || hasItemAlerts) {
      if (!("serviceWorker" in navigator) || !("PushManager" in window))
        throw new Error("อุปกรณ์นี้ยังไม่รองรับการแจ้งเตือนจากเว็บ");
      const settings = await request("alerts");
      if (!settings.publicKey) throw new Error("ระบบแจ้งเตือนยังไม่พร้อม");
      const permission = await Notification.requestPermission();
      if (permission !== "granted") throw new Error("กรุณาอนุญาตการแจ้งเตือนในเบราว์เซอร์");
      const registration = await navigator.serviceWorker.register("/sw.js");
      const bytes = Uint8Array.from(
        atob(settings.publicKey.replace(/-/g, "+").replace(/_/g, "/")),
        (character) => character.charCodeAt(0),
      );
      const subscription =
        (await registration.pushManager.getSubscription()) ||
        (await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: bytes,
        }));
      await post("alerts", { days, subscription: subscription.toJSON() });
      status.textContent = days
        ? "เปิดแจ้งเตือนแล้ว"
        : "ปิดค่าเริ่มต้นแล้ว · รายการที่กำหนดวันเตือนเองยังแจ้งเตือนได้";
    } else {
      const registration =
        "serviceWorker" in navigator && (await navigator.serviceWorker.getRegistration("/"));
      const subscription = registration && (await registration.pushManager.getSubscription());
      await post("alerts", {
        days: 0,
        ...(subscription && { subscription: subscription.toJSON() }),
      });
      await subscription?.unsubscribe();
      status.textContent = "ปิดแจ้งเตือนแล้ว";
    }
  } catch (error) {
    status.textContent = error.message || errorText(error);
  } finally {
    stopButtonLoading(button);
    button.disabled = false;
  }
}

async function testAlert(later = false) {
  const button = document.querySelector(
    '[data-action="test-alert-' + (later ? "later" : "now") + '"]',
  );
  const status = $("#alert-status");
  const seconds = later ? Number($("#alert-test-seconds")?.value) : 0;
  if (later && (!Number.isInteger(seconds) || seconds < 1 || seconds > 3600)) {
    status.textContent = "กรุณาระบุเวลาตั้งแต่ 1 ถึง 3600 วินาที";
    return;
  }
  startButtonLoading(button);
  button.disabled = true;
  try {
    if (
      !("serviceWorker" in navigator) ||
      !("showNotification" in ServiceWorkerRegistration.prototype)
    )
      throw new Error("อุปกรณ์นี้ยังไม่รองรับการแจ้งเตือนจากเว็บ");
    if (!("Notification" in window)) throw new Error("เบราว์เซอร์นี้ไม่รองรับการแจ้งเตือน");
    let permission = Notification.permission;
    if (permission === "default") permission = await Notification.requestPermission();
    if (permission !== "granted") throw new Error("กรุณาอนุญาตการแจ้งเตือนในเบราว์เซอร์");
    const registration = await navigator.serviceWorker.register("/sw.js");
    if (later) {
      status.textContent = "ตั้งเวลาแจ้งเตือนทดสอบในอีก " + seconds + " วินาทีแล้ว";
      setTimeout(
        () =>
          registration
            .showNotification("ทดสอบการแจ้งเตือน", {
              body: "ระบบแจ้งเตือนของใกล้หมดอายุทำงานแล้ว",
              tag: "home-stock-alert-test",
              data: { url: "/" },
            })
            .catch((error) => {
              if ($("#alert-status"))
                $("#alert-status").textContent = error.message || "ส่งการแจ้งเตือนทดสอบไม่สำเร็จ";
            }),
        seconds * 1000,
      );
    } else {
      await registration.showNotification("ทดสอบการแจ้งเตือน", {
        body: "ระบบแจ้งเตือนของใกล้หมดอายุทำงานแล้ว",
        tag: "home-stock-alert-test",
        data: { url: "/" },
      });
      status.textContent = "ส่งการแจ้งเตือนทดสอบแล้ว";
    }
  } catch (error) {
    status.textContent = error.message || errorText(error);
  } finally {
    stopButtonLoading(button);
    button.disabled = false;
  }
}

let photoObserver = null;
function prepareVisiblePhotos() {
  photoObserver?.disconnect();
  const photos = [...$("#content").querySelectorAll('img.thumb[loading="lazy"]')];
  photos.slice(0, 6).forEach((photo) => {
    photo.loading = "eager";
  });
  if (!("IntersectionObserver" in window)) return;
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.loading = "eager";
        observer.unobserve(entry.target);
      }
    },
    { rootMargin: "1400px 0px" },
  );
  photoObserver = observer;
  photos.slice(6).forEach((photo) => observer.observe(photo));
}

function draw() {
  if (!stock) return;
  photoObserver?.disconnect();
  const page = tab();
  $(".tabs")
    .querySelectorAll("[data-tab]")
    .forEach((link) => {
      if (link.dataset.tab === page) link.setAttribute("aria-current", "page");
      else link.removeAttribute("aria-current");
    });
  if (page === "settings") $(".settings-link").setAttribute("aria-current", "page");
  else $(".settings-link").removeAttribute("aria-current");
  const today = new Date();
  const todayKey = calendarDateKey(today.getFullYear(), today.getMonth(), today.getDate());
  lastDrawDay = today.toDateString();
  $("#date-label").textContent = new Intl.DateTimeFormat("th-TH", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(today);
  $("#date-label").hidden = page === "settings";
  $("#screen-title").textContent = titles[page];
  $("#page-add").hidden = page === "settings";
  $("#page-add").innerHTML =
    page === "shopping"
      ? paperPlusLabel("จดรายการซื้อ")
      : page === "meals"
        ? addActionLabel("meal", "วางแผนทำอาหาร")
        : page === "recipes"
          ? addActionLabel("recipe", "เพิ่มเมนู")
          : addActionLabel("stock", "เพิ่มของ");
  $("#page-add").dataset.action =
    page === "shopping"
      ? "new-shopping"
      : page === "meals"
        ? "add-meal-plan"
        : page === "recipes"
          ? "add-recipe"
          : "add";
  if (page === "meals") $("#page-add").dataset.id = selectedCalendarDate || todayKey;
  else delete $("#page-add").dataset.id;
  $("#shopping-count").textContent = stock.shopping.length;
  $("#tools").hidden = page !== "stock";
  if (page === "settings") {
    $("#content").innerHTML = settingsContent();
    loadAlertSettings();
    return;
  }
  const sorted = [...stock.items].sort(byDate);
  let html = "";
  if (page === "today") {
    const expiring = sorted.filter((item) => ["expiry", "best-before"].includes(item.dateKind));
    const late = sorted.filter(
      (i) => ["expiry", "best-before"].includes(i.dateKind) && daysLeft(i.date) < 0,
    );
    const nearSoon = expiring.filter(
      (item) =>
        Number.isInteger(item.notifyBeforeDays) &&
        daysLeft(item.date) >= 0 &&
        daysLeft(item.date) <= item.notifyBeforeDays,
    );
    const nearSoonIds = new Set(nearSoon.map((item) => item.id));
    const due = sorted.filter(
      (i) =>
        ["expiry", "best-before"].includes(i.dateKind) &&
        daysLeft(i.date) >= 0 &&
        daysLeft(i.date) <= 7 &&
        !nearSoonIds.has(i.id),
    );
    const planned = sorted.filter((i) => i.dateKind === "plan" && daysLeft(i.date) <= 7);
    const upcoming = [...late, ...nearSoon, ...due, ...planned];
    if (upcoming.length) html += section("ของที่ต้องติดตาม", upcoming, { dashboardDue: true });
    if (!html)
      html = sorted.length
        ? empty(
            "สัปดาห์นี้ยังไม่มีของถึงกำหนด",
            "ดูวันและจำนวนที่เหลือของแต่ละรายการได้ในหน้าของในบ้าน",
            "open-stock",
            "ดูของในบ้าน",
          )
        : empty(
            "เริ่มจากของชิ้นแรกในบ้าน",
            "จดชื่อและจำนวน แล้วใส่วันที่ถ้าอยากให้ขึ้นในหน้าวันนี้",
            "add",
            "เพิ่มของชิ้นแรก",
          );
    html = lowStockSection() + html;
    html += expiryCalendar(sorted, stock.mealPlans || []);
  } else if (page === "stock") {
    const roomsSelect = $("#location-filter"),
      selected = roomsSelect.value;
    const locations = [...new Set(sorted.map((i) => i.location).filter(Boolean))].sort((a, b) =>
      a.localeCompare(b, "th"),
    );
    roomsSelect.innerHTML =
      '<option value="">ทุกที่เก็บ</option>' +
      locations.map((x) => "<option>" + esc(x) + "</option>").join("");
    if (locations.includes(selected)) roomsSelect.value = selected;
    refreshSearchSelect(roomsSelect);
    const hasActiveFilters = Boolean(
      $("#query").value.trim() ||
      $("#category-filter").value ||
      roomsSelect.value ||
      $("#sort-filter").value !== "date-asc" ||
      $("#group-filter").value !== "none",
    );
    $("#clear-filter-button").hidden = !hasActiveFilters;
    $("#tools").classList.toggle("has-active-filters", hasActiveFilters);
    const query = key($("#query").value);
    const filtered = sorted.filter(
      (i) =>
        (!query || key(i.name + " " + i.location).includes(query)) &&
        (!$("#category-filter").value || i.category === $("#category-filter").value) &&
        (!roomsSelect.value || i.location === roomsSelect.value),
    );
    const grouped = new Map();
    for (const item of filtered) {
      const groupKey = key(item.name) + "\u0000" + key(item.unit);
      if (!grouped.has(groupKey)) grouped.set(groupKey, []);
      grouped.get(groupKey).push(item);
    }
    if (filtered.length) {
      if ($("#query").value && grouped.size === 1 && filtered.length > 1) {
        html +=
          '<p class="stock-total">' +
          esc(filtered[0].name) +
          " รวม " +
          esc(amountFormat.format(filtered.reduce((sum, i) => sum + i.qty, 0))) +
          " " +
          esc(filtered[0].unit) +
          "</p>";
      }
      const ordered = sortStockItems(filtered, $("#sort-filter").value);
      const groupBy = $("#group-filter").value;
      if (groupBy === "none") {
        html += section("เรียงตาม" + $("#sort-filter").selectedOptions[0].textContent, ordered);
      } else {
        const groups = new Map();
        for (const item of ordered) {
          const label = groupBy === "category" ? item.category : item.location || "ไม่ระบุที่เก็บ";
          if (!groups.has(label)) groups.set(label, []);
          groups.get(label).push(item);
        }
        for (const label of [...groups.keys()].sort((a, b) => a.localeCompare(b, "th")))
          html += section(label, groups.get(label));
      }
    } else
      html = sorted.length
        ? empty("ไม่พบของที่ตรงกัน", "ลองเปลี่ยนชื่อ หมวด หรือที่เก็บ", "clear-filter", "ล้างตัวกรอง")
        : empty("ยังไม่มีของในบ้าน", "เพิ่มของสด ของแห้ง หรือของใช้อื่น ๆ ที่ต้องการติดตาม", "add", "เพิ่มของชิ้นแรก");
  } else if (page === "meals") {
    const plannedPlans = (stock.mealPlans || [])
      .filter((plan) => plan.status === "planned")
      .sort((a, b) => a.date.localeCompare(b.date));
    const cookedPlans = (stock.mealPlans || [])
      .filter((plan) => plan.status !== "planned")
      .sort((a, b) => b.date.localeCompare(a.date));
    html += mealCollectionSection(
      "แผนทำอาหาร",
      [...plannedPlans, ...cookedPlans],
      "ยังไม่มีแผนทำอาหาร กด “วางแผนทำอาหาร” เพื่อเริ่ม",
      mealPlanListRow,
      "meal-plan-table-list",
    );
  } else if (page === "recipes") {
    const recipes = [...(stock.recipes || [])].sort(
      (a, b) => (b.createdAt || 0) - (a.createdAt || 0),
    );
    html += mealCollectionSection(
      "เมนูที่บันทึกไว้",
      recipes,
      "ยังไม่มีเมนูที่บันทึกไว้ วางแผนเมนูแล้วเลือกบันทึกเป็นสูตรต้นแบบได้",
      mealRecipeCard,
    );
  } else {
    html = stock.shopping.length
      ? section("ของที่จะซื้อ", stock.shopping, { shopping: true })
      : empty(
          "รายการซื้อยังว่างอยู่",
          "จดสิ่งที่ต้องการซื้อ แล้วกด “ซื้อแล้ว” เพื่อนำเข้าของในบ้าน",
          "new-shopping",
          "จดรายการแรก",
        );
  }
  if (["today", "stock"].includes(page) && stock.items.length) html = itemViewToggle(page) + html;
  $("#content").innerHTML = html;
  prepareVisiblePhotos();
}

function opts(values, selected) {
  return values
    .map(
      (v) =>
        '<option value="' +
        esc(v) +
        '"' +
        (v === selected ? " selected" : "") +
        ">" +
        esc(v) +
        "</option>",
    )
    .join("");
}
let selectId = 0;
const openSearchDropdowns = new Set();
document.addEventListener("pointerdown", (event) => {
  const activeRoot = document.activeElement?.closest?.("[data-search-select-root]");
  if (activeRoot && !activeRoot.contains(event.target)) {
    activeRoot.closeSearchDropdown();
    document.activeElement.blur();
  }
  for (const root of [...openSearchDropdowns]) {
    if (!root.contains(event.target)) root.closeSearchDropdown();
  }
});

function enhanceSelect(select) {
  if (select.dataset.searchSelect === "true") return;
  select.dataset.searchSelect = "true";
  select.setAttribute("autocomplete", "off");
  const label = select.closest("label");
  const labelName =
    label?.querySelector(":scope > span")?.textContent.trim() ||
    [...(label?.childNodes || [])]
      .find((node) => node.nodeType === Node.TEXT_NODE && node.textContent.trim())
      ?.textContent.trim() ||
    "ตัวเลือก";
  const listId = "search-select-list-" + ++selectId;
  const root = document.createElement("div");
  root.className = "search-select";
  root.dataset.searchSelectRoot = "";
  select.classList.add("search-select-native");
  select.hidden = true;

  const input = document.createElement("input");
  input.type = "search";
  input.className = "search-select-input";
  input.autocomplete = "off";
  input.setAttribute("role", "combobox");
  input.setAttribute("aria-autocomplete", "list");
  input.setAttribute("aria-haspopup", "listbox");
  input.setAttribute("aria-expanded", "false");
  input.setAttribute("aria-controls", listId);
  input.setAttribute("aria-label", "ค้นหา" + labelName);

  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.className = "search-select-toggle";
  toggle.setAttribute("aria-label", "เปิดตัวเลือก " + labelName);
  toggle.setAttribute("aria-expanded", "false");
  toggle.innerHTML = '<span class="search-select-chevron" aria-hidden="true"></span>';

  const panel = document.createElement("div");
  panel.className = "search-select-panel";
  panel.hidden = true;
  const list = document.createElement("div");
  list.id = listId;
  list.className = "search-select-options";
  list.setAttribute("role", "listbox");
  panel.append(list);

  select.replaceWith(root);
  root.append(select, input, toggle, panel);

  let open = false;
  let activeIndex = -1;
  let visibleOptions = [];

  function renderOptions(query = "") {
    const normalized = key(query);
    const badgeType =
      select.id === "category-filter" ||
      select.id === "f-category" ||
      (select.dataset.field === "category" && select.closest(".receipt-row"))
        ? "category"
        : select.id === "location-filter"
          ? "location"
          : null;
    visibleOptions = [...select.options].filter((option) =>
      key(option.textContent).includes(normalized),
    );
    activeIndex = -1;
    list.innerHTML = visibleOptions.length
      ? visibleOptions
          .map(
            (option, index) =>
              '<div class="search-select-option" id="' +
              listId +
              "-" +
              index +
              '" role="option" data-index="' +
              index +
              '" aria-selected="' +
              (option.value === select.value) +
              '">' +
              (badgeType ? valueBadge(option.textContent, badgeType) : esc(option.textContent)) +
              "</div>",
          )
          .join("")
      : '<div class="search-select-empty">ไม่พบตัวเลือก</div>';
  }

  function refresh() {
    if (open) renderOptions(input.value);
    else input.value = select.selectedOptions[0]?.textContent || "";
  }

  function close() {
    open = false;
    openSearchDropdowns.delete(root);
    root.classList.remove("search-select-focused");
    panel.hidden = true;
    input.setAttribute("aria-expanded", "false");
    input.removeAttribute("aria-activedescendant");
    toggle.setAttribute("aria-expanded", "false");
    input.value = select.selectedOptions[0]?.textContent || "";
  }
  root.closeSearchDropdown = close;

  function show() {
    if (open) return;
    open = true;
    openSearchDropdowns.add(root);
    panel.hidden = false;
    input.value = "";
    input.setAttribute("aria-expanded", "true");
    toggle.setAttribute("aria-expanded", "true");
    renderOptions();
  }

  function activate(index) {
    if (!visibleOptions.length) return;
    activeIndex = Math.max(0, Math.min(index, visibleOptions.length - 1));
    const options = list.querySelectorAll('[role="option"]');
    options.forEach((option, optionIndex) => {
      option.dataset.active = String(optionIndex === activeIndex);
    });
    const active = options[activeIndex];
    input.setAttribute("aria-activedescendant", active.id);
    active.scrollIntoView({ block: "nearest" });
  }

  function choose(index) {
    const option = visibleOptions[index];
    if (!option) return;
    select.value = option.value;
    close();
    input.blur();
    select.dispatchEvent(new Event("change", { bubbles: true }));
  }

  input.addEventListener("focus", () => {
    root.classList.add("search-select-focused");
    show();
  });
  input.addEventListener("click", show);
  input.addEventListener("blur", (event) => {
    if (!root.contains(event.relatedTarget)) root.classList.remove("search-select-focused");
    if (event.relatedTarget !== toggle) close();
  });
  toggle.addEventListener("focus", () => root.classList.add("search-select-focused"));
  toggle.addEventListener("blur", () => {
    if (!root.contains(document.activeElement)) root.classList.remove("search-select-focused");
  });
  input.addEventListener("input", () => renderOptions(input.value));
  input.addEventListener("keydown", (event) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (!open) show();
      activate(activeIndex + 1);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      if (!open) show();
      activate(activeIndex < 0 ? visibleOptions.length - 1 : activeIndex - 1);
    } else if (event.key === "Home" && open) {
      event.preventDefault();
      activate(0);
    } else if (event.key === "End" && open) {
      event.preventDefault();
      activate(visibleOptions.length - 1);
    } else if (event.key === "Enter" && open) {
      event.preventDefault();
      choose(activeIndex < 0 ? 0 : activeIndex);
    } else if (event.key === "Escape" && open) {
      event.preventDefault();
      close();
    } else if (event.key === "Tab" && open) close();
  });
  let toggleShouldClose = false;
  toggle.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    toggleShouldClose = open;
    input.blur();
  });
  toggle.addEventListener("click", () => {
    if (toggleShouldClose || open) close();
    else show();
    toggleShouldClose = false;
  });
  toggle.addEventListener("keydown", (event) => {
    if (!open || (event.key !== "ArrowDown" && event.key !== "ArrowUp")) return;
    event.preventDefault();
    input.focus();
    activate(event.key === "ArrowDown" ? 0 : visibleOptions.length - 1);
  });
  list.addEventListener("pointerdown", (event) => {
    if (event.target.closest('[role="option"]')) event.preventDefault();
  });
  list.addEventListener("click", (event) => {
    const option = event.target.closest('[role="option"]');
    if (option) {
      event.preventDefault();
      choose(Number(option.dataset.index));
    }
  });
  select.addEventListener("change", refresh);
  root.refreshSearchSelect = refresh;
  refresh();
}

function enhanceSelects(container) {
  container.querySelectorAll("select").forEach(enhanceSelect);
}

function enhanceDatalist(input) {
  if (input.dataset.searchList === "true" || !input.list) return;
  const datalist = input.list;
  const options = [...new Set([...datalist.options].map((option) => option.value))];
  if (!options.length) return;
  input.dataset.searchList = "true";
  input.removeAttribute("list");
  input.setAttribute("autocomplete", "off");
  const label = input.closest("label");
  const labelName =
    label?.querySelector(":scope > span")?.textContent.trim() ||
    [...(label?.childNodes || [])]
      .find((node) => node.nodeType === Node.TEXT_NODE && node.textContent.trim())
      ?.textContent.trim() ||
    "ตัวเลือก";
  const listId = "search-suggestions-" + ++selectId;
  const root = document.createElement("div");
  root.className = "search-select search-autocomplete";
  root.dataset.searchSelectRoot = "";
  input.classList.add("search-select-input");
  input.setAttribute("role", "combobox");
  input.setAttribute("aria-autocomplete", "list");
  input.setAttribute("aria-haspopup", "listbox");
  input.setAttribute("aria-expanded", "false");
  input.setAttribute("aria-controls", listId);
  input.setAttribute("aria-label", "ค้นหา" + labelName);

  const edit = document.createElement("button");
  edit.type = "button";
  edit.className = "search-select-edit";
  edit.setAttribute("aria-label", "แก้ไข" + labelName);
  edit.innerHTML =
    '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>';
  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.className = "search-select-toggle";
  toggle.setAttribute("aria-label", "แสดงคำแนะนำ " + labelName);
  toggle.setAttribute("aria-expanded", "false");
  toggle.innerHTML = '<span class="search-select-chevron" aria-hidden="true"></span>';
  const panel = document.createElement("div");
  panel.className = "search-select-panel";
  panel.hidden = true;
  const list = document.createElement("div");
  list.id = listId;
  list.className = "search-select-options";
  list.setAttribute("role", "listbox");
  panel.append(list);

  input.replaceWith(root);
  root.append(input, edit, toggle, panel);
  datalist.remove();
  let open = false;
  let activeIndex = -1;
  let visibleOptions = [];
  let focusValue = "";
  let focusValueChanged = false;
  let focusSession = false;

  function renderOptions(query = input.value) {
    const normalized = key(query);
    const badgeType =
      input.id === "f-location" ||
      (input.dataset.field === "location" && input.closest(".receipt-row"))
        ? "location"
        : null;
    visibleOptions = options.filter((option) => key(option).includes(normalized));
    activeIndex = -1;
    list.innerHTML = visibleOptions.length
      ? visibleOptions
          .map(
            (option, index) =>
              '<div class="search-select-option" id="' +
              listId +
              "-" +
              index +
              '" role="option" data-index="' +
              index +
              '" aria-selected="' +
              (option === input.value) +
              '">' +
              (badgeType ? valueBadge(option, badgeType) : esc(option)) +
              "</div>",
          )
          .join("")
      : '<div class="search-select-empty">ไม่พบคำแนะนำ</div>';
    if (!visibleOptions.length) close();
  }

  function close() {
    open = false;
    openSearchDropdowns.delete(root);
    if (focusSession) {
      if (!focusValueChanged) input.value = focusValue;
      focusSession = false;
      focusValueChanged = false;
    }
    root.classList.remove("search-select-focused");
    panel.hidden = true;
    input.setAttribute("aria-expanded", "false");
    input.removeAttribute("aria-activedescendant");
    toggle.setAttribute("aria-expanded", "false");
  }
  root.closeSearchDropdown = close;

  function show() {
    if (open) return;
    open = true;
    openSearchDropdowns.add(root);
    panel.hidden = false;
    input.setAttribute("aria-expanded", "true");
    toggle.setAttribute("aria-expanded", "true");
    renderOptions();
  }

  function beginFocusSession() {
    if (focusSession) return;
    focusSession = true;
    focusValue = input.value;
    focusValueChanged = false;
    input.value = "";
  }

  function activate(index) {
    if (!visibleOptions.length) return;
    activeIndex = Math.max(0, Math.min(index, visibleOptions.length - 1));
    const choices = list.querySelectorAll('[role="option"]');
    choices.forEach((choice, choiceIndex) => {
      choice.dataset.active = String(choiceIndex === activeIndex);
    });
    const active = choices[activeIndex];
    input.setAttribute("aria-activedescendant", active.id);
    active.scrollIntoView({ block: "nearest" });
  }

  function choose(index) {
    const option = visibleOptions[index];
    if (option === undefined) return;
    input.value = option;
    focusValueChanged = true;
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
    close();
    input.blur();
  }

  input.addEventListener("focus", () => {
    beginFocusSession();
    root.classList.add("search-select-focused");
    show();
  });
  input.addEventListener("click", show);
  input.addEventListener("blur", () => {
    root.classList.remove("search-select-focused");
    close();
  });
  toggle.addEventListener("focus", () => root.classList.add("search-select-focused"));
  toggle.addEventListener("blur", () => {
    if (!root.contains(document.activeElement)) root.classList.remove("search-select-focused");
  });
  edit.addEventListener("focus", () => root.classList.add("search-select-focused"));
  edit.addEventListener("blur", () => {
    if (!root.contains(document.activeElement)) root.classList.remove("search-select-focused");
  });
  input.addEventListener("input", () => {
    if (focusSession) focusValueChanged = true;
    if (!open) show();
    renderOptions(input.value);
  });
  input.addEventListener("keydown", (event) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (!open) show();
      activate(activeIndex + 1);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      if (!open) show();
      activate(activeIndex < 0 ? visibleOptions.length - 1 : activeIndex - 1);
    } else if (event.key === "Home" && open) {
      event.preventDefault();
      activate(0);
    } else if (event.key === "End" && open) {
      event.preventDefault();
      activate(visibleOptions.length - 1);
    } else if (event.key === "Enter" && open && activeIndex >= 0) {
      event.preventDefault();
      choose(activeIndex);
    } else if (event.key === "Escape" && open) {
      event.preventDefault();
      close();
    } else if (event.key === "Tab" && open) close();
  });
  let toggleShouldClose = false;
  toggle.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    toggleShouldClose = open;
    input.blur();
  });
  toggle.addEventListener("click", () => {
    if (toggleShouldClose || open) close();
    else {
      beginFocusSession();
      show();
    }
    toggleShouldClose = false;
  });
  edit.addEventListener("pointerdown", (event) => event.preventDefault());
  edit.addEventListener("click", () => {
    focusSession = true;
    focusValue = input.value;
    focusValueChanged = false;
    input.focus();
    show();
    const end = input.value.length;
    input.setSelectionRange(end, end);
  });
  list.addEventListener("pointerdown", (event) => {
    if (event.target.closest('[role="option"]')) event.preventDefault();
  });
  list.addEventListener("click", (event) => {
    const option = event.target.closest('[role="option"]');
    if (option) {
      event.preventDefault();
      choose(Number(option.dataset.index));
    }
  });
}

function enhanceDatalists(container) {
  container.querySelectorAll("input[list]").forEach(enhanceDatalist);
}

function refreshSearchSelect(select) {
  select.closest("[data-search-select-root]")?.refreshSearchSelect();
}

enhanceSelects(document);

function editorFields(data, isShopping) {
  const names = [...new Set([...(stock.recentItems || []), ...stock.items].map((i) => i.name))];
  const base =
    '<label class="span">ชื่อของ<input required id="f-name" maxlength="80" list="known-names" value="' +
    esc(data.name) +
    '"><datalist id="known-names">' +
    opts(names) +
    "</datalist></label>" +
    '<label>จำนวน<input required id="f-qty" type="number" inputmode="decimal" min=".001" max="999999" step=".001" value="' +
    esc(data.qty) +
    '"></label>' +
    '<label>หน่วย<input required id="f-unit" maxlength="20" list="units" value="' +
    esc(data.unit) +
    '"><datalist id="units">' +
    opts(["ชิ้น", "กล่อง", "ถุง", "ฟอง", "ขวด", "แพ็ก", "กก.", "ลิตร"]) +
    "</datalist></label>";
  if (isShopping) return '<div class="form-grid">' + base + "</div>";
  return (
    '<div class="form-grid">' +
    base +
    '<label>หมวด<select id="f-category">' +
    opts(categories, data.category) +
    "</select></label>" +
    '<label>ที่เก็บ<input id="f-location" autocomplete="off" maxlength="60" list="rooms" value="' +
    esc(data.location) +
    '"><datalist id="rooms">' +
    opts([...new Set([...rooms, ...stock.items.map((i) => i.location).filter(Boolean)])]) +
    "</datalist></label>" +
    '<div class="span photo-edit"><label>รูปภาพ (ถ้ามี)<input type="file" id="f-photo" accept="image/*"></label><div id="photo-preview"></div></div>' +
    '<div class="span barcode-field"><label for="f-barcode">บาร์โค้ดสินค้า (ถ้ามี)</label>' +
    '<div class="barcode-input-row"><input id="f-barcode" inputmode="numeric" pattern="[0-9]{8,14}" maxlength="14" value="' +
    esc(data.barcode || "") +
    '">' +
    '<button type="button" class="secondary" data-action="scan-barcode">สแกน</button></div>' +
    '<p id="barcode-hint" class="form-help" role="status"></p>' +
    '<div id="barcode-scanner" class="barcode-scanner" hidden><video id="barcode-video" autoplay muted playsinline></video>' +
    '<div class="barcode-camera-controls"><label for="barcode-zoom">ซูม</label><input id="barcode-zoom" type="range" min="1" max="1" step="0.1" value="1" disabled>' +
    '<button type="button" id="barcode-torch" class="secondary" data-action="toggle-barcode-torch" hidden>เปิดไฟฉาย</button>' +
    '<button type="button" class="secondary" data-action="stop-barcode">ปิดกล้อง</button></div></div></div>' +
    '<label class="span">วันที่รับเข้า<span class="date-control"><span class="date-display" aria-hidden="true">' +
    esc(dateInputLabel(data.receivedDate || "")) +
    '</span><input id="f-received-date" type="date" value="' +
    esc(data.receivedDate || "") +
    '"></span></label>' +
    '<div class="span shelf-life-suggestion"><button type="button" id="apply-shelf-life-suggestion" class="secondary" data-action="apply-shelf-life-suggestion" hidden></button><p class="form-help">วันที่แนะนำเป็นค่าประมาณจากชนิดอาหารและที่เก็บ ตรวจสภาพอาหารก่อนใช้เสมอ</p></div>' +
    '<label>ติดตามวันที่<select id="f-kind"><option value="expiry"' +
    (data.dateKind === "expiry" ? " selected" : "") +
    '>(EXP : วันหมดอายุ)</option><option value="best-before"' +
    (data.dateKind === "best-before" ? " selected" : "") +
    '>(BBE : ควรบริโภคก่อน)</option><option value="plan"' +
    (data.dateKind === "plan" ? " selected" : "") +
    ">ตั้งใจใช้ภายใน</option></select></label>" +
    '<label>วันที่ (ถ้ามี)<span class="date-control"><span class="date-display" aria-hidden="true">' +
    esc(dateInputLabel(data.date)) +
    '</span><input id="f-date" type="date" value="' +
    esc(data.date) +
    '"></span></label>' +
    '<label class="span">แจ้งเตือนก่อนกำหนดภายใน (วัน)<input id="f-notify-before-days" type="number" inputmode="numeric" min="0" max="365" step="1" placeholder="ใช้ค่าเริ่มต้นจาก Settings" value="' +
    esc(data.notifyBeforeDays ?? "") +
    '"><span class="form-help">เว้นว่างเพื่อใช้ค่าเริ่มต้นจาก Settings · ใส่ 0 เพื่อเตือนในวันที่กำหนด · ใช้กับ EXP/BBE และต้องตั้งค่าการแจ้งเตือนใน Settings บนอุปกรณ์นี้</span></label></div>'
  );
}

function mealIngredientRow(item = {}) {
  const rowId = item.id || crypto.randomUUID();
  const names = [...new Set(stock.items.map((entry) => entry.name))];
  const nameList = "meal-name-options-" + rowId;
  const matches = stockMatchesForName(item.name || "");
  const locked = matches.length > 0;
  const matchForUnit = item.unit
    ? matches.find((entry) => key(entry.unit) === key(item.unit))
    : null;
  const match = matchForUnit || matches[0];
  const unit = locked ? match.unit : item.unit || "ชิ้น";
  const stockQty = locked ? match.qty : 0;
  const qty = item.qty ?? 1;
  return (
    '<div class="meal-ingredient-row" data-ingredient-id="' +
    esc(rowId) +
    '" data-locked="' +
    (locked ? "1" : "0") +
    '" data-stock-unit="' +
    esc(unit) +
    '" data-stock-qty="' +
    stockQty +
    '"><label>วัตถุดิบ<input class="meal-ingredient-name" required autocomplete="off" maxlength="80" list="' +
    nameList +
    '" value="' +
    esc(item.name || "") +
    '"></label><datalist id="' +
    nameList +
    '">' +
    opts(names) +
    '</datalist><label>จำนวน<input class="meal-ingredient-qty" required type="number" inputmode="decimal" min=".001" max="999999" step=".001" value="' +
    esc(qty) +
    '"></label><label>หน่วย<span class="meal-ingredient-unit-field">' +
    ingredientUnitFieldHtml(rowId, unit, locked) +
    "</span></label>" +
    '<div class="meal-ingredient-actions">' +
    '<p class="meal-ingredient-hint">' +
    ingredientHintHtml(locked, stockQty, qty, unit) +
    "</p>" +
    '<button type="button" class="meal-remove-ingredient text-button danger" data-action="remove-meal-ingredient" aria-label="ลบวัตถุดิบ">' +
    '<svg class="trash-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="3" y1="6" x2="21" y2="6"></line><path d="M19 6l-1 14H6L5 6"></path><path d="M10 11v6"></path><path d="M14 11v6"></path><path d="M9 6V4h6v2"></path></svg>' +
    "<span>ลบ</span>" +
    "</button>" +
    "</div></div>"
  );
}

function mealEditorFields(plan, defaultDate, selectedRecipeId = "") {
  const recipes = stock.recipes || [];
  const templateId = plan?.recipeId || selectedRecipeId;
  const sourceRecipe = recipes.find((recipe) => recipe.id === templateId);
  const ingredients = plan?.ingredients || sourceRecipe?.ingredients || [{}];
  const name = plan?.name || sourceRecipe?.name || "";
  const servings = plan?.servings || sourceRecipe?.servings || 2;
  const templateOptions = recipes
    .map(
      (recipe) =>
        '<option value="' +
        esc(recipe.id) +
        '"' +
        (recipe.id === templateId ? " selected" : "") +
        ">" +
        esc(recipe.name) +
        "</option>",
    )
    .join("");
  const templateSaveLabel = templateId ? "อัปเดตเมนูต้นแบบด้วย" : "บันทึกเมนูนี้ไว้ใช้ครั้งต่อไป";
  return (
    '<div class="form-grid"><label class="span">เริ่มจากเมนูที่บันทึกไว้<select id="meal-template"><option value="">สร้างแผนใหม่</option>' +
    templateOptions +
    '</select></label><label class="span">ชื่อเมนู<input required id="meal-name" maxlength="80" value="' +
    esc(name) +
    '"></label><label class="span">วันที่ทำเมนู<span class="date-control"><span class="date-display" aria-hidden="true">' +
    esc(dateInputLabel(plan?.date || defaultDate)) +
    '</span><input required id="meal-date" type="date" value="' +
    esc(plan?.date || defaultDate) +
    '"></span></label><label>จำนวนเสิร์ฟ<input required id="meal-servings" type="number" min="1" max="100" step="1" value="' +
    servings +
    '"></label><div class="span"><div class="section-head"><h3>วัตถุดิบ</h3></div><div class="meal-ingredient-list" id="meal-ingredients">' +
    ingredients.map(mealIngredientRow).join("") +
    '</div><button type="button" class="secondary meal-add-ingredient" data-action="add-meal-ingredient">' +
    addActionLabel("ingredient", "เพิ่มวัตถุดิบ") +
    '</button></div><label class="span meal-template-save"><input id="meal-save-template" type="checkbox"><span id="meal-template-save-label">' +
    templateSaveLabel +
    "</span></label></div>"
  );
}

function recipeEditorFields(recipe = null) {
  const ingredients = recipe?.ingredients || [{}];
  return (
    '<div class="form-grid"><label class="span">ชื่อเมนู<input required id="meal-name" maxlength="80" value="' +
    esc(recipe?.name || "") +
    '"></label><label>จำนวนเสิร์ฟ<input required id="meal-servings" type="number" min="1" max="100" step="1" value="' +
    (recipe?.servings || 2) +
    '"></label><div class="span"><div class="section-head"><h3>วัตถุดิบ</h3></div><div class="meal-ingredient-list" id="meal-ingredients">' +
    ingredients.map(mealIngredientRow).join("") +
    '</div><button type="button" class="secondary meal-add-ingredient" data-action="add-meal-ingredient">' +
    addActionLabel("ingredient", "เพิ่มวัตถุดิบ") +
    "</button></div></div>"
  );
}

function startRecipeEditor(recipe = null) {
  if (!stock || busy) return;
  mealDraft = {
    mode: "recipe",
    recipeId: recipe?.id || "",
    version: stock.version,
    stale: false,
  };
  $("#meal-editor-title").textContent = recipe ? "แก้ไขเมนู" : "เพิ่มเมนู";
  $("#meal-error").textContent = "";
  $("#meal-save").textContent = "บันทึกเมนู";
  $("#meal-save").disabled = false;
  $("#meal-fields").innerHTML = recipeEditorFields(recipe);
  enhanceDatalists($("#meal-fields"));
  if (!$("#meal-editor").open) $("#meal-editor").showModal();
}

function startMealEditor(plan = null, date = selectedCalendarDate, recipeId = "") {
  if (!stock || busy) return;
  mealDraft = {
    mode: "plan",
    planId: plan?.id || "",
    version: stock.version,
    stale: false,
  };
  const today = new Date();
  const defaultDate =
    date || calendarDateKey(today.getFullYear(), today.getMonth(), today.getDate());
  $("#meal-editor-title").textContent = plan ? "แก้ไขแผนทำอาหาร" : "วางแผนทำอาหาร";
  $("#meal-error").textContent = "";
  $("#meal-save").textContent = plan ? "บันทึกแผน" : "วางแผน";
  $("#meal-save").disabled = false;
  $("#meal-fields").innerHTML = mealEditorFields(plan, defaultDate, recipeId);
  enhanceSelects($("#meal-fields"));
  enhanceDatalists($("#meal-fields"));
  if (!$("#meal-editor").open) $("#meal-editor").showModal();
}

function mealFormIngredients() {
  const rows = [...$("#meal-ingredients").querySelectorAll(".meal-ingredient-row")];
  if (!rows.length) throw new Error("เพิ่มวัตถุดิบอย่างน้อย 1 รายการ");
  return rows.map((row) => {
    const name = row.querySelector(".meal-ingredient-name")?.value.trim();
    const qty = Number(row.querySelector(".meal-ingredient-qty")?.value);
    const unit = row.querySelector(".meal-ingredient-unit")?.value.trim();
    if (!name || !unit || !(qty > 0 && qty <= 999999))
      throw new Error("กรุณาตรวจชื่อ จำนวน และหน่วยของวัตถุดิบ");
    return {
      id: row.dataset.ingredientId || crypto.randomUUID(),
      name,
      qty: round(qty),
      unit,
    };
  });
}

async function mealMutation(change, done) {
  if (busy || !stock || !mealDraft) return;
  busy = true;
  ++generation;
  const loadingButton = $("#meal-save");
  pendingActionButton = null;
  startButtonLoading(loadingButton);
  loadingButton.disabled = true;
  try {
    if (stock.version !== mealDraft.version) throw new ApiError(409, "");
    const next = structuredClone(stock);
    await change(next);
    const result = await post("stock", next);
    next.version = result.version;
    stock = next;
    if ($("#meal-editor").open) $("#meal-editor").close();
    draw();
    if (done) done();
  } catch (error) {
    if (error.status === 401) {
      entry("login", errorText(error));
      return;
    }
    const conflict = error.status === 409;
    const message = conflict
      ? "ข้อมูลเปลี่ยนจากอีกอุปกรณ์ กรุณาโหลดแล้วแก้แผนใหม่"
      : error instanceof ApiError
        ? errorText(error)
        : error.message || "บันทึกแผนไม่ได้";
    if (conflict || error.status === 0 || error.status >= 500) await refresh(true);
    if ($("#meal-editor").open) {
      $("#meal-error").textContent = message;
      if (conflict) mealDraft.stale = true;
    } else if (stock) alertUser(message);
  } finally {
    busy = false;
    stopButtonLoading(loadingButton);
    if ($("#meal-editor").open) $("#meal-save").disabled = Boolean(mealDraft?.stale);
  }
}

$("#meal-fields").addEventListener("change", (event) => {
  if (event.target.id !== "meal-template") return;
  const recipe = stock.recipes?.find((item) => item.id === event.target.value);
  if (!recipe) {
    $("#meal-template-save-label").textContent = "บันทึกเมนูนี้ไว้ใช้ครั้งต่อไป";
    return;
  }
  $("#meal-name").value = recipe.name;
  $("#meal-servings").value = recipe.servings;
  $("#meal-ingredients").innerHTML = recipe.ingredients.map(mealIngredientRow).join("");
  $("#meal-save-template").checked = false;
  $("#meal-template-save-label").textContent = "อัปเดตเมนูต้นแบบด้วย";
  enhanceDatalists($("#meal-ingredients"));
});

$("#meal-fields").addEventListener("input", (event) => {
  const row = event.target.closest(".meal-ingredient-row");
  if (!row) return;
  if (event.target.classList.contains("meal-ingredient-name")) return refreshIngredientRow(row);
  if (event.target.classList.contains("meal-ingredient-qty")) return updateIngredientHint(row);
});

$("#meal-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!mealDraft || mealDraft.stale || busy) return;
  pendingActionButton = event.submitter;
  $("#meal-error").textContent = "";
  let ingredients;
  try {
    ingredients = mealFormIngredients();
  } catch (error) {
    $("#meal-error").textContent = error.message;
    return;
  }
  const name = $("#meal-name").value.trim();
  const servings = Number($("#meal-servings").value);
  if (mealDraft.mode === "recipe") {
    if (!name || !Number.isInteger(servings) || servings < 1 || servings > 100) {
      $("#meal-error").textContent = "กรุณาตรวจชื่อเมนูและจำนวนเสิร์ฟ (1-100)";
      return;
    }
    await mealMutation(
      (next) => {
        next.recipes ||= [];
        const current = next.recipes.find((recipe) => recipe.id === mealDraft.recipeId);
        const recipe = {
          id: mealDraft.recipeId || crypto.randomUUID(),
          name,
          servings,
          ingredients,
          createdAt: current?.createdAt || Date.now(),
        };
        if (current) Object.assign(current, recipe);
        else next.recipes.push(recipe);
      },
      () => alertUser("บันทึกเมนูแล้ว"),
    );
    return;
  }
  const date = $("#meal-date").value;
  const selectedRecipeId = $("#meal-template").value || null;
  const saveTemplate = $("#meal-save-template").checked;
  if (!name || !date || !Number.isInteger(servings) || servings < 1 || servings > 100) {
    $("#meal-error").textContent = "กรุณาตรวจชื่อเมนู วันที่ และจำนวนเสิร์ฟ";
    return;
  }
  await mealMutation(
    (next) => {
      next.recipes ||= [];
      next.mealPlans ||= [];
      let recipeId = selectedRecipeId;
      if (saveTemplate) {
        if (recipeId) {
          const recipe = next.recipes.find((item) => item.id === recipeId);
          if (recipe)
            Object.assign(recipe, {
              name,
              servings,
              ingredients,
              createdAt: recipe.createdAt || Date.now(),
            });
          else {
            recipeId = crypto.randomUUID();
            next.recipes.push({
              id: recipeId,
              name,
              servings,
              ingredients,
              createdAt: Date.now(),
            });
          }
        } else {
          recipeId = crypto.randomUUID();
          next.recipes.push({
            id: recipeId,
            name,
            servings,
            ingredients,
            createdAt: Date.now(),
          });
        }
      }
      const existing = next.mealPlans.find((item) => item.id === mealDraft.planId);
      const plan = {
        id: mealDraft.planId || crypto.randomUUID(),
        recipeId,
        name,
        date,
        servings,
        status: existing?.status || "planned",
        ingredients,
      };
      const index = next.mealPlans.findIndex((item) => item.id === plan.id);
      if (index < 0) next.mealPlans.push(plan);
      else next.mealPlans[index] = plan;
      selectedCalendarDate = date;
      const planDate = localDay(date);
      calendarYear = planDate.getFullYear();
      calendarMonth = planDate.getMonth();
    },
    () => alertUser("บันทึกแผนทำอาหารแล้ว"),
  );
});

function startEditor(mode, data = {}, sourceId = "") {
  if (!stock || busy) return;
  stopBarcodeScan();
  ++generation;
  if (previewUrl) URL.revokeObjectURL(previewUrl);
  previewUrl = "";
  const today = new Date();
  const base = {
    name: "",
    qty: 1,
    unit: "ชิ้น",
    category: "อื่น ๆ",
    location: mode === "add" ? stock.items[stock.items.length - 1]?.location || "" : "",
    receivedDate: calendarDateKey(today.getFullYear(), today.getMonth(), today.getDate()),
    date: "",
    dateKind: "expiry",
    photo: null,
    barcode: "",
    ...data,
  };
  draft = {
    mode,
    sourceId,
    mealPlanId: base.mealPlanId || "",
    initial: base,
    version: stock.version,
    photo: base.photo,
    icon: base.icon,
    iconColor: base.iconColor || "green",
    iconBackground: base.iconBackground || "mint",
    frozenNameSeen: mode === "edit-item" && key(base.name).includes("แช่แข็ง"),
    freezerLocationManual: false,
    blob: null,
    photoTask: 0,
    processing: false,
  };
  const headings = {
    add: "เพิ่มของเข้าบ้าน",
    "edit-item": "แก้ไขของในบ้าน",
    "new-shopping": "จดรายการซื้อ",
    "edit-shopping": "แก้ไขรายการซื้อ",
    receive: "ซื้อแล้ว · รับของเข้าบ้าน",
    use: "บันทึกจำนวนที่ใช้",
    "remove-item": "เอาของออกจากบ้าน",
    "remove-shopping": "ลบรายการซื้อ",
    "remove-meal-plan": "ลบแผนทำอาหาร",
    "remove-recipe": "ลบเมนูต้นแบบ",
  };
  $("#editor-title").textContent = headings[mode];
  $("#form-error").textContent = "";
  $("#save").textContent =
    mode === "receive"
      ? "รับเข้าบ้าน"
      : mode.startsWith("remove-")
        ? "ยืนยันลบ"
        : mode === "use"
          ? "บันทึกการใช้"
          : "บันทึก";
  let fields;
  if (mode === "remove-meal-plan")
    fields = "<p>ลบแผนทำอาหาร <strong>“" + esc(base.name) + "”</strong> ใช่ไหม</p>";
  else if (mode === "remove-recipe")
    fields = "<p>ลบเมนูต้นแบบ <strong>“" + esc(base.name) + "”</strong> ใช่ไหม</p>";
  else if (mode.startsWith("remove-"))
    fields =
      "<p>ลบ " +
      esc(base.name) +
      " (" +
      esc(amount(base)) +
      ") ออกจาก" +
      (mode === "remove-item" ? "ของในบ้าน" : "รายการซื้อ") +
      "?</p>";
  else if (mode === "use")
    fields =
      "<label>ใช้ " +
      esc(base.name) +
      " ไปกี่" +
      esc(base.unit) +
      '<input id="f-used" required type="number" inputmode="decimal" min=".001" max="' +
      base.qty +
      '" step=".001" value="' +
      Math.min(1, base.qty) +
      '"></label><p class="form-help">คงเหลือ ' +
      esc(amount(base)) +
      "</p>";
  else {
    fields = editorFields(base, mode.includes("shopping"));
    if (mode === "edit-shopping")
      fields +=
        '<div class="row-buttons">' +
        button("confirm-remove", "ลบรายการ", sourceId, "text-button danger") +
        "</div>";
  }
  $("#fields").innerHTML = fields;
  enhanceSelects($("#fields"));
  enhanceDatalists($("#fields"));
  if (!mode.includes("shopping") && !mode.startsWith("remove-") && mode !== "use") {
    selectFreezerForFrozenName();
    refreshShelfLifeSuggestion();
  }
  renderPhoto();
  $("#save").disabled = false;
  if (!$("#editor").open) $("#editor").showModal();
}

function closeEditor() {
  if (!busy && $("#editor").open) $("#editor").close();
}
$("#editor").addEventListener("cancel", (event) => {
  if (busy) event.preventDefault();
});
$("#editor").addEventListener("close", () => {
  stopBarcodeScan();
  stopButtonLoading($("#save"));
  if (previewUrl) URL.revokeObjectURL(previewUrl);
  previewUrl = "";
  draft = null;
});
$("#meal-editor").addEventListener("cancel", (event) => {
  if (busy) event.preventDefault();
});
$("#meal-editor").addEventListener("close", () => {
  mealDraft = null;
});

function initializeDialogSheets() {
  document.querySelectorAll("dialog").forEach((dialog) => {
    const mobile = window.matchMedia("(max-width: 650px)");
    const handle = document.createElement("button");
    handle.type = "button";
    handle.className = "sheet-handle";
    handle.setAttribute("aria-label", "ปิดหน้าต่าง (ลากลงเพื่อปิด)");
    dialog.prepend(handle);
    let gesture = null;
    let suppressClick = false;

    const dismiss = () => {
      if (!dialog.open || busy) return;
      // Use the same cancellation guards and close cleanup as Escape.
      if (dialog.dispatchEvent(new Event("cancel", { cancelable: true }))) dialog.close();
    };
    const reset = () => {
      const active = gesture;
      gesture = null;
      dialog.classList.remove("sheet-dragging");
      dialog.style.removeProperty("--sheet-offset");
      if (active && active.surface.hasPointerCapture(active.id))
        active.surface.releasePointerCapture(active.id);
    };
    const start = (event) => {
      if (!gesture) suppressClick = false;
      if (
        !mobile.matches ||
        !dialog.open ||
        busy ||
        gesture ||
        !event.isPrimary ||
        event.button !== 0 ||
        (event.currentTarget !== handle &&
          event.target.closest("button, input, select, textarea, a"))
      )
        return;
      gesture = {
        id: event.pointerId,
        surface: event.currentTarget,
        x: event.clientX,
        y: event.clientY,
        distance: 0,
      };
      gesture.surface.setPointerCapture(gesture.id);
    };
    const move = (event) => {
      if (!gesture || gesture.id !== event.pointerId) return;
      if (busy || !mobile.matches) return reset();
      const dx = event.clientX - gesture.x;
      const dy = event.clientY - gesture.y;
      if (Math.max(Math.abs(dx), Math.abs(dy)) > 8) suppressClick = true;
      gesture.distance = Math.abs(dy) > Math.abs(dx) ? Math.max(0, dy) : 0;
      dialog.classList.add("sheet-dragging");
      dialog.style.setProperty("--sheet-offset", gesture.distance + "px");
    };
    const finish = (event) => {
      if (!gesture || gesture.id !== event.pointerId) return;
      const threshold = Math.min(120, Math.max(56, dialog.offsetHeight * 0.2));
      const shouldClose = gesture.distance >= threshold;
      reset();
      if (shouldClose) dismiss();
    };
    for (const surface of [handle, dialog.querySelector(".dialog-head")]) {
      if (!surface) continue;
      surface.addEventListener("pointerdown", start);
      surface.addEventListener("pointermove", move);
      surface.addEventListener("pointerup", finish);
      surface.addEventListener("pointercancel", reset);
      surface.addEventListener("lostpointercapture", reset);
      surface.addEventListener("click", (event) => {
        if (suppressClick && event.detail !== 0) {
          event.preventDefault();
          event.stopPropagation();
          suppressClick = false;
        } else if (surface === handle) {
          suppressClick = false;
          dismiss();
        }
      });
    }
    dialog.addEventListener("close", reset);
    mobile.addEventListener("change", reset);
  });
}
initializeDialogSheets();

function renderPhoto() {
  const holder = $("#photo-preview");
  if (!holder) return;
  const src = previewUrl || (draft.photo ? "/api/photo?id=" + encodeURIComponent(draft.photo) : "");
  holder.innerHTML = src
    ? '<img alt="รูปของที่เลือก" src="' +
      esc(src) +
      '">' +
      button("remove-photo", "ลบรูป", "", "text-button")
    : draft.icon
      ? '<span class="thumb placeholder"' +
        itemIconStyle(draft) +
        ">" +
        itemIconSvg(draft.icon, "item-icon", draft.iconColor, draft.iconBackground) +
        "</span>" +
        button("remove-photo", "ลบไอคอน", "", "text-button")
      : "";
}
function renderItemMediaColorOptions() {
  if (!mediaDraft) return;
  const render = (options, selected, action) =>
    Object.entries(options)
      .map(
        ([id, color]) =>
          '<button type="button" class="item-media-color-swatch" data-action="' +
          action +
          '" data-id="' +
          id +
          '" style="--swatch-color:' +
          color.value +
          '" aria-label="' +
          color.label +
          '" title="' +
          color.label +
          '" aria-pressed="' +
          (selected === id) +
          '"></button>',
      )
      .join("");
  $("#item-media-icon-color-options").innerHTML = render(
    itemIconColors,
    mediaDraft.iconColor,
    "select-item-icon-color",
  );
  $("#item-media-icon-bg-options").innerHTML = render(
    itemIconBackgrounds,
    mediaDraft.iconBackground,
    "select-item-icon-background",
  );
  $("#item-media-custom-icon-color").value = iconColorValue(
    mediaDraft.iconColor,
    itemIconColors,
    "green",
  );
  $("#item-media-custom-icon-background").value = iconColorValue(
    mediaDraft.iconBackground,
    itemIconBackgrounds,
    "mint",
  );
}
function renderItemMediaPreview() {
  if (!mediaDraft) return;
  const src =
    mediaDraft.preview ||
    (mediaDraft.photo ? "/api/photo?id=" + encodeURIComponent(mediaDraft.photo) : "");
  $("#item-media-preview").innerHTML = src
    ? '<img alt="รูปของที่เลือก" src="' + esc(src) + '">'
    : '<span class="thumb placeholder"' +
      itemIconStyle(mediaDraft) +
      ">" +
      (itemIconSvg(mediaDraft.icon, "item-icon", mediaDraft.iconColor, mediaDraft.iconBackground) ||
        esc([...mediaDraft.name][0] || "·")) +
      "</span>";
  $("#item-media-icon-colors").hidden = !mediaDraft.icon;
  renderItemMediaColorOptions();
  document.querySelectorAll(".item-media-choice").forEach((choice) => {
    const selected =
      choice.dataset.action === "select-item-photo"
        ? !mediaDraft.blob && mediaDraft.photo === choice.dataset.id
        : choice.dataset.action === "select-item-icon" && mediaDraft.icon === choice.dataset.id;
    choice.setAttribute("aria-pressed", String(selected));
    const icon = choice.querySelector(".item-icon");
    if (icon) {
      icon.style.color = iconColorValue(mediaDraft.iconColor, itemIconColors, "green");
      icon.style.setProperty(
        "--item-icon-bg",
        iconColorValue(mediaDraft.iconBackground, itemIconBackgrounds, "mint"),
      );
    }
  });
  $("#item-media-save").disabled = Boolean(mediaDraft.processing || mediaDraft.stale);
}

function startItemMedia(item, receiptCard = null) {
  if (busy || !stock) return;
  stopBarcodeScan();
  ++generation;
  mediaDraft = {
    id: item.id,
    receiptCard,
    name: item.name,
    version: stock.version,
    photo: item.photo || null,
    icon: item.icon || null,
    iconColor: item.iconColor || "green",
    iconBackground: item.iconBackground || "mint",
    blob: receiptCard ? item.blob || null : null,
    preview: receiptCard && item.blob ? URL.createObjectURL(item.blob) : "",
    task: 0,
    processing: false,
    stale: false,
  };
  $("#item-media-name").textContent = item.name;
  $("#item-media-error").textContent = "";
  $("#item-media-file").value = "";
  const photos = [
    ...new Map(
      stock.items.filter((entry) => entry.photo).map((entry) => [entry.photo, entry]),
    ).values(),
  ];
  $("#item-media-photos").innerHTML = photos.length
    ? photos
        .map((entry) =>
          button(
            "select-item-photo",
            thumb(entry) + "<span>" + esc(entry.name) + "</span>",
            entry.photo,
            "item-media-choice",
          ),
        )
        .join("")
    : '<p class="form-help">ยังไม่มีรูปที่เคยอัปโหลด</p>';
  $("#item-media-icons").innerHTML = Object.entries(itemIcons)
    .map(([id, icon]) =>
      button(
        "select-item-icon",
        itemIconSvg(id, "item-icon", mediaDraft.iconColor, mediaDraft.iconBackground) +
          "<span>" +
          esc(icon.label) +
          "</span>",
        id,
        "item-media-choice",
      ),
    )
    .join("");
  renderItemMediaPreview();
  $("#item-media-dialog").showModal();
}

function selectItemMedia(photo, icon) {
  if (!mediaDraft || mediaDraft.stale) return;
  stopButtonLoading($("#item-media-save"));
  ++mediaDraft.task;
  if (mediaDraft.preview) URL.revokeObjectURL(mediaDraft.preview);
  Object.assign(mediaDraft, {
    photo,
    icon,
    blob: null,
    preview: "",
    processing: false,
    iconColor: icon ? mediaDraft.iconColor || "green" : "green",
    iconBackground: icon ? mediaDraft.iconBackground || "mint" : "mint",
  });
  $("#item-media-file").value = "";
  $("#item-media-error").textContent = "";
  renderItemMediaPreview();
}

$("#item-media-file").addEventListener("change", async (event) => {
  const file = event.target.files[0];
  if (!file || !mediaDraft || busy || mediaDraft.stale) return;
  const editing = mediaDraft,
    token = ++editing.task;
  editing.processing = true;
  startButtonLoading($("#item-media-save"));
  $("#item-media-save").disabled = true;
  $("#item-media-error").textContent = "กำลังเตรียมรูป…";
  try {
    const blob = await jpeg(file);
    if (mediaDraft !== editing || editing.task !== token) return;
    if (editing.preview) URL.revokeObjectURL(editing.preview);
    Object.assign(editing, {
      blob,
      photo: null,
      icon: null,
      preview: URL.createObjectURL(blob),
    });
    $("#item-media-error").textContent = "";
  } catch (error) {
    if (mediaDraft === editing && editing.task === token)
      $("#item-media-error").textContent = error.message || "เตรียมรูปไม่ได้";
  } finally {
    if (mediaDraft === editing && editing.task === token) {
      editing.processing = false;
      stopButtonLoading($("#item-media-save"));
      renderItemMediaPreview();
      event.target.value = "";
    }
  }
});
$("#item-media-dialog").addEventListener("cancel", (event) => {
  if (busy) event.preventDefault();
});
$("#item-media-dialog").addEventListener("close", () => {
  stopButtonLoading($("#item-media-save"));
  if (mediaDraft?.preview) URL.revokeObjectURL(mediaDraft.preview);
  mediaDraft = null;
  $("#item-media-file").value = "";
});

async function saveItemMedia() {
  if (!mediaDraft || busy || mediaDraft.processing || mediaDraft.stale) return;
  const editing = mediaDraft;
  $("#item-media-error").textContent = "";
  if (editing.receiptCard) {
    const card = editing.receiptCard;
    releaseReceiptMedia(card);
    card.receiptMedia = {
      photo: editing.photo,
      icon: editing.icon,
      iconColor: editing.iconColor,
      iconBackground: editing.iconBackground,
      blob: editing.blob,
      preview: "",
    };
    renderReceiptMedia(card);
    $("#item-media-dialog").close();
    return;
  }
  await mutation(
    async (next) => {
      const item = next.items.find((entry) => entry.id === editing.id);
      if (!item) throw new Error("ไม่พบรายการนี้ กรุณาโหลดของในบ้านใหม่");
      if (editing.blob) {
        const uploaded = await request("photo", {
          method: "POST",
          headers: { "Content-Type": "image/jpeg" },
          body: editing.blob,
        });
        editing.photo = uploaded.id;
        editing.blob = null;
      }
      item.photo = editing.photo;
      item.icon = editing.icon;
      if (editing.icon) {
        item.iconColor = editing.iconColor;
        item.iconBackground = editing.iconBackground;
      } else {
        delete item.iconColor;
        delete item.iconBackground;
      }
    },
    editing.version,
    () => {
      $("#item-media-dialog").close();
      alertUser("บันทึกรูปหรือไอคอนแล้ว");
    },
  );
}

async function jpeg(file) {
  if (file.size > 25 * 1024 * 1024) throw new Error("กรุณาเลือกรูปขนาดไม่เกิน 25 MB");
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode().catch(() => {
      throw new Error("อ่านไฟล์รูปนี้ไม่ได้ กรุณาลองใช้ JPEG, PNG หรือ WebP");
    });
    const canvas = document.createElement("canvas");
    // Camera/file inputs cannot reliably request a square capture across devices.
    // Crop the decoded image to a centered 1:1 square before resizing it.
    const side = Math.min(img.naturalWidth, img.naturalHeight);
    const size = Math.min(800, side);
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const sx = Math.floor((img.naturalWidth - side) / 2);
    const sy = Math.floor((img.naturalHeight - side) / 2);
    ctx.drawImage(img, sx, sy, side, side, 0, 0, size, size);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.5));
    if (blob && blob.size <= 450000) return blob;
    throw new Error("ย่อรูปไม่ได้ กรุณาเลือกรูปขนาดเล็กลง");
  } finally {
    URL.revokeObjectURL(url);
  }
}

let barcodeScanToken = 0;
let barcodeScanControls = null;
let barcodeTrack = null;
let barcodeTorchOn = false;
let nativeBarcodeTimer = 0;
let barcodeScanContext = null;

function barcodeContext(card = null) {
  return card
    ? {
        card,
        dialog: $("#receipt-dialog"),
        scanner: card.querySelector(".receipt-barcode-scanner"),
        video: card.querySelector(".receipt-barcode-video"),
        zoom: card.querySelector(".receipt-barcode-zoom"),
        torch: card.querySelector(".receipt-barcode-torch"),
        hint: card.querySelector(".receipt-barcode-hint"),
        input: receiptField(card, "barcode"),
      }
    : {
        card: null,
        dialog: $("#editor"),
        scanner: $("#barcode-scanner"),
        video: $("#barcode-video"),
        zoom: $("#barcode-zoom"),
        torch: $("#barcode-torch"),
        hint: $("#barcode-hint"),
        input: $("#f-barcode"),
      };
}

function stopBarcodeScan() {
  barcodeScanToken++;
  barcodeScanControls?.stop();
  barcodeScanControls = null;
  barcodeTrack = null;
  barcodeTorchOn = false;
  clearTimeout(nativeBarcodeTimer);
  nativeBarcodeTimer = 0;
  const { zoom, torch, video, scanner } = barcodeScanContext || {};
  if (zoom) {
    zoom.disabled = true;
    zoom.value = "1";
    zoom.min = "1";
    zoom.max = "1";
  }
  if (torch) {
    torch.hidden = true;
    torch.textContent = "เปิดไฟฉาย";
  }
  video?.srcObject?.getTracks().forEach((track) => track.stop());
  if (video) video.srcObject = null;
  if (scanner) scanner.hidden = true;
  barcodeScanContext = null;
}

function applyBarcode(code, context = barcodeScanContext || barcodeContext()) {
  const hint = context.hint;
  if (!hint || !/^[0-9]{8,14}$/.test(code)) return;
  context.input.value = code;
  const known = [...(stock.recentItems || []), ...stock.items].find(
    (item) => item.barcode === code,
  );
  if (known) {
    if (context.card) {
      receiptField(context.card, "name").value = known.name;
      receiptField(context.card, "unit").value = known.unit;
      receiptField(context.card, "category").value = known.category;
      receiptField(context.card, "location").value = known.location || "";
      context.card.frozenNameSeen = false;
      selectReceiptFreezer(context.card);
      refreshSearchSelect(receiptField(context.card, "category"));
      refreshReceiptShelfLife(context.card);
    } else {
      $("#f-name").value = known.name;
      $("#f-unit").value = known.unit;
      $("#f-category").value = known.category;
      $("#f-location").value = known.location || "";
      selectFreezerForFrozenName();
      refreshSearchSelect($("#f-category"));
      refreshShelfLifeSuggestion();
    }
    hint.textContent = "พบ " + known.name + " · ตรวจจำนวนและวันที่ของรอบนี้";
  } else {
    hint.textContent = "ยังไม่เคยบันทึกบาร์โค้ดนี้ · กรอกชื่อครั้งแรก แล้วแอปจะจำให้";
  }
}

function configureBarcodeCamera(track) {
  if (!track) return;
  const capabilities = track.getCapabilities?.() || {};
  const zoom = barcodeScanContext?.zoom;
  if (zoom && capabilities.zoom) {
    zoom.min = String(capabilities.zoom.min ?? 1);
    zoom.max = String(capabilities.zoom.max ?? 1);
    zoom.step = String(capabilities.zoom.step ?? 0.1);
    zoom.value = String(Math.min(Number(zoom.max), Math.max(Number(zoom.min), 1)));
    zoom.disabled = Number(zoom.max) <= Number(zoom.min);
  }
  const torch = barcodeScanContext?.torch;
  if (torch && capabilities.torch) torch.hidden = false;
}

async function startNativeBarcodeFallback(video, token, hint) {
  if (!("BarcodeDetector" in window)) return;
  let detector;
  try {
    const supported = await window.BarcodeDetector.getSupportedFormats();
    const formats = ["ean_13", "ean_8", "upc_a", "upc_e", "code_128", "code_39", "itf"].filter(
      (format) => supported.includes(format),
    );
    if (!formats.length) return;
    detector = new window.BarcodeDetector({ formats });
  } catch {
    return;
  }
  const scan = async () => {
    if (token !== barcodeScanToken || !video.srcObject) return;
    try {
      const results = await detector.detect(video);
      const match = results.find((result) => /^[0-9]{8,14}$/.test(result.rawValue || ""));
      if (match) {
        const context = barcodeScanContext;
        stopBarcodeScan();
        applyBarcode(match.rawValue, context);
        return;
      }
    } catch {
      /* Keep ZXing running if native detection is unavailable for this frame. */
    }
    nativeBarcodeTimer = setTimeout(scan, 180);
  };
  scan();
}

document.addEventListener("input", (event) => {
  if (event.target !== barcodeScanContext?.zoom) return;
  if (barcodeTrack)
    barcodeTrack
      .applyConstraints({ advanced: [{ zoom: Number(event.target.value) }] })
      .catch(() => {});
});

async function toggleBarcodeTorch() {
  const context = barcodeScanContext;
  if (!barcodeTrack || !context) return;
  barcodeTorchOn = !barcodeTorchOn;
  try {
    await barcodeTrack.applyConstraints({
      advanced: [{ torch: barcodeTorchOn }],
    });
    context.torch.textContent = barcodeTorchOn ? "ปิดไฟฉาย" : "เปิดไฟฉาย";
  } catch {
    barcodeTorchOn = false;
    context.hint.textContent = "กล้องเครื่องนี้ไม่รองรับไฟฉาย";
  }
}

async function startBarcodeScan(card = null) {
  if ((card ? !pendingReceipt : !draft) || !barcodeContext(card).scanner) return;
  stopBarcodeScan();
  const context = (barcodeScanContext = barcodeContext(card));
  const token = barcodeScanToken;
  const hint = context.hint;
  if (!navigator.mediaDevices?.getUserMedia) {
    hint.textContent = "อุปกรณ์นี้เปิดกล้องผ่านเว็บไม่ได้ กรุณาพิมพ์เลขบาร์โค้ด";
    return;
  }
  context.scanner.hidden = false;
  hint.textContent = "กำลังเปิดกล้อง…";
  try {
    const { BrowserMultiFormatOneDReader, BarcodeFormat, DecodeHintType } =
      await import("/barcode-scanner.js");
    if (token !== barcodeScanToken || !context.dialog.open) return;
    const hints = new Map([
      [DecodeHintType.TRY_HARDER, true],
      [
        DecodeHintType.POSSIBLE_FORMATS,
        [
          BarcodeFormat.EAN_13,
          BarcodeFormat.EAN_8,
          BarcodeFormat.UPC_A,
          BarcodeFormat.UPC_E,
          BarcodeFormat.CODE_128,
          BarcodeFormat.CODE_39,
          BarcodeFormat.ITF,
        ],
      ],
    ]);
    const reader = new BrowserMultiFormatOneDReader(hints, {
      delayBetweenScanAttempts: 180,
      delayBetweenScanSuccess: 180,
    });
    const controls = await reader.decodeFromConstraints(
      {
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
          frameRate: { ideal: 30 },
        },
      },
      context.video,
      (result) => {
        if (token !== barcodeScanToken || !result) return;
        const code = result.getText();
        if (!/^[0-9]{8,14}$/.test(code)) {
          hint.textContent = "พบโค้ดที่ไม่ใช่เลขสินค้า 8–14 หลัก · ลองสแกนอีกครั้ง";
          return;
        }
        stopBarcodeScan();
        applyBarcode(code, context);
      },
    );
    if (token !== barcodeScanToken || !context.dialog.open) controls.stop();
    else {
      barcodeScanControls = controls;
      barcodeTrack = context.video.srcObject?.getVideoTracks?.()[0] || null;
      configureBarcodeCamera(barcodeTrack);
      startNativeBarcodeFallback(context.video, token, hint);
      hint.textContent = "เล็งกล้องไปที่บาร์โค้ดสินค้า · ขยับเข้าใกล้หรือปรับซูมได้";
    }
  } catch (error) {
    stopBarcodeScan();
    hint.textContent =
      error?.name === "NotAllowedError"
        ? "กรุณาอนุญาตให้ใช้กล้อง หรือพิมพ์เลขบาร์โค้ด"
        : "เปิดกล้องหรืออ่านบาร์โค้ดไม่ได้ กรุณาพิมพ์เลขบาร์โค้ด";
  }
}

function populateKnown() {
  if (!draft || !["add", "new-shopping"].includes(draft.mode)) return;
  const known = [...stock.items, ...(stock.recentItems || []).slice().reverse()]
    .reverse()
    .find((i) => key(i.name) === key($("#f-name").value));
  if (!known) return;
  if ($("#f-unit").value === "ชิ้น") $("#f-unit").value = known.unit;
  if ($("#f-location") && !$("#f-location").value) $("#f-location").value = known.location;
  if ($("#f-category") && $("#f-category").value === "อื่น ๆ")
    $("#f-category").value = known.category;
  if ($("#f-barcode") && !$("#f-barcode").value) $("#f-barcode").value = known.barcode || "";
}

$("#fields").addEventListener("change", async (event) => {
  if (event.target.id === "f-name") populateKnown();
  if (event.target.id === "f-barcode") applyBarcode(event.target.value.trim());
  if (event.target.id !== "f-photo" || !event.target.files[0] || !draft) return;
  const editing = draft,
    token = ++editing.photoTask;
  editing.processing = true;
  startButtonLoading($("#save"));
  $("#save").disabled = true;
  $("#form-error").textContent = "กำลังเตรียมรูป…";
  try {
    const blob = await jpeg(event.target.files[0]);
    if (draft !== editing || editing.photoTask !== token) return;
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    previewUrl = URL.createObjectURL(blob);
    editing.blob = blob;
    editing.photo = null;
    editing.icon = null;
    $("#form-error").textContent = "";
    renderPhoto();
  } catch (error) {
    if (draft === editing && editing.photoTask === token)
      $("#form-error").textContent = error.message;
  } finally {
    if (draft === editing && editing.photoTask === token) {
      editing.processing = false;
      stopButtonLoading($("#save"));
      $("#save").disabled = false;
    }
  }
});

function addShopping(list, item, editingId = "") {
  const filtered = list.filter((i) => i.id !== editingId);
  const match = filtered.find(
    (i) => key(i.name) === key(item.name) && key(i.unit) === key(item.unit),
  );
  if (match) {
    const combined = round(match.qty + item.qty);
    if (combined > 999999) throw new Error("จำนวนรวมเกิน 999,999 กรุณาลดจำนวน");
    match.qty = combined;
  } else filtered.push(item);
  return filtered;
}

function formItem() {
  const name = $("#f-name").value.trim(),
    unit = $("#f-unit").value.trim();
  if (!name || !unit) throw new Error("กรุณากรอกชื่อของและหน่วย");
  const item = {
    id: draft.sourceId || crypto.randomUUID(),
    name,
    unit,
    qty: Number($("#f-qty").value),
  };
  if (draft.mode.includes("shopping")) return item;
  const notificationDaysInput = $("#f-notify-before-days")?.value?.trim() || "";
  let notifyBeforeDays;
  if (notificationDaysInput) {
    notifyBeforeDays = Number(notificationDaysInput);
    if (!Number.isInteger(notifyBeforeDays) || notifyBeforeDays < 0 || notifyBeforeDays > 365)
      throw new Error("จำนวนวันแจ้งเตือนต้องเป็นจำนวนเต็ม 0 ถึง 365 วัน");
  }
  return {
    ...item,
    id: draft.mode === "receive" ? crypto.randomUUID() : item.id,
    category: $("#f-category").value,
    location: $("#f-location").value.trim(),
    receivedDate: $("#f-received-date").value,
    date: $("#f-date").value,
    dateKind: $("#f-kind").value,
    ...(notifyBeforeDays === undefined ? {} : { notifyBeforeDays }),
    ...($("#f-barcode").value.trim() ? { barcode: $("#f-barcode").value.trim() } : {}),
    photo: draft.photo,
    ...(draft.icon !== undefined ? { icon: draft.icon } : {}),
    ...(draft.icon
      ? {
          iconColor: draft.iconColor || "green",
          iconBackground: draft.iconBackground || "mint",
        }
      : {}),
  };
}

async function mutation(change, expected, done) {
  if (busy || !stock) return;
  const inDialog = $("#editor").open;
  const inImportDialog = $("#excel-import-dialog").open;
  const inReceiptDialog = $("#receipt-dialog").open;
  const inMediaDialog = $("#item-media-dialog").open;
  const loadingButton = inDialog
    ? $("#save")
    : inImportDialog
      ? $("#excel-import-confirm")
      : inReceiptDialog
        ? $("#receipt-confirm")
        : inMediaDialog
          ? $("#item-media-save")
          : pendingActionButton;
  pendingActionButton = null;
  startButtonLoading(loadingButton);
  busy = true;
  ++generation;
  if (inDialog) $("#save").disabled = true;
  if (inImportDialog) $("#excel-import-confirm").disabled = true;
  if (inReceiptDialog) $("#receipt-confirm").disabled = true;
  if (inMediaDialog) {
    $("#item-media-save").disabled = true;
    $("#item-media-file").disabled = true;
  }
  try {
    if (stock.version !== expected) throw new ApiError(409, "");
    const next = structuredClone(stock);
    await change(next);
    const result = await post("stock", next);
    next.version = result.version;
    stock = next;
    $("#sync-error").hidden = true;
    if (inDialog) $("#editor").close();
    draw();
    if (done) done();
  } catch (error) {
    if (error.status === 401) {
      entry("login", errorText(error));
      return;
    }
    const conflict = error.status === 409;
    const message = conflict
      ? "ข้อมูลถูกแก้ไขจากอีกอุปกรณ์ กรุณาดูรายการล่าสุดแล้วทำใหม่อีกครั้ง"
      : error instanceof ApiError
        ? errorText(error)
        : error.message || "บันทึกไม่ได้";
    if (conflict || error.status === 0 || error.status >= 500) await refresh(true);
    if (inDialog && $("#editor").open) {
      $("#form-error").textContent = message;
      if (conflict || (draft && draft.version !== stock?.version)) draft.stale = true;
    } else if (inImportDialog && $("#excel-import-dialog").open) {
      $("#excel-import-error").textContent = message;
      if (pendingStockImport && (conflict || error.status === 0 || error.status >= 500)) {
        pendingStockImport.stale = true;
        $("#excel-import-error").textContent += " · กรุณาตรวจของในบ้านก่อนอัปโหลดใหม่ เพื่อไม่ให้นำเข้าซ้ำ";
      }
    } else if (inReceiptDialog && $("#receipt-dialog").open) {
      $("#receipt-error").textContent = message;
      if (pendingReceipt && (conflict || error.status === 0 || error.status >= 500)) {
        pendingReceipt.stale = true;
        $("#receipt-error").textContent += " · กรุณาปิดแล้วสแกนใหม่ เพื่อป้องกันรายการซ้ำ";
      }
    } else if (inMediaDialog && $("#item-media-dialog").open) {
      $("#item-media-error").textContent = message;
      if (mediaDraft && (conflict || error.status === 0 || error.status >= 500)) {
        mediaDraft.stale = true;
        $("#item-media-error").textContent += " · กรุณาปิดแล้วเปิดตัวเลือกรูปใหม่";
      }
    } else if (stock) alertUser(message);
  } finally {
    busy = false;
    stopButtonLoading(loadingButton);
    if ($("#editor").open) $("#save").disabled = Boolean(draft?.stale || draft?.processing);
    if ($("#excel-import-dialog").open)
      $("#excel-import-confirm").disabled = Boolean(
        !pendingStockImport || pendingStockImport.stale || pendingStockImport.errors.length,
      );
    if ($("#receipt-dialog").open)
      $("#receipt-confirm").disabled = Boolean(!pendingReceipt || pendingReceipt.stale);
    $("#item-media-file").disabled = false;
    if ($("#item-media-dialog").open)
      $("#item-media-save").disabled = Boolean(
        !mediaDraft || mediaDraft.processing || mediaDraft.stale,
      );
  }
}

async function consume(item, qty, version) {
  if (!(qty > 0 && qty <= item.qty)) return;
  const remain = round(item.qty - qty);
  let removedPhoto;
  await mutation(
    async (next) => {
      if (
        !remain &&
        item.photo &&
        !next.items.some((i) => i.id !== item.id && i.photo === item.photo)
      ) {
        try {
          const response = await fetch("/api/photo?id=" + encodeURIComponent(item.photo), {
            cache: "no-store",
          });
          if (response.ok) removedPhoto = await response.blob();
        } catch {
          /* The stock change can still proceed when a photo is unavailable. */
        }
      }
      next.items = next.items.flatMap((i) =>
        i.id !== item.id ? [i] : remain ? [{ ...i, qty: remain }] : [],
      );
    },
    version,
    () => {
      const savedVersion = stock.version;
      const total = totalFor(item);
      const canUndo =
        !item.photo || removedPhoto || stock.items.some((i) => i.photo === item.photo);
      const undo = canUndo
        ? () =>
            mutation(
              async (next) => {
                let photo = item.photo;
                if (removedPhoto) {
                  const upload = await request("photo", {
                    method: "POST",
                    headers: { "Content-Type": "image/jpeg" },
                    body: removedPhoto,
                  });
                  photo = upload.id;
                }
                next.items = next.items.filter((i) => i.id !== item.id);
                next.items.push({ ...item, photo });
              },
              savedVersion,
              () => alertUser("ย้อนการใช้แล้ว"),
            )
        : null;
      if (!total)
        alertUser(
          item.name + " หมดแล้ว",
          () =>
            startEditor("new-shopping", {
              name: item.name,
              unit: item.unit,
              qty: 1,
            }),
          "จดซื้อ",
          undo,
          "ย้อนกลับ",
        );
      else
        alertUser(
          "ใช้ " + item.name + " ไป " + amountFormat.format(qty) + " " + item.unit,
          undo,
          "ย้อนกลับ",
        );
    },
  );
}

$("#editor-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!draft || draft.processing || draft.stale || busy) return;
  pendingActionButton = event.submitter;
  const { mode, sourceId, version, initial } = draft;
  $("#form-error").textContent = "";
  if (mode === "use") return consume(initial, Number($("#f-used").value), version);
  await mutation(
    async (next) => {
      if (mode === "remove-item") {
        next.items = next.items.filter((i) => i.id !== sourceId);
        return;
      }
      if (mode === "remove-shopping") {
        next.shopping = next.shopping.filter((i) => i.id !== sourceId);
        return;
      }
      if (mode === "remove-meal-plan") {
        next.mealPlans = next.mealPlans.filter((plan) => plan.id !== sourceId);
        return;
      }
      if (mode === "remove-recipe") {
        next.recipes = (next.recipes || []).filter((recipe) => recipe.id !== sourceId);
        next.mealPlans = (next.mealPlans || []).map((plan) =>
          plan.recipeId === sourceId ? { ...plan, recipeId: null } : plan,
        );
        return;
      }
      const item = formItem();
      if (mode.includes("shopping")) {
        next.shopping = addShopping(next.shopping, item, sourceId);
        return;
      }
      if (draft.blob) {
        const uploaded = await request("photo", {
          method: "POST",
          headers: { "Content-Type": "image/jpeg" },
          body: draft.blob,
        });
        draft.photo = uploaded.id;
        draft.blob = null;
        item.photo = uploaded.id;
      }
      if (mode === "edit-item") next.items = next.items.map((i) => (i.id === sourceId ? item : i));
      else next.items.push(item);
      const remembered = {
        name: item.name,
        unit: item.unit,
        category: item.category,
        location: item.location,
        barcode: item.barcode || "",
      };
      next.recentItems = [
        remembered,
        ...(next.recentItems || []).filter(
          (entry) => key(entry.name) !== key(item.name) || key(entry.unit) !== key(item.unit),
        ),
      ].slice(0, 100);
      if (draft.mealPlanId) {
        const plan = next.mealPlans?.find((entry) => entry.id === draft.mealPlanId);
        if (!plan || plan.status !== "cooked" || plan.cookedItemCreated)
          throw new Error("แผนนี้ถูกเพิ่มเข้ารายการปรุงสุกแล้ว กรุณาโหลดข้อมูลใหม่");
        plan.status = "completed";
        plan.cookedItemCreated = true;
      }
      if (mode === "receive") next.shopping = next.shopping.filter((i) => i.id !== sourceId);
    },
    version,
    () =>
      alertUser(
        mode === "receive"
          ? "รับของเข้าบ้านแล้ว"
          : mode.startsWith("remove-")
            ? "ลบรายการแล้ว"
            : "บันทึกแล้ว",
      ),
  );
});

let shortageSummary = null;

function shortageSummaryRow(item) {
  return (
    '<div class="shortage-summary-row" data-id="' +
    esc(item.id) +
    '"><span class="shortage-summary-name">' +
    esc(item.name) +
    '</span><label class="shortage-summary-qty-label">จำนวน<input class="shortage-summary-qty" required type="number" inputmode="decimal" min=".001" max="999999" step=".001" value="' +
    esc(item.qty) +
    '"></label><span class="shortage-summary-unit">' +
    esc(item.unit) +
    "</span></div>"
  );
}

function openShortageSummary(plan, target) {
  if (!stock || busy || !plan) return;
  const missing = mealShortages(plan);
  if (!missing.length) return alertUser("วัตถุดิบของเมนูนี้มีครบแล้ว");
  shortageSummary = {
    target,
    version: stock.version,
    stale: false,
    items: missing.map((ingredient) => ({
      id: crypto.randomUUID(),
      name: ingredient.name,
      unit: ingredient.unit,
      qty: ingredient.missing,
    })),
  };
  $("#shortage-summary-title").textContent =
    target === "inventory" ? "สรุปรายการเพิ่มของในบ้าน" : "สรุปรายการจดซื้อ";
  $("#shortage-summary-help").textContent =
    "ตรวจแก้จำนวนได้ก่อน" +
    (target === "inventory" ? "เพิ่มเข้าของในบ้าน" : "จดลงรายการซื้อ") +
    " ส่วนหน่วยเปลี่ยนไม่ได้ เพราะลงในแผนไปแล้ว";
  $("#shortage-summary-confirm").textContent =
    target === "inventory" ? "เพิ่มของในบ้าน" : "จดรายการซื้อ";
  $("#shortage-summary-error").textContent = "";
  $("#shortage-summary-confirm").disabled = false;
  $("#shortage-summary-list").innerHTML = shortageSummary.items.map(shortageSummaryRow).join("");
  if (!$("#shortage-summary-dialog").open) $("#shortage-summary-dialog").showModal();
}

function shortageSummaryItemsFromForm() {
  const rows = [...$("#shortage-summary-list").querySelectorAll(".shortage-summary-row")];
  return rows.map((row) => {
    const base = shortageSummary.items.find((item) => item.id === row.dataset.id);
    const qty = Number(row.querySelector(".shortage-summary-qty")?.value);
    if (!(qty > 0 && qty <= 999999)) throw new Error("กรุณากรอกจำนวนให้ถูกต้อง");
    return { ...base, qty: round(qty) };
  });
}

async function confirmShortageSummary() {
  if (!shortageSummary || shortageSummary.stale || busy) return;
  let items;
  try {
    items = shortageSummaryItemsFromForm();
  } catch (error) {
    $("#shortage-summary-error").textContent = error.message;
    return;
  }
  const target = shortageSummary.target;
  busy = true;
  ++generation;
  const loadingButton = $("#shortage-summary-confirm");
  pendingActionButton = null;
  startButtonLoading(loadingButton);
  loadingButton.disabled = true;
  try {
    if (stock.version !== shortageSummary.version) throw new ApiError(409, "");
    const next = structuredClone(stock);
    if (target === "inventory") {
      for (const item of items) {
        next.items.push({
          id: crypto.randomUUID(),
          name: item.name,
          qty: item.qty,
          unit: item.unit,
          category: "อื่น ๆ",
          location: "",
          date: "",
          dateKind: "expiry",
          photo: null,
        });
      }
    } else {
      for (const item of items) {
        next.shopping = addShopping(next.shopping, {
          id: crypto.randomUUID(),
          name: item.name,
          unit: item.unit,
          qty: item.qty,
        });
      }
    }
    const result = await post("stock", next);
    next.version = result.version;
    stock = next;
    if ($("#shortage-summary-dialog").open) $("#shortage-summary-dialog").close();
    draw();
    alertUser(target === "inventory" ? "เพิ่มวัตถุดิบที่ขาดในของในบ้านแล้ว" : "เพิ่มวัตถุดิบที่ขาดในรายการซื้อแล้ว");
  } catch (error) {
    if (error.status === 401) {
      entry("login", errorText(error));
      return;
    }
    const conflict = error.status === 409;
    const message = conflict
      ? "ข้อมูลเปลี่ยนจากอีกอุปกรณ์ กรุณาปิดแล้วลองใหม่"
      : error instanceof ApiError
        ? errorText(error)
        : error.message || "บันทึกไม่ได้";
    if (conflict || error.status === 0 || error.status >= 500) await refresh(true);
    if ($("#shortage-summary-dialog").open) {
      $("#shortage-summary-error").textContent = message;
      if (conflict) shortageSummary.stale = true;
    } else if (stock) alertUser(message);
  } finally {
    busy = false;
    stopButtonLoading(loadingButton);
    if ($("#shortage-summary-dialog").open)
      $("#shortage-summary-confirm").disabled = Boolean(shortageSummary?.stale);
  }
}

$("#shortage-summary-dialog").addEventListener("cancel", (event) => {
  if (busy) event.preventDefault();
});
$("#shortage-summary-dialog").addEventListener("close", () => {
  shortageSummary = null;
});

async function finishMealPlan(plan, createCookedStock = false) {
  if (!plan || plan.status === "completed") return;
  if (plan.status === "cooked") {
    if (createCookedStock)
      startEditor("add", {
        name: plan.name,
        qty: plan.servings,
        unit: "ที่",
        category: "อาหารปรุงสุก",
        mealPlanId: plan.id,
      });
    return;
  }
  const missing = mealShortages(plan);
  if (missing.length) {
    return alertUser(
      "วัตถุดิบยังไม่พอสำหรับ " + plan.name,
      () => startMealEditor(plan),
      "แก้ไขแผน",
      () => openShortageSummary(plan, "shopping"),
      "เพิ่มของที่ขาด",
    );
  }
  await mutation(
    async (next) => {
      const current = next.mealPlans.find((item) => item.id === plan.id);
      if (!current || current.status !== "planned") return;
      for (const ingredient of current.ingredients) {
        let remaining = ingredient.qty;
        const batches = next.items
          .filter(
            (item) =>
              key(item.name) === key(ingredient.name) && key(item.unit) === key(ingredient.unit),
          )
          .sort((a, b) => {
            const dateA = ["expiry", "best-before"].includes(a.dateKind)
              ? a.date || "9999"
              : "9999";
            const dateB = ["expiry", "best-before"].includes(b.dateKind)
              ? b.date || "9999"
              : "9999";
            return dateA.localeCompare(dateB) || a.name.localeCompare(b.name, "th");
          });
        for (const batch of batches) {
          if (remaining <= 0.0001) break;
          const used = Math.min(batch.qty, remaining);
          batch.qty = round(batch.qty - used);
          remaining = round(remaining - used);
        }
        next.items = next.items.filter((item) => item.qty > 0.0001);
      }
      current.status = "cooked";
    },
    stock.version,
    createCookedStock ? null : () => alertUser(plan.name + " ทำเสร็จแล้ว และตัดวัตถุดิบจากสต็อกแล้ว"),
  );
  if (
    createCookedStock &&
    stock?.mealPlans?.some((item) => item.id === plan.id && item.status === "cooked")
  )
    startEditor("add", {
      name: plan.name,
      qty: plan.servings,
      unit: "ที่",
      category: "อาหารปรุงสุก",
      mealPlanId: plan.id,
    });
}

document.addEventListener("click", async (event) => {
  const target = event.target.closest("[data-action]");
  if (!target || busy) return;
  pendingActionButton = target.tagName === "BUTTON" ? target : null;
  setTimeout(() => {
    if (pendingActionButton === target) pendingActionButton = null;
  }, 0);
  const action = target.dataset.action,
    id = target.dataset.id;
  const item = stock?.items.find((i) => i.id === id);
  const wanted = stock?.shopping.find((i) => i.id === id);
  const mealPlan = stock?.mealPlans?.find((plan) => plan.id === id);
  const recipe = stock?.recipes?.find((item) => item.id === id);
  if (action === "set-item-view") {
    try {
      localStorage.setItem("home-stock-item-view-" + tab(), id);
    } catch {}
    return draw();
  }
  if (action === "filter-card-badge") {
    const type = target.dataset.filterType;
    const value = target.dataset.filterValue;
    if (type !== "category" && type !== "location") return;
    closeItemMenus();
    $("#query").value = "";
    $("#category-filter").value = type === "category" ? value : "";
    $("#location-filter").value = "";
    if (tab() !== "stock") location.hash = "stock";
    draw();
    if (type === "location") {
      $("#location-filter").value = value;
      draw();
    }
    refreshSearchSelect($("#category-filter"));
    refreshSearchSelect($("#location-filter"));
    return;
  }
  if (action === "save-alerts") return saveAlertSettings();
  if (action === "test-alert-now") return testAlert(false);
  if (action === "test-alert-later") return testAlert(true);
  if (action === "retry") {
    startButtonLoading(target);
    entry("checking");
    try {
      await refresh(true);
    } finally {
      stopButtonLoading(target);
    }
    return;
  }
  if (action === "logout") {
    startButtonLoading(target);
    target.disabled = true;
    busy = true;
    ++generation;
    try {
      await post("session", { logout: true });
      entry("login");
    } catch (error) {
      alertUser(errorText(error));
    } finally {
      busy = false;
      stopButtonLoading(target);
      target.disabled = false;
    }
    return;
  }
  if (action === "scan-barcode") return startBarcodeScan();
  if (action === "apply-shelf-life-suggestion") {
    const suggestion = suggestedShelfLife(
      $("#f-name").value,
      $("#f-received-date").value,
      $("#f-category").value,
      $("#f-location").value,
    );
    if (!suggestion) return refreshShelfLifeSuggestion();
    $("#f-kind").value = "best-before";
    refreshSearchSelect($("#f-kind"));
    $("#f-date").value = suggestion.date;
    $("#f-date").dispatchEvent(new Event("change", { bubbles: true }));
    return;
  }
  if (action === "stop-barcode") return stopBarcodeScan();
  if (action === "toggle-barcode-torch") return toggleBarcodeTorch();
  if (action === "close") return closeEditor();
  if (action === "close-meal-editor") {
    if (!busy && $("#meal-editor").open) $("#meal-editor").close();
    return;
  }
  if (action === "notice-action") {
    const run = noticeAction?.[Number(target.dataset.index)];
    $("#notice").hidden = true;
    noticeAction = null;
    return run?.();
  }
  if (action === "toggle-item-menu") {
    const menu = target.parentElement.querySelector(".item-menu");
    const shouldOpen = menu.hidden;
    closeItemMenus();
    if (shouldOpen) {
      menu.hidden = false;
      target.setAttribute("aria-expanded", "true");
      if (event.detail === 0) menu.querySelector('[role="menuitem"]')?.focus();
    }
    return;
  }
  if (action === "toggle-card-menu") {
    const menu = target.querySelector(".item-menu");
    if (!menu) return;
    const shouldOpen = menu.hidden;
    closeItemMenus();
    if (shouldOpen) {
      menu.hidden = false;
      target.setAttribute("aria-expanded", "true");
      positionHorizontalCardMenu(menu, target);
      if (event.detail === 0) menu.querySelector('[role="menuitem"]')?.focus();
    }
    return;
  }
  closeItemMenus();
  if (!stock) return;
  if (action === "choose-item-media" && item) return startItemMedia(item);
  if (action === "close-item-media") {
    if ($("#item-media-dialog").open) $("#item-media-dialog").close();
    return;
  }
  if (action === "select-item-photo" && mediaDraft) {
    if (!stock.items.some((entry) => entry.photo === id))
      return alertUser("ไม่พบรูปนี้ กรุณาปิดแล้วเปิดตัวเลือกรูปใหม่");
    return selectItemMedia(id, null);
  }
  if (action === "select-item-icon" && mediaDraft && Object.hasOwn(itemIcons, id))
    return selectItemMedia(null, id);
  if (action === "select-item-icon-color" && mediaDraft && Object.hasOwn(itemIconColors, id)) {
    mediaDraft.iconColor = id;
    renderItemMediaPreview();
    return;
  }
  if (
    action === "select-item-icon-background" &&
    mediaDraft &&
    Object.hasOwn(itemIconBackgrounds, id)
  ) {
    mediaDraft.iconBackground = id;
    renderItemMediaPreview();
    return;
  }
  if (action === "clear-item-media") return selectItemMedia(null, null);
  if (action === "save-item-media") return saveItemMedia();
  if (action === "close-excel-import") {
    if ($("#excel-import-dialog").open) $("#excel-import-dialog").close();
    return;
  }
  if (action === "choose-receipt") {
    $("#receipt-file").click();
    return;
  }
  if (action === "close-receipt") {
    if ($("#receipt-dialog").open) $("#receipt-dialog").close();
    return;
  }
  if (action === "receipt-add-row" && pendingReceipt) {
    const card = receiptRow();
    $("#receipt-review").querySelector("details").before(card);
    enhanceReceiptRow(card);
    card.querySelector('[data-field="name"]').focus();
    return;
  }
  if (action === "receipt-pick-media" && pendingReceipt) {
    const card = target.closest(".receipt-row");
    if (card)
      startItemMedia(
        { id: null, name: receiptField(card, "name").value, ...card.receiptMedia },
        card,
      );
    return;
  }
  if (action === "receipt-apply-shelf-life" && pendingReceipt) {
    const card = target.closest(".receipt-row");
    if (!card) return;
    const result = suggestedShelfLife(
      receiptField(card, "name").value,
      receiptField(card, "receivedDate").value,
      receiptField(card, "category").value,
      receiptField(card, "location").value,
    );
    if (!result) return refreshReceiptShelfLife(card);
    receiptField(card, "dateKind").value = "best-before";
    refreshSearchSelect(receiptField(card, "dateKind"));
    receiptField(card, "date").value = result.date;
    receiptField(card, "date").dispatchEvent(new Event("change", { bubbles: true }));
    return;
  }
  if (action === "receipt-scan-barcode" && pendingReceipt) {
    const card = target.closest(".receipt-row");
    if (card) startBarcodeScan(card);
    return;
  }
  if (action === "receipt-remove-row" && pendingReceipt) {
    const card = target.closest(".receipt-row");
    if (barcodeScanContext?.card === card) stopBarcodeScan();
    if (card) {
      releaseReceiptMedia(card);
      card.remove();
    }
    $("#receipt-error").textContent = "";
    return;
  }
  if (action === "choose-stock-import") {
    $(".excel-dropdown").open = false;
    $("#stock-import-file").click();
    return;
  }
  if (action === "download-stock-template") {
    $(".excel-dropdown").open = false;
    busy = true;
    ++generation;
    startButtonLoading(target);
    target.disabled = true;
    try {
      await downloadStockTemplate();
    } catch (error) {
      alertUser(error.message || "ดาวน์โหลดเทมเพลตไม่ได้ กรุณาลองอีกครั้ง");
    } finally {
      busy = false;
      stopButtonLoading(target);
      target.disabled = false;
    }
    return;
  }
  if (action === "add-recipe") return startRecipeEditor();
  if (action === "edit-recipe" && recipe) return startRecipeEditor(recipe);
  if (action === "remove-recipe" && recipe) return startEditor("remove-recipe", recipe, id);
  if (action === "add-meal-plan") return startMealEditor(null, id);
  if (action === "plan-recipe" && recipe)
    return startMealEditor(null, selectedCalendarDate, recipe.id);
  if (action === "add-meal-ingredient" && $("#meal-editor").open) {
    $("#meal-ingredients").insertAdjacentHTML("beforeend", mealIngredientRow());
    enhanceDatalists($("#meal-ingredients"));
    return;
  }
  if (action === "remove-meal-ingredient") {
    target.closest(".meal-ingredient-row")?.remove();
    return;
  }
  if (action === "calendar-prev" || action === "calendar-next") {
    const direction = action === "calendar-prev" ? -1 : 1;
    const month = new Date(calendarYear, calendarMonth + direction, 1);
    calendarYear = month.getFullYear();
    calendarMonth = month.getMonth();
    selectedCalendarDate = "";
    return draw();
  }
  if (action === "select-expiry-date") {
    selectedCalendarDate = id;
    const selectedDate = localDay(id);
    calendarYear = selectedDate.getFullYear();
    calendarMonth = selectedDate.getMonth();
    return draw();
  }
  if (action === "edit-meal-plan" && mealPlan) return startMealEditor(mealPlan);
  if (action === "add-shortages-inventory" && mealPlan)
    return openShortageSummary(mealPlan, "inventory");
  if (action === "add-shortages-shopping" && mealPlan)
    return openShortageSummary(mealPlan, "shopping");
  if (action === "add-meal-shortages" && mealPlan) return openShortageSummary(mealPlan, "shopping");
  if (action === "close-shortage-summary") {
    if (!busy && $("#shortage-summary-dialog").open) $("#shortage-summary-dialog").close();
    return;
  }
  if (action === "confirm-shortage-summary") return confirmShortageSummary();
  if (action === "mark-meal-cooked" && mealPlan) return finishMealPlan(mealPlan);
  if (action === "complete-meal-plan" && mealPlan && mealPlan.status === "cooked") {
    return mutation(
      async (next) => {
        const current = next.mealPlans.find((plan) => plan.id === id);
        if (current?.status === "cooked") current.status = "completed";
      },
      stock.version,
      () => alertUser("เปลี่ยนสถานะเป็นเสร็จสิ้นแล้ว"),
    );
  }
  if (action === "create-cooked-stock" && mealPlan) return finishMealPlan(mealPlan, true);
  if (action === "remove-meal-plan" && mealPlan)
    return startEditor("remove-meal-plan", mealPlan, id);
  if (action === "open-stock") {
    location.hash = "stock";
    return;
  }
  if (action === "clear-filter") {
    $("#query").value = "";
    $("#category-filter").value = "";
    $("#location-filter").value = "";
    $("#sort-filter").value = "date-asc";
    $("#group-filter").value = "none";
    draw();
    refreshSearchSelect($("#category-filter"));
    refreshSearchSelect($("#location-filter"));
    refreshSearchSelect($("#sort-filter"));
    refreshSearchSelect($("#group-filter"));
    return;
  }
  if (action === "buy-low") {
    const [name, unit] = id.split("|").map(decodeURIComponent);
    const level = stock.minLevels?.find(
      (entry) => key(entry.name) === key(name) && key(entry.unit) === key(unit),
    );
    if (level) {
      const remaining = round(
        stock.items
          .filter((item) => key(item.name) === key(name) && key(item.unit) === key(unit))
          .reduce((sum, item) => sum + item.qty, 0),
      );
      const missing = round(level.qty - remaining);
      if (missing > 0) return startEditor("new-shopping", { name, unit, qty: missing });
    }
  }
  if (action === "add" || action === "new-shopping") return startEditor(action);
  if (action === "use" && item) return consume(item, Math.min(1, item.qty), stock.version);
  if (action === "edit-item" && item) return startEditor(action, item, id);
  if (action === "edit-shopping" && wanted) return startEditor(action, wanted, id);
  if (action === "receive" && wanted) {
    const known = stock.items.find(
      (i) => key(i.name) === key(wanted.name) && key(i.unit) === key(wanted.unit),
    );
    return startEditor(
      "receive",
      {
        ...wanted,
        category: known?.category || "อื่น ๆ",
        location: known?.location || "",
      },
      id,
    );
  }
  if (action === "custom-use" && item) return startEditor("use", item, id);
  if (action === "shopping-from-item" && item)
    return startEditor("new-shopping", { name: item.name, unit: item.unit });
  if (action === "confirm-remove-item" && item) return startEditor("remove-item", item, id);
  if (action === "confirm-remove") {
    const isItem = draft.mode === "edit-item";
    return startEditor(isItem ? "remove-item" : "remove-shopping", draft.initial, id);
  }
  if (action === "remove-photo" && draft) {
    stopButtonLoading($("#save"));
    draft.photoTask++;
    draft.processing = false;
    $("#save").disabled = false;
    draft.blob = null;
    draft.photo = null;
    draft.icon = null;
    draft.iconColor = "green";
    draft.iconBackground = "mint";
    $("#f-photo").value = "";
    $("#form-error").textContent = "";
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    previewUrl = "";
    renderPhoto();
  }
});

function closeItemMenus(restoreFocus = false) {
  document.querySelectorAll(".item-menu:not([hidden])").forEach((menu) => {
    const trigger = menu.parentElement.querySelector(".item-menu-trigger");
    menu.hidden = true;
    trigger?.setAttribute("aria-expanded", "false");
    menu.closest(".is-grid-card")?.setAttribute("aria-expanded", "false");
    if (restoreFocus) (menu.closest(".is-grid-card") || trigger)?.focus();
  });
}

function positionHorizontalCardMenu(menu, card) {
  if (!card.closest(".dashboard-due")) return;
  const cardRect = card.getBoundingClientRect();
  const menuRect = menu.getBoundingClientRect();
  const left = Math.max(8, Math.min(cardRect.left, window.innerWidth - menuRect.width - 8));
  let top = cardRect.top - menuRect.height - 8;
  if (top < 8) top = Math.min(cardRect.bottom + 8, window.innerHeight - menuRect.height - 8);
  menu.style.left = left + "px";
  menu.style.top = Math.max(8, top) + "px";
}

document.addEventListener(
  "scroll",
  (event) => {
    if (event.target.matches?.(".dashboard-due .item-collection")) closeItemMenus();
  },
  true,
);
window.addEventListener("scroll", () => closeItemMenus(), { passive: true });
window.addEventListener("resize", () => closeItemMenus());

document.addEventListener("pointerdown", (event) => {
  if (!event.target.closest(".item-menu-wrap, .is-grid-card")) closeItemMenus();
  if (!event.target.closest(".excel-dropdown")) $(".excel-dropdown").open = false;
});
document.addEventListener("keydown", (event) => {
  const card = event.target.closest?.('.line-item.is-grid-card[data-action="toggle-card-menu"]');
  if (
    card &&
    !event.target.closest("button, [role=menuitem]") &&
    (event.key === "Enter" || event.key === " ")
  ) {
    event.preventDefault();
    card.click();
    return;
  }
  if (event.key === "Escape" && $(".excel-dropdown").open) {
    $(".excel-dropdown").open = false;
    $(".excel-dropdown summary").focus();
  }
  const menu = document.querySelector('.item-menu[role="menu"]:not([hidden])');
  if (!menu) return;
  const items = [...menu.querySelectorAll('[role="menuitem"]')];
  const index = items.indexOf(document.activeElement);
  if (event.key === "Escape") {
    event.preventDefault();
    closeItemMenus(true);
  } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
    event.preventDefault();
    const direction = event.key === "ArrowDown" ? 1 : -1;
    const next = index < 0 ? 0 : (index + direction + items.length) % items.length;
    items[next]?.focus();
  }
});

$("#query").addEventListener("input", draw);
$("#category-filter").addEventListener("change", draw);
$("#location-filter").addEventListener("change", draw);
$("#sort-filter").addEventListener("change", draw);
$("#group-filter").addEventListener("change", draw);
document.addEventListener("change", (event) => {
  if (event.target.matches("[data-min-name]")) {
    const input = event.target;
    const name = input.dataset.minName,
      unit = input.dataset.minUnit;
    const qty = Number(input.value);
    if (
      input.value &&
      (!Number.isFinite(qty) ||
        qty < 0 ||
        qty > 999999 ||
        Math.abs(qty * 1000 - Math.round(qty * 1000)) > 0.0000001)
    ) {
      input.setCustomValidity("กรุณาใส่จำนวน 0–999,999 ทศนิยมไม่เกิน 3 ตำแหน่ง");
      input.reportValidity();
      return;
    }
    input.setCustomValidity("");
    mutation(
      (next) => {
        next.minLevels = (next.minLevels || []).filter(
          (entry) => key(entry.name) !== key(name) || key(entry.unit) !== key(unit),
        );
        if (qty > 0 && input.value) next.minLevels.push({ name, unit, qty });
      },
      stock.version,
      () => alertUser("บันทึกจำนวนขั้นต่ำแล้ว"),
    );
    return;
  }

  const input = event.target;
  if (!input.matches?.('input[name="animation-mode"]')) return;
  if (!animationModes.includes(input.value)) return;
  try {
    localStorage.setItem(animationStorageKey, input.value);
    animationMode = input.value;
    $("#settings-error").textContent = "";
  } catch (error) {
    console.error("บันทึกการตั้งค่าแอนิเมชันไม่ได้", error);
    $("#settings-error").textContent = "บันทึกการตั้งค่าไม่ได้ เบราว์เซอร์อาจปิดการใช้พื้นที่จัดเก็บ";
    document.querySelectorAll('input[name="animation-mode"]').forEach((choice) => {
      choice.checked = choice.value === animationMode;
    });
  }
});
window.addEventListener("hashchange", () => {
  $(".excel-dropdown").open = false;
  draw();
  window.scrollTo(0, 0);
});
function activeCheck() {
  lastActive = Date.now();
  if (stock && !document.hidden) refresh();
}
function interaction() {
  if (Date.now() - lastActive >= idleAfter) activeCheck();
  else lastActive = Date.now();
}
document.addEventListener("pointerdown", interaction, { passive: true });
document.addEventListener("keydown", interaction);
window.addEventListener("focus", activeCheck);
document.addEventListener("visibilitychange", () => {
  if (document.hidden) stopBarcodeScan();
  if (!document.hidden) activeCheck();
});
function syncDateDisplay(event) {
  const input = event.target.closest?.(".date-control input[type='date']");
  if (!input) return;
  const display = input.parentElement.querySelector(".date-display");
  if (display) display.textContent = dateInputLabel(input.value);
}
document.addEventListener("input", syncDateDisplay);
document.addEventListener("change", syncDateDisplay);
function updateShelfLifeSuggestion(event) {
  if (event.target?.id === "f-location" && draft) draft.freezerLocationManual = true;
  if (event.target?.id === "f-name") selectFreezerForFrozenName();
  if (["f-name", "f-category", "f-location", "f-received-date"].includes(event.target?.id))
    refreshShelfLifeSuggestion();
}
document.addEventListener("input", updateShelfLifeSuggestion);
document.addEventListener("change", updateShelfLifeSuggestion);
document.addEventListener("input", (event) => {
  if (!mediaDraft?.icon) return;
  if (event.target.id === "item-media-custom-icon-color")
    mediaDraft.iconColor = event.target.value.toLowerCase();
  else if (event.target.id === "item-media-custom-icon-background")
    mediaDraft.iconBackground = event.target.value.toLowerCase();
  else return;
  renderItemMediaPreview();
});
document.addEventListener("click", (event) => {
  const input = event.target.closest?.(".date-control input[type='date']");
  if (!input || !event.isTrusted || typeof input.showPicker !== "function") return;
  event.preventDefault();
  input.showPicker();
});
setInterval(() => {
  if (stock && !document.hidden && Date.now() - lastActive < idleAfter) refresh();
}, 60000);
refresh(true);
