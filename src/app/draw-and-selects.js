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
  const shoppingCount = $("#shopping-count");
  if (shoppingCount.dataset.vueMounted === "true")
    shoppingCount.dispatchEvent(
      new CustomEvent("home-stock:shopping-count", { detail: stock.shopping.length }),
    );
  else shoppingCount.textContent = stock.shopping.length;
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
  if (page === "stock" && stock.items.length) html = itemViewToggle(page) + html;
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
