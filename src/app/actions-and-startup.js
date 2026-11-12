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
    const menu =
      target.querySelector(".item-menu") ||
      [...document.querySelectorAll(".item-menu-viewport")].find(
        (entry) => entry._gridCard === target,
      );
    if (!menu) return;
    const shouldOpen = menu.hidden;
    closeItemMenus();
    if (shouldOpen) {
      menu._gridCard = target;
      menu._gridParent = menu.parentNode;
      menu._gridNext = menu.nextSibling;
      document.body.append(menu);
      menu.hidden = false;
      target.setAttribute("aria-expanded", "true");
      target.classList.add("menu-open");
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
    const trigger =
      menu._gridCard?.querySelector(".item-menu-trigger") ||
      menu.parentElement.querySelector(".item-menu-trigger");
    menu.hidden = true;
    trigger?.setAttribute("aria-expanded", "false");
    const card = menu._gridCard || menu.closest(".is-grid-card");
    card?.setAttribute("aria-expanded", "false");
    card?.classList.remove("menu-open");
    if (menu._gridParent) {
      menu._gridParent.insertBefore(menu, menu._gridNext);
      menu.classList.remove("item-menu-viewport");
      menu.style.left = "";
      menu.style.top = "";
      delete menu._gridCard;
      delete menu._gridParent;
      delete menu._gridNext;
    }
    if (restoreFocus) (menu.closest(".is-grid-card") || trigger)?.focus();
  });
}

function positionHorizontalCardMenu(menu, card) {
  if (!card.classList.contains("is-grid-card")) return;
  menu.classList.add("item-menu-viewport");
  const cardRect = card.getBoundingClientRect();
  const menuRect = menu.getBoundingClientRect();
  const margin = 8;
  const maxLeft = Math.max(margin, window.innerWidth - menuRect.width - margin);
  const left = Math.max(margin, Math.min(cardRect.left, maxLeft));
  const maxTop = Math.max(margin, window.innerHeight - menuRect.height - margin);
  let top = cardRect.bottom + margin;
  if (top > maxTop) top = cardRect.top - menuRect.height - margin;
  top = Math.max(margin, Math.min(top, maxTop));
  menu.style.left = left + "px";
  menu.style.top = top + "px";
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
async function startApplication() {
  if (typeof navigator !== "undefined" && "serviceWorker" in navigator) {
    try {
      await navigator.serviceWorker.register("/sw.js");
      if (!navigator.serviceWorker.controller) {
        await new Promise((resolve) => {
          const finish = () => {
            navigator.serviceWorker.removeEventListener("controllerchange", finish);
            clearTimeout(timer);
            resolve();
          };
          const timer = setTimeout(finish, 2000);
          navigator.serviceWorker.addEventListener("controllerchange", finish);
          if (navigator.serviceWorker.controller) finish();
        });
      }
    } catch {
      // Browsers without service workers can still load photos normally.
    }
  }
  refresh(true);
}
startApplication();
