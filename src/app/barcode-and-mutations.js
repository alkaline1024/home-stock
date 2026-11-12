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
