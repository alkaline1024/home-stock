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
    '<label>จำนวน<input data-field="qty" type="number" inputmode="decimal" min="0.001" max="999999" step="0.001" value="' +
    esc(row.qty ?? 1) +
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
    '"><span class="form-help">เว้นว่างเพื่อใช้ค่าเริ่มต้นจาก Settings · ใส่ 0 เพื่อเตือนในวันที่กำหนด · ใช้กับ EXP/BBE และต้องตั้งค่าการแจ้งเตือนใน Settings บนอุปกรณ์นี้</span></label></div>';
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
      (percent, message) => {
        progress.textContent = message || "กำลังอ่านใบเสร็จ " + percent + "%";
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
        barcode: row.barcode || previous?.barcode || "",
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
