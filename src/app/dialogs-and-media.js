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
