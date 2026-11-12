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
