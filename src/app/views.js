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
  if (page === "today") return "grid";
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
function row(item, shopping = false, view = null) {
  let meta, detail, actions;
  const gridMode =
    !shopping && ["today", "stock"].includes(tab()) && (view || getItemView(tab())) === "grid";
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
        ? selectedItems.map((item) => row(item, false, "list")).join("")
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
