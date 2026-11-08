"use strict";

const $ = (selector) => document.querySelector(selector);
const categories = [
  "เนื้อสัตว์",
  "ผัก",
  "ของสด",
  "ของแช่แข็ง",
  "ของแห้ง",
  "อาหารปรุงสุก",
  "อื่น ๆ",
];
const categoryAliases = { อาหารสด: "ของสด", อาหารแห้ง: "ของแห้ง" };
const rooms = ["ตู้เย็น", "ช่องแช่แข็ง", "ตู้กับข้าว"];
const titles = {
  today: "หน้าหลัก",
  stock: "ของในบ้าน",
  shopping: "รายการซื้อ",
  meals: "แผนทำอาหาร",
  recipes: "เมนูที่บันทึกไว้",
};
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
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const key = (value) => value.trim().normalize("NFC").toLocaleLowerCase();
const amount = (item) => amountFormat.format(item.qty) + " " + item.unit;
let stock = null;
let busy = false;
let generation = 0;
let draft = null;
let mealDraft = null;
let mealIngredientSequence = 0;
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

function tab() {
  const path = location.hash.slice(1);
  return Object.hasOwn(titles, path) ? path : "today";
}

function localDay(value) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day, 12);
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
  const prefix = item.dateKind === "plan" ? "ตั้งใจใช้" : "หมดอายุ";
  const relative = days === 0 ? "วันนี้" : days === 1 ? "พรุ่งนี้" : "";
  return prefix + relative + " · " + dateFormat.format(localDay(item.date));
}

function byDate(a, b) {
  return (
    (a.date || "9999").localeCompare(b.date || "9999") ||
    a.name.localeCompare(b.name, "th")
  );
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
    throw new ApiError(
      0,
      "เชื่อมต่อไม่ได้ กรุณาตรวจอินเทอร์เน็ตแล้วลองอีกครั้ง",
    );
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
  if (error.status === 503)
    return "บริการเก็บข้อมูลยังไม่พร้อมใช้งาน กรุณาตรวจการตั้งค่า Vercel แล้วลองอีกครั้ง";
  if (error.status === 413) return "ไฟล์รูปหรือรายการมีขนาดใหญ่เกินไป";
  if (error.status === 429)
    return "มีคำขอมากเกินไป กรุณารอสักครู่แล้วลองอีกครั้ง";
  if (error.status === 400 || error.status === 422)
    return error.message || "ข้อมูลไม่ถูกต้อง กรุณาตรวจสอบรายการอีกครั้ง";
  return "ติดต่อบริการไม่สำเร็จ กรุณาลองอีกครั้ง";
}

function entry(mode, message = "") {
  generation++;
  stock = null;
  if ($("#editor").open) $("#editor").close();
  if ($("#meal-editor").open) $("#meal-editor").close();
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
  if (!force && (busy || $("#editor").open || $("#meal-editor").open)) return;
  if (!force && Date.now() - lastReadStarted < 3000) return;
  lastReadStarted = Date.now();
  const current = ++generation;
  try {
    const newer = await request("stock");
    if (current !== generation) return;
    if (!Array.isArray(newer.items) || !Array.isArray(newer.shopping))
      throw new Error();
    newer.items = newer.items.map((item) => ({
      ...item,
      category: categoryAliases[item.category] || item.category,
    }));
    const changed =
      !stock ||
      stock.version !== newer.version ||
      lastDrawDay !== new Date().toDateString();
    stock = newer;
    $("#entry").hidden = true;
    $("#app").hidden = false;
    $("#sync-error").hidden = true;
    if (changed) draw();
  } catch (error) {
    if (current !== generation) return;
    if (error.status === 401) return entry("login");
    const message = errorText(error);
    if (!stock) return entry("unavailable", message);
    $("#sync-error").textContent =
      message + " · กำลังแสดงข้อมูลล่าสุดที่เปิดไว้";
    $("#sync-error").hidden = false;
  }
}

$("#login").addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = $("#login button");
  button.disabled = true;
  $("#login-error").textContent = "";
  try {
    await post("session", { password: $("#password").value });
    $("#password").value = "";
    await refresh(true);
  } catch (error) {
    $("#login-error").textContent =
      error.status === 401 ? "รหัสผ่านไม่ถูกต้อง" : errorText(error);
  } finally {
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
    button.textContent = caption;
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
  return (
    '<span class="paper-plus-label"><svg class="paper-plus-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M12 18v-6m-3 3h6"/></svg><span>' +
    esc(label) +
    "</span></span>"
  );
}
function thumb(item) {
  return item.photo
    ? '<img class="thumb" decoding="async" loading="lazy" alt="" src="/api/photo?id=' +
        encodeURIComponent(item.photo) +
        '">'
    : '<span aria-hidden="true" class="thumb placeholder">' +
        esc([...item.name][0] || "·") +
        "</span>";
}
const badgeDetails = {
  category: {
    เนื้อสัตว์: { icon: "🥩", tone: "meat" },
    ผัก: { icon: "🥦", tone: "vegetables" },
    ของสด: { icon: "🧺", tone: "fresh" },
    ของแช่แข็ง: { icon: "🧊", tone: "frozen" },
    ของแห้ง: { icon: "🌾", tone: "dry" },
    อาหารปรุงสุก: { icon: "🍲", tone: "cooked" },
    "อื่น ๆ": { icon: "📦", tone: "other" },
    ทุกหมวด: { icon: "✦", tone: "all" },
  },
  location: {
    ตู้เย็น: { icon: "🧊", tone: "fridge" },
    ช่องแช่แข็ง: { icon: "❄️", tone: "freezer" },
    ตู้กับข้าว: { icon: "🗄️", tone: "pantry" },
    ทุกที่เก็บ: { icon: "✦", tone: "all" },
  },
};
function valueBadge(value, type) {
  const detail =
    badgeDetails[type][value] ||
    (type === "location"
      ? { icon: "📍", tone: "custom" }
      : { icon: "📦", tone: "other" });
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
function row(item, shopping = false) {
  let meta, detail, actions;
  if (shopping) {
    const total = totalFor(item);
    detail = "ซื้อ " + amount(item);
    meta = "ที่บ้านเหลือ " + amountFormat.format(total) + " " + item.unit;
    actions =
      button("receive", "ซื้อแล้ว", item.id) +
      button("edit-shopping", "แก้ไข", item.id, "action small");
  } else {
    detail = amount(item);
    meta = [
      item.location && valueBadge(item.location, "location"),
      item.category && valueBadge(item.category, "category"),
    ]
      .filter(Boolean)
      .join("");
    actions =
      button(
        "use",
        item.qty < 1 ? "- ใช้หมด" : "- 1 " + esc(item.unit),
        item.id,
        "stock-action stock-action-use",
      ) +
      button(
        "custom-use",
        "- ระบุจำนวน",
        item.id,
        "stock-action stock-action-custom",
      ) +
      '<div class="item-menu-wrap"><button type="button" class="item-menu-trigger" data-action="toggle-item-menu" data-id="' +
      esc(item.id) +
      '" aria-label="ตัวเลือกเพิ่มเติม" aria-haspopup="menu" aria-expanded="false"><span aria-hidden="true">⋮</span></button><div class="item-menu" role="menu" hidden>' +
      button(
        "edit-item",
        '<svg class="item-menu-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z"/></svg><span>แก้ไข</span>',
        item.id,
        "item-menu-option",
      ) +
      button(
        "shopping-from-item",
        paperPlusLabel("เพิ่มไปในรายการซื้อ"),
        item.id,
        "item-menu-option",
      ) +
      button(
        "confirm-remove-item",
        '<svg class="item-menu-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="m19 6-1 14H6L5 6"/><path d="M10 11v5m4-5v5"/></svg><span>ลบรายการ</span>',
        item.id,
        "item-menu-option danger",
      ) +
      "</div></div>";
  }
  const date = shopping
    ? ""
    : '<div class="meta ' +
      (daysLeft(item.date) <= 0 ? "warn" : "") +
      '">' +
      esc(dateLabel(item)) +
      "</div>";
  return (
    '<article class="line-item">' +
    thumb(item) +
    '<div class="item-info"><div class="item-name">' +
    esc(item.name) +
    ' <span class="qty">· ' +
    esc(detail) +
    "</span></div>" +
    date +
    '<div class="meta' +
    (shopping ? "" : " item-badges") +
    '">' +
    (shopping ? esc(meta) : meta) +
    '</div></div><div class="item-actions">' +
    actions +
    "</div></article>"
  );
}
function totalFor(item) {
  return round(
    stock.items
      .filter(
        (i) => key(i.name) === key(item.name) && key(i.unit) === key(item.unit),
      )
      .reduce((sum, i) => sum + i.qty, 0),
  );
}
function section(title, items, options = {}) {
  return (
    '<section class="section"><div class="section-head ' +
    (options.urgent ? "urgent" : "") +
    '"><h2>' +
    esc(title) +
    "</h2><span>" +
    items.length +
    " รายการ</span></div>" +
    items.map((i) => row(i, options.shopping)).join("") +
    "</section>"
  );
}
function empty(title, description, action = "", label = "") {
  return (
    '<section class="empty"><h2>' +
    esc(title) +
    "</h2><p>" +
    esc(description) +
    "</p>" +
    (action ? button(action, label, "", "secondary") : "") +
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
              key(item.name) === key(ingredient.name) &&
              key(item.unit) === key(ingredient.unit),
          )
          .reduce((sum, item) => sum + item.qty, 0),
      );
      return { ...ingredient, missing: round(ingredient.qty - available) };
    })
    .filter((ingredient) => ingredient.missing > 0.0001);
}

function shortageDropdown(planId) {
  return (
    '<details class="shortage-dropdown"><summary class="secondary">เพิ่มของที่ขาด</summary><div class="shortage-dropdown-menu" role="menu">' +
    button(
      "add-shortages-inventory",
      "เพิ่มของในบ้าน",
      planId,
      "shortage-menu-option",
    ) +
    button(
      "add-shortages-shopping",
      "จดรายการซื้อ",
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
            "เพิ่มเข้ารายการปรุงสุก",
            plan.id,
            "secondary",
          )
        : "") + button("complete-meal-plan", "เสร็จสิ้น", plan.id, "primary");
  }
  const statusLabel =
    plan.status === "completed"
      ? "เสร็จสิ้นแล้ว"
      : plan.status === "cooked"
        ? "ทำแล้ว"
        : "วางแผน";
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
              esc(item.name) +
              " " +
              amountFormat.format(item.missing) +
              " " +
              esc(item.unit),
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
                "เพิ่มเข้ารายการปรุงสุก",
                plan.id,
                "secondary",
              )
            : "") +
          button("complete-meal-plan", "เสร็จสิ้น", plan.id, "primary")
        : "") +
    button("remove-meal-plan", "ลบแผน", plan.id, "text-button danger");
  const statusLabel =
    plan.status === "completed"
      ? "เสร็จสิ้นแล้ว"
      : plan.status === "cooked"
        ? "ทำแล้ว"
        : "วางแผน";
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
              esc(item.name) +
              " " +
              amountFormat.format(item.missing) +
              " " +
              esc(item.unit),
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
    button("plan-recipe", "วางแผนเมนูนี้", recipe.id, "primary") +
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
      ? '<div class="' +
        listClass +
        '">' +
        items.map(renderItem).join("") +
        "</div>"
      : '<p class="meal-page-empty">' + esc(emptyMessage) + "</p>") +
    "</section>"
  );
}

function expiryCalendar(items, plans = stock?.mealPlans || []) {
  const firstDay = new Date(calendarYear, calendarMonth, 1);
  const daysInMonth = new Date(calendarYear, calendarMonth + 1, 0).getDate();
  const today = new Date();
  const todayKey = calendarDateKey(
    today.getFullYear(),
    today.getMonth(),
    today.getDate(),
  );
  const counts = new Map();
  const planCounts = new Map();
  for (const item of items) {
    if (!item.date || item.dateKind !== "expiry") continue;
    counts.set(item.date, (counts.get(item.date) || 0) + 1);
  }
  for (const plan of plans) {
    if (plan.status !== "planned") continue;
    planCounts.set(plan.date, (planCounts.get(plan.date) || 0) + 1);
  }

  const weekdays = ["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"];
  let cells = weekdays
    .map((day) => '<span class="calendar-weekday">' + day + "</span>")
    .join("");
  const leadingDays = firstDay.getDay();
  const gridDays = Math.ceil((leadingDays + daysInMonth) / 7) * 7;
  for (let index = 0; index < gridDays; index++) {
    const date = new Date(
      calendarYear,
      calendarMonth,
      index - leadingDays + 1,
      12,
    );
    const dateYear = date.getFullYear();
    const dateMonth = date.getMonth();
    const day = date.getDate();
    const dateKey = calendarDateKey(dateYear, dateMonth, day);
    const count = counts.get(dateKey) || 0;
    const mealCount = planCounts.get(dateKey) || 0;
    const countBadges = [
      count &&
        '<span class="calendar-day-count calendar-expiry-count" aria-label="หมดอายุ ' +
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
      esc(
        dateLabel +
          ", หมดอายุ " +
          count +
          " รายการ, แผนทำอาหาร " +
          mealCount +
          " เมนู",
      ) +
      '" aria-pressed="' +
      selected +
      '"' +
      (dateKey === todayKey ? ' aria-current="date"' : "") +
      '"><span class="calendar-day-number">' +
      day +
      "</span>" +
      (countBadges
        ? '<span class="calendar-day-counts">' + countBadges + "</span>"
        : "") +
      "</button>";
  }

  let details = "";
  if (selectedCalendarDate) {
    const selectedItems = items.filter(
      (item) =>
        item.dateKind === "expiry" && item.date === selectedCalendarDate,
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
      '<div class="calendar-details" aria-live="polite"><section class="calendar-detail-group"><h3>หมดอายุวันที่ ' +
      esc(selectedLabel) +
      " · " +
      selectedItems.length +
      " รายการ</h3>" +
      (selectedItems.length
        ? selectedItems.map((item) => row(item)).join("")
        : '<p class="calendar-no-expiry">ไม่มีของหมดอายุวันนี้</p>') +
      '</section><section class="calendar-detail-group"><h3>แผนทำอาหาร · ' +
      selectedPlans.length +
      " เมนู</h3>" +
      (selectedPlans.length
        ? '<div class="meal-plan-list">' +
          selectedPlans.map(mealPlanCard).join("") +
          "</div>"
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
      "＋ วางแผนทำอาหาร",
      selectedCalendarDate || todayKey,
      "secondary calendar-add-plan",
    ) +
    '</div><div class="calendar-legend"><span><i class="calendar-legend-expiry"></i>วันหมดอายุ</span><span><i class="calendar-legend-meal"></i>แผนทำอาหาร</span></div><div class="calendar-grid">' +
    cells +
    "</div>" +
    details +
    "</section>"
  );
}

function draw() {
  if (!stock) return;
  const page = tab();
  $(".tabs")
    .querySelectorAll("[data-tab]")
    .forEach((link) => {
      if (link.dataset.tab === page) link.setAttribute("aria-current", "page");
      else link.removeAttribute("aria-current");
    });
  const today = new Date();
  const todayKey = calendarDateKey(
    today.getFullYear(),
    today.getMonth(),
    today.getDate(),
  );
  lastDrawDay = today.toDateString();
  $("#date-label").textContent = new Intl.DateTimeFormat("th-TH", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(today);
  $("#screen-title").textContent = titles[page];
  $("#page-add").innerHTML =
    page === "shopping"
      ? paperPlusLabel("จดรายการซื้อ")
      : page === "meals"
        ? '<span aria-hidden="true">🍲</span> วางแผนทำอาหาร'
        : page === "recipes"
          ? "＋ เพิ่มเมนู"
          : '<span aria-hidden="true">＋</span> เพิ่มของ';
  $("#page-add").dataset.action =
    page === "shopping"
      ? "new-shopping"
      : page === "meals"
        ? "add-meal-plan"
        : page === "recipes"
          ? "add-recipe"
          : "add";
  if (page === "meals")
    $("#page-add").dataset.id = selectedCalendarDate || todayKey;
  else delete $("#page-add").dataset.id;
  $("#shopping-count").textContent = stock.shopping.length;
  $("#tools").hidden = page !== "stock";
  const sorted = [...stock.items].sort(byDate);
  let html = "";
  if (page === "today") {
    const late = sorted.filter(
      (i) => i.dateKind !== "plan" && daysLeft(i.date) < 0,
    );
    const due = sorted.filter(
      (i) =>
        i.dateKind !== "plan" && daysLeft(i.date) >= 0 && daysLeft(i.date) <= 7,
    );
    const planned = sorted.filter(
      (i) => i.dateKind === "plan" && daysLeft(i.date) <= 7,
    );
    if (late.length)
      html += section("เลยวันหมดอายุแล้ว", late, { urgent: true });
    if (due.length) html += section("หมดอายุภายใน 7 วัน", due);
    if (planned.length) html += section("ตั้งใจใช้ภายในสัปดาห์นี้", planned);
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
    html += expiryCalendar(sorted, stock.mealPlans || []);
  } else if (page === "stock") {
    const roomsSelect = $("#location-filter"),
      selected = roomsSelect.value;
    const locations = [
      ...new Set(sorted.map((i) => i.location).filter(Boolean)),
    ].sort((a, b) => a.localeCompare(b, "th"));
    roomsSelect.innerHTML =
      '<option value="">ทุกที่เก็บ</option>' +
      locations.map((x) => "<option>" + esc(x) + "</option>").join("");
    if (locations.includes(selected)) roomsSelect.value = selected;
    refreshSearchSelect(roomsSelect);
    const query = key($("#query").value);
    const filtered = sorted.filter(
      (i) =>
        (!query || key(i.name + " " + i.location).includes(query)) &&
        (!$("#category-filter").value ||
          i.category === $("#category-filter").value) &&
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
          esc(
            amountFormat.format(filtered.reduce((sum, i) => sum + i.qty, 0)),
          ) +
          " " +
          esc(filtered[0].unit) +
          "</p>";
      }
      html += section("เรียงตามวันที่ใกล้ที่สุด", filtered);
    } else
      html = sorted.length
        ? empty(
            "ไม่พบของที่ตรงกัน",
            "ลองเปลี่ยนชื่อ หมวด หรือที่เก็บ",
            "clear-filter",
            "ล้างตัวกรอง",
          )
        : empty(
            "ยังไม่มีของในบ้าน",
            "เพิ่มของสด ของแห้ง หรือของใช้อื่น ๆ ที่ต้องการติดตาม",
            "add",
            "เพิ่มของชิ้นแรก",
          );
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
  $("#content").innerHTML = html;
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
      .find(
        (node) => node.nodeType === Node.TEXT_NODE && node.textContent.trim(),
      )
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
  toggle.innerHTML =
    '<span class="search-select-chevron" aria-hidden="true"></span>';

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
      select.id === "category-filter" || select.id === "f-category"
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
              (badgeType
                ? valueBadge(option.textContent, badgeType)
                : esc(option.textContent)) +
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
    select.dispatchEvent(new Event("change", { bubbles: true }));
    close();
  }

  input.addEventListener("focus", show);
  input.addEventListener("click", show);
  input.addEventListener("blur", close);
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
  toggle.addEventListener("pointerdown", (event) => event.preventDefault());
  toggle.addEventListener("click", () => {
    if (open) close();
    else {
      input.focus();
      show();
    }
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
  const options = [
    ...new Set([...datalist.options].map((option) => option.value)),
  ];
  if (!options.length) return;
  input.dataset.searchList = "true";
  input.removeAttribute("list");
  input.setAttribute("autocomplete", "off");
  const label = input.closest("label");
  const labelName =
    label?.querySelector(":scope > span")?.textContent.trim() ||
    [...(label?.childNodes || [])]
      .find(
        (node) => node.nodeType === Node.TEXT_NODE && node.textContent.trim(),
      )
      ?.textContent.trim() ||
    "ตัวเลือก";
  const listId = "search-suggestions-" + ++selectId;
  const root = document.createElement("div");
  root.className = "search-select search-autocomplete";
  input.classList.add("search-select-input");
  input.setAttribute("role", "combobox");
  input.setAttribute("aria-autocomplete", "list");
  input.setAttribute("aria-haspopup", "listbox");
  input.setAttribute("aria-expanded", "false");
  input.setAttribute("aria-controls", listId);
  input.setAttribute("aria-label", "ค้นหา" + labelName);

  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.className = "search-select-toggle";
  toggle.setAttribute("aria-label", "แสดงคำแนะนำ " + labelName);
  toggle.setAttribute("aria-expanded", "false");
  toggle.innerHTML =
    '<span class="search-select-chevron" aria-hidden="true"></span>';
  const panel = document.createElement("div");
  panel.className = "search-select-panel";
  panel.hidden = true;
  const list = document.createElement("div");
  list.id = listId;
  list.className = "search-select-options";
  list.setAttribute("role", "listbox");
  panel.append(list);

  input.replaceWith(root);
  root.append(input, toggle, panel);
  datalist.remove();
  let open = false;
  let activeIndex = -1;
  let visibleOptions = [];

  function renderOptions(query = input.value) {
    const normalized = key(query);
    const badgeType = input.id === "f-location" ? "location" : null;
    visibleOptions = options.filter((option) =>
      key(option).includes(normalized),
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
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
    close();
  }

  input.addEventListener("focus", show);
  input.addEventListener("click", show);
  input.addEventListener("blur", close);
  input.addEventListener("input", () => {
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
  toggle.addEventListener("pointerdown", (event) => event.preventDefault());
  toggle.addEventListener("click", () => {
    if (open) close();
    else {
      input.focus();
      show();
    }
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
  const names = [...new Set(stock.items.map((i) => i.name))];
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
    opts([
      ...new Set([
        ...rooms,
        ...stock.items.map((i) => i.location).filter(Boolean),
      ]),
    ]) +
    "</datalist></label>" +
    '<label>ติดตามวันที่<select id="f-kind"><option value="expiry"' +
    (data.dateKind === "expiry" ? " selected" : "") +
    '>วันหมดอายุ</option><option value="plan"' +
    (data.dateKind === "plan" ? " selected" : "") +
    ">ตั้งใจใช้ภายใน</option></select></label>" +
    '<label>วันที่ (ถ้ามี)<input id="f-date" type="date" value="' +
    esc(data.date) +
    '"></label>' +
    '<div class="span photo-edit"><label>รูปภาพ (ถ้ามี)<input type="file" id="f-photo" accept="image/*"></label><div id="photo-preview"></div></div></div>'
  );
}

function mealIngredientRow(item = {}) {
  const rowId = item.id || crypto.randomUUID();
  const names = [...new Set(stock.items.map((entry) => entry.name))];
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
  const nameList = "meal-name-options-" + rowId;
  const unitList = "meal-unit-options-" + rowId;
  return (
    '<div class="meal-ingredient-row" data-ingredient-id="' +
    esc(rowId) +
    '"><label>วัตถุดิบ<input class="meal-ingredient-name" required autocomplete="off" maxlength="80" list="' +
    nameList +
    '" value="' +
    esc(item.name || "") +
    '"></label><datalist id="' +
    nameList +
    '">' +
    opts(names) +
    '</datalist><label>จำนวน<input class="meal-ingredient-qty" required type="number" inputmode="decimal" min=".001" max="999999" step=".001" value="' +
    esc(item.qty ?? 1) +
    '"></label><label>หน่วย<input class="meal-ingredient-unit" required autocomplete="off" maxlength="20" list="' +
    unitList +
    '" value="' +
    esc(item.unit || "ชิ้น") +
    '"></label><datalist id="' +
    unitList +
    '">' +
    opts(units) +
    '</datalist><button type="button" class="meal-remove-ingredient text-button danger" data-action="remove-meal-ingredient" aria-label="ลบวัตถุดิบ">×</button></div>'
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
  const templateSaveLabel = templateId
    ? "อัปเดตเมนูต้นแบบด้วย"
    : "บันทึกเมนูนี้ไว้ใช้ครั้งต่อไป";
  return (
    '<div class="form-grid"><label class="span">เริ่มจากเมนูที่บันทึกไว้<select id="meal-template"><option value="">สร้างแผนใหม่</option>' +
    templateOptions +
    '</select></label><label class="span">ชื่อเมนู<input required id="meal-name" maxlength="80" value="' +
    esc(name) +
    '"></label><label>วันที่ทำเมนู<input required id="meal-date" type="date" value="' +
    esc(plan?.date || defaultDate) +
    '"></label><label>จำนวนเสิร์ฟ<input required id="meal-servings" type="number" min="1" max="100" step="1" value="' +
    servings +
    '"></label><div class="span"><div class="section-head"><h3>วัตถุดิบ</h3></div><div class="meal-ingredient-list" id="meal-ingredients">' +
    ingredients.map(mealIngredientRow).join("") +
    '</div><button type="button" class="secondary meal-add-ingredient" data-action="add-meal-ingredient">＋ เพิ่มวัตถุดิบ</button></div><label class="span meal-template-save"><input id="meal-save-template" type="checkbox"><span id="meal-template-save-label">' +
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
    '</div><button type="button" class="secondary meal-add-ingredient" data-action="add-meal-ingredient">＋ เพิ่มวัตถุดิบ</button></div></div>'
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

function startMealEditor(
  plan = null,
  date = selectedCalendarDate,
  recipeId = "",
) {
  if (!stock || busy) return;
  mealDraft = {
    mode: "plan",
    planId: plan?.id || "",
    version: stock.version,
    stale: false,
  };
  const today = new Date();
  const defaultDate =
    date ||
    calendarDateKey(today.getFullYear(), today.getMonth(), today.getDate());
  $("#meal-editor-title").textContent = plan
    ? "แก้ไขแผนทำอาหาร"
    : "วางแผนทำอาหาร";
  $("#meal-error").textContent = "";
  $("#meal-save").textContent = plan ? "บันทึกแผน" : "วางแผน";
  $("#meal-save").disabled = false;
  $("#meal-fields").innerHTML = mealEditorFields(plan, defaultDate, recipeId);
  enhanceSelects($("#meal-fields"));
  enhanceDatalists($("#meal-fields"));
  if (!$("#meal-editor").open) $("#meal-editor").showModal();
}

function mealFormIngredients() {
  const rows = [
    ...$("#meal-ingredients").querySelectorAll(".meal-ingredient-row"),
  ];
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
  $("#meal-save").disabled = true;
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
    if (conflict || error.status === 0 || error.status >= 500)
      await refresh(true);
    if ($("#meal-editor").open) {
      $("#meal-error").textContent = message;
      if (conflict) mealDraft.stale = true;
    } else if (stock) alertUser(message);
  } finally {
    busy = false;
    if ($("#meal-editor").open)
      $("#meal-save").disabled = Boolean(mealDraft?.stale);
  }
}

$("#meal-fields").addEventListener("change", (event) => {
  if (event.target.id !== "meal-template") return;
  const recipe = stock.recipes?.find((item) => item.id === event.target.value);
  if (!recipe) {
    $("#meal-template-save-label").textContent =
      "บันทึกเมนูนี้ไว้ใช้ครั้งต่อไป";
    return;
  }
  $("#meal-name").value = recipe.name;
  $("#meal-servings").value = recipe.servings;
  $("#meal-ingredients").innerHTML = recipe.ingredients
    .map(mealIngredientRow)
    .join("");
  $("#meal-save-template").checked = false;
  $("#meal-template-save-label").textContent = "อัปเดตเมนูต้นแบบด้วย";
  enhanceDatalists($("#meal-ingredients"));
});

$("#meal-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!mealDraft || mealDraft.stale || busy) return;
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
    if (
      !name ||
      !Number.isInteger(servings) ||
      servings < 1 ||
      servings > 100
    ) {
      $("#meal-error").textContent = "กรุณาตรวจชื่อเมนูและจำนวนเสิร์ฟ (1-100)";
      return;
    }
    await mealMutation(
      (next) => {
        next.recipes ||= [];
        const current = next.recipes.find(
          (recipe) => recipe.id === mealDraft.recipeId,
        );
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
  if (
    !name ||
    !date ||
    !Number.isInteger(servings) ||
    servings < 1 ||
    servings > 100
  ) {
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
      const existing = next.mealPlans.find(
        (item) => item.id === mealDraft.planId,
      );
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
  ++generation;
  if (previewUrl) URL.revokeObjectURL(previewUrl);
  previewUrl = "";
  const base = {
    name: "",
    qty: 1,
    unit: "ชิ้น",
    category: "อื่น ๆ",
    location: "",
    date: "",
    dateKind: "expiry",
    photo: null,
    ...data,
  };
  draft = {
    mode,
    sourceId,
    mealPlanId: base.mealPlanId || "",
    initial: base,
    version: stock.version,
    photo: base.photo,
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
    fields =
      "<p>ลบแผนทำอาหาร <strong>“" + esc(base.name) + "”</strong> ใช่ไหม</p>";
  else if (mode === "remove-recipe")
    fields =
      "<p>ลบเมนูต้นแบบ <strong>“" + esc(base.name) + "”</strong> ใช่ไหม</p>";
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

function renderPhoto() {
  const holder = $("#photo-preview");
  if (!holder) return;
  const src =
    previewUrl ||
    (draft.photo ? "/api/photo?id=" + encodeURIComponent(draft.photo) : "");
  holder.innerHTML = src
    ? '<img alt="รูปของที่เลือก" src="' +
      esc(src) +
      '">' +
      button("remove-photo", "ลบรูป", "", "text-button")
    : "";
}
async function jpeg(file) {
  if (file.size > 25 * 1024 * 1024)
    throw new Error("กรุณาเลือกรูปขนาดไม่เกิน 25 MB");
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode().catch(() => {
      throw new Error("อ่านไฟล์รูปนี้ไม่ได้ กรุณาลองใช้ JPEG, PNG หรือ WebP");
    });
    const canvas = document.createElement("canvas");
    const scale = Math.min(
      1,
      1200 / Math.max(img.naturalWidth, img.naturalHeight),
    );
    canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    for (const quality of [0.84, 0.68, 0.51, 0.35, 0.22]) {
      const blob = await new Promise((resolve) =>
        canvas.toBlob(resolve, "image/jpeg", quality),
      );
      if (blob && blob.size <= 450000) return blob;
    }
    throw new Error("ย่อรูปไม่ได้ กรุณาเลือกรูปขนาดเล็กลง");
  } finally {
    URL.revokeObjectURL(url);
  }
}

function populateKnown() {
  if (!draft || !["add", "new-shopping"].includes(draft.mode)) return;
  const known = [...stock.items]
    .reverse()
    .find((i) => key(i.name) === key($("#f-name").value));
  if (!known) return;
  if ($("#f-unit").value === "ชิ้น") $("#f-unit").value = known.unit;
  if ($("#f-location") && !$("#f-location").value)
    $("#f-location").value = known.location;
  if ($("#f-category") && $("#f-category").value === "อื่น ๆ")
    $("#f-category").value = known.category;
}

$("#fields").addEventListener("change", async (event) => {
  if (event.target.id === "f-name") populateKnown();
  if (event.target.id !== "f-photo" || !event.target.files[0] || !draft) return;
  const editing = draft,
    token = ++editing.photoTask;
  editing.processing = true;
  $("#save").disabled = true;
  $("#form-error").textContent = "กำลังเตรียมรูป…";
  try {
    const blob = await jpeg(event.target.files[0]);
    if (draft !== editing || editing.photoTask !== token) return;
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    previewUrl = URL.createObjectURL(blob);
    editing.blob = blob;
    editing.photo = null;
    $("#form-error").textContent = "";
    renderPhoto();
  } catch (error) {
    if (draft === editing && editing.photoTask === token)
      $("#form-error").textContent = error.message;
  } finally {
    if (draft === editing && editing.photoTask === token) {
      editing.processing = false;
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
  return {
    ...item,
    id: draft.mode === "receive" ? crypto.randomUUID() : item.id,
    category: $("#f-category").value,
    location: $("#f-location").value.trim(),
    date: $("#f-date").value,
    dateKind: $("#f-kind").value,
    photo: draft.photo,
  };
}

async function mutation(change, expected, done) {
  if (busy || !stock) return;
  const inDialog = $("#editor").open;
  busy = true;
  ++generation;
  if (inDialog) $("#save").disabled = true;
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
    if (conflict || error.status === 0 || error.status >= 500)
      await refresh(true);
    if (inDialog && $("#editor").open) {
      $("#form-error").textContent = message;
      if (conflict || (draft && draft.version !== stock?.version))
        draft.stale = true;
    } else if (stock) alertUser(message);
  } finally {
    busy = false;
    if ($("#editor").open)
      $("#save").disabled = Boolean(draft?.stale || draft?.processing);
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
          const response = await fetch(
            "/api/photo?id=" + encodeURIComponent(item.photo),
            { cache: "no-store" },
          );
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
        !item.photo ||
        removedPhoto ||
        stock.items.some((i) => i.photo === item.photo);
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
          "ใช้ " +
            item.name +
            " ไป " +
            amountFormat.format(qty) +
            " " +
            item.unit,
          undo,
          "ย้อนกลับ",
        );
    },
  );
}

$("#editor-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!draft || draft.processing || draft.stale || busy) return;
  const { mode, sourceId, version, initial } = draft;
  $("#form-error").textContent = "";
  if (mode === "use")
    return consume(initial, Number($("#f-used").value), version);
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
        next.recipes = (next.recipes || []).filter(
          (recipe) => recipe.id !== sourceId,
        );
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
      if (mode === "edit-item")
        next.items = next.items.map((i) => (i.id === sourceId ? item : i));
      else next.items.push(item);
      if (draft.mealPlanId) {
        const plan = next.mealPlans?.find(
          (entry) => entry.id === draft.mealPlanId,
        );
        if (!plan || plan.status !== "cooked" || plan.cookedItemCreated)
          throw new Error(
            "แผนนี้ถูกเพิ่มเข้ารายการปรุงสุกแล้ว กรุณาโหลดข้อมูลใหม่",
          );
        plan.status = "completed";
        plan.cookedItemCreated = true;
      }
      if (mode === "receive")
        next.shopping = next.shopping.filter((i) => i.id !== sourceId);
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

function addMealShortagesToShopping(plan) {
  if (!plan) return;
  const missing = mealShortages(plan);
  if (!missing.length) return alertUser("วัตถุดิบของเมนูนี้มีครบแล้ว");
  mutation(
    async (next) => {
      for (const ingredient of missing) {
        next.shopping = addShopping(next.shopping, {
          id: crypto.randomUUID(),
          name: ingredient.name,
          unit: ingredient.unit,
          qty: ingredient.missing,
        });
      }
    },
    stock.version,
    () => alertUser("เพิ่มวัตถุดิบที่ขาดในรายการซื้อแล้ว"),
  );
}

function addMealShortagesToInventory(plan) {
  if (!plan) return;
  const missing = mealShortages(plan);
  if (!missing.length) return alertUser("วัตถุดิบของเมนูนี้มีครบแล้ว");
  mutation(
    async (next) => {
      for (const ingredient of missing) {
        next.items.push({
          id: crypto.randomUUID(),
          name: ingredient.name,
          qty: ingredient.missing,
          unit: ingredient.unit,
          category: "อื่น ๆ",
          location: "",
          date: "",
          dateKind: "expiry",
          photo: null,
        });
      }
    },
    stock.version,
    () => alertUser("เพิ่มวัตถุดิบที่ขาดในของในบ้านแล้ว"),
  );
}

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
      () => addMealShortagesToShopping(plan),
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
              key(item.name) === key(ingredient.name) &&
              key(item.unit) === key(ingredient.unit),
          )
          .sort((a, b) => {
            const dateA = a.dateKind === "expiry" ? a.date || "9999" : "9999";
            const dateB = b.dateKind === "expiry" ? b.date || "9999" : "9999";
            return (
              dateA.localeCompare(dateB) || a.name.localeCompare(b.name, "th")
            );
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
    createCookedStock
      ? null
      : () => alertUser(plan.name + " ทำเสร็จแล้ว และตัดวัตถุดิบจากสต็อกแล้ว"),
  );
  if (
    createCookedStock &&
    stock?.mealPlans?.some(
      (item) => item.id === plan.id && item.status === "cooked",
    )
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
  const action = target.dataset.action,
    id = target.dataset.id;
  const item = stock?.items.find((i) => i.id === id);
  const wanted = stock?.shopping.find((i) => i.id === id);
  const mealPlan = stock?.mealPlans?.find((plan) => plan.id === id);
  const recipe = stock?.recipes?.find((item) => item.id === id);
  if (action === "retry") {
    entry("checking");
    return refresh(true);
  }
  if (action === "logout") {
    busy = true;
    ++generation;
    try {
      await post("session", { logout: true });
      entry("login");
    } catch (error) {
      alertUser(errorText(error));
    } finally {
      busy = false;
    }
    return;
  }
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
  closeItemMenus();
  if (!stock) return;
  if (action === "add-recipe") return startRecipeEditor();
  if (action === "edit-recipe" && recipe) return startRecipeEditor(recipe);
  if (action === "remove-recipe" && recipe)
    return startEditor("remove-recipe", recipe, id);
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
    return addMealShortagesToInventory(mealPlan);
  if (action === "add-shortages-shopping" && mealPlan)
    return addMealShortagesToShopping(mealPlan);
  if (action === "add-meal-shortages" && mealPlan)
    return addMealShortagesToShopping(mealPlan);
  if (action === "mark-meal-cooked" && mealPlan)
    return finishMealPlan(mealPlan);
  if (
    action === "complete-meal-plan" &&
    mealPlan &&
    mealPlan.status === "cooked"
  ) {
    return mutation(
      async (next) => {
        const current = next.mealPlans.find((plan) => plan.id === id);
        if (current?.status === "cooked") current.status = "completed";
      },
      stock.version,
      () => alertUser("เปลี่ยนสถานะเป็นเสร็จสิ้นแล้ว"),
    );
  }
  if (action === "create-cooked-stock" && mealPlan)
    return finishMealPlan(mealPlan, true);
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
    draw();
    return;
  }
  if (action === "add" || action === "new-shopping") return startEditor(action);
  if (action === "use" && item)
    return consume(item, Math.min(1, item.qty), stock.version);
  if (action === "edit-item" && item) return startEditor(action, item, id);
  if (action === "edit-shopping" && wanted)
    return startEditor(action, wanted, id);
  if (action === "receive" && wanted) {
    const known = stock.items.find(
      (i) =>
        key(i.name) === key(wanted.name) && key(i.unit) === key(wanted.unit),
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
  if (action === "confirm-remove-item" && item)
    return startEditor("remove-item", item, id);
  if (action === "confirm-remove") {
    const isItem = draft.mode === "edit-item";
    return startEditor(
      isItem ? "remove-item" : "remove-shopping",
      draft.initial,
      id,
    );
  }
  if (action === "remove-photo" && draft) {
    draft.photoTask++;
    draft.processing = false;
    $("#save").disabled = false;
    draft.blob = null;
    draft.photo = null;
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
    if (restoreFocus) trigger?.focus();
  });
}

document.addEventListener("pointerdown", (event) => {
  if (!event.target.closest(".item-menu-wrap")) closeItemMenus();
});
document.addEventListener("keydown", (event) => {
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
    const next =
      index < 0 ? 0 : (index + direction + items.length) % items.length;
    items[next]?.focus();
  }
});

$("#query").addEventListener("input", draw);
$("#category-filter").addEventListener("change", draw);
$("#location-filter").addEventListener("change", draw);
window.addEventListener("hashchange", () => {
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
  if (!document.hidden) activeCheck();
});
setInterval(() => {
  if (stock && !document.hidden && Date.now() - lastActive < idleAfter)
    refresh();
}, 60000);
refresh(true);
