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
