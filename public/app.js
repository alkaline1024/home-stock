"use strict";

const $ = (selector) => document.querySelector(selector);
const categories = ["เนื้อสัตว์", "ผัก", "อาหารสด", "อาหารแห้ง", "อื่น ๆ"];
const rooms = ["ตู้เย็น", "ช่องแช่แข็ง", "ตู้กับข้าว"];
const titles = { today: "วันนี้", stock: "ของในบ้าน", shopping: "รายการซื้อ" };
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
let previewUrl = "";
let noticeAction = null;
let noticeTimer = 0;
let lastDrawDay = "";
let lastActive = Date.now();
let lastReadStarted = 0;
const idleAfter = 5 * 60 * 1000;

function tab() {
  const path = location.hash.slice(1);
  return Object.hasOwn(titles, path) ? path : "today";
}

function localDay(value) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day, 12);
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
    return "บันทึกไม่ได้ กรุณาตรวจชื่อ จำนวน หน่วย และวันที่อีกครั้ง";
  return "ติดต่อบริการไม่สำเร็จ กรุณาลองอีกครั้ง";
}

function entry(mode, message = "") {
  generation++;
  stock = null;
  if ($("#editor").open) $("#editor").close();
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
  if (!force && (busy || $("#editor").open)) return;
  if (!force && Date.now() - lastReadStarted < 3000) return;
  lastReadStarted = Date.now();
  const current = ++generation;
  try {
    const newer = await request("stock");
    if (current !== generation) return;
    if (!Array.isArray(newer.items) || !Array.isArray(newer.shopping))
      throw new Error();
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
  const role = className === "item-menu-option" ? ' role="menuitem"' : "";
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
    อาหารสด: { icon: "🧺", tone: "fresh" },
    อาหารแห้ง: { icon: "🌾", tone: "dry" },
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
      ) +
      button("custom-use", "- ระบุจำนวน", item.id, "action small") +
      '<div class="item-menu-wrap"><button type="button" class="item-menu-trigger" data-action="toggle-item-menu" data-id="' +
      esc(item.id) +
      '" aria-label="ตัวเลือกเพิ่มเติม" aria-haspopup="menu" aria-expanded="false"><span aria-hidden="true">⋮</span></button><div class="item-menu" role="menu" hidden>' +
      button("edit-item", "แก้ไข", item.id, "item-menu-option") +
      button(
        "shopping-from-item",
        "+ เพิ่มไปในรายการซื้อ",
        item.id,
        "item-menu-option",
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
      ? '<span aria-hidden="true">＋</span> จดรายการซื้อ'
      : '<span aria-hidden="true">＋</span> เพิ่มของ';
  $("#page-add").dataset.action = page === "shopping" ? "new-shopping" : "add";
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
  if (mode.startsWith("remove-"))
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
    if (mode === "edit-item")
      fields +=
        '<div class="row-buttons">' +
        button("custom-use", "ระบุจำนวนที่ใช้", sourceId, "secondary") +
        button("shopping-from-item", "จดซื้อเพิ่ม", sourceId, "secondary") +
        button("confirm-remove", "ลบรายการ", sourceId, "text-button danger") +
        "</div>";
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

document.addEventListener("click", async (event) => {
  const target = event.target.closest("[data-action]");
  if (!target || busy) return;
  const action = target.dataset.action,
    id = target.dataset.id;
  const item = stock?.items.find((i) => i.id === id);
  const wanted = stock?.shopping.find((i) => i.id === id);
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
