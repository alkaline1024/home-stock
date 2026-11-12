async function loadExcelJS() {
  if (window.ExcelJS) return window.ExcelJS;
  if (!excelJsPromise) {
    excelJsPromise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "/exceljs.min.js";
      script.onload = () =>
        window.ExcelJS ? resolve(window.ExcelJS) : reject(new Error("โหลด ExcelJS ไม่สำเร็จ"));
      script.onerror = () => {
        script.remove();
        reject(new Error("โหลด ExcelJS ไม่สำเร็จ กรุณาลองอีกครั้ง"));
      };
      document.head.append(script);
    }).catch((error) => {
      excelJsPromise = null;
      throw error;
    });
  }
  return excelJsPromise;
}

async function downloadStockTemplate() {
  const ExcelJS = await loadExcelJS();
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "home-stock";
  const sheet = workbook.addWorksheet("นำเข้าของ");
  const options = workbook.addWorksheet("Lists");
  options.state = "hidden";

  const lists = [
    ["ItemNames", [...new Set((stock.items || []).map((item) => item.name).filter(Boolean))]],
    [
      "UnitOptions",
      [
        ...new Set([
          "ชิ้น",
          "กล่อง",
          "ถุง",
          "ฟอง",
          "ขวด",
          "แพ็ก",
          "กก.",
          "ลิตร",
          "ที่",
          ...stock.items.map((item) => item.unit),
        ]),
      ],
    ],
    ["CategoryOptions", categories],
    [
      "LocationOptions",
      [...new Set([...rooms, ...(stock.items || []).map((item) => item.location)])]
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b, "th")),
    ],
    ["DateKindOptions", ["(EXP : วันหมดอายุ)", "(BBE : ควรบริโภคก่อน)", "ตั้งใจใช้ภายใน"]],
  ];
  const listColumns = ["A", "B", "C", "D", "E"];
  for (const [index, [name, values]] of lists.entries()) {
    const column = listColumns[index];
    const choices = values.length ? values : [""];
    choices.forEach((value, row) => {
      options.getCell(row + 1, index + 1).value = value;
    });
    workbook.definedNames.add(`Lists!$${column}$1:$${column}$${choices.length}`, name);
  }

  sheet.columns = [
    { width: 28 },
    { width: 13 },
    { width: 16 },
    { width: 20 },
    { width: 22 },
    { width: 18 },
    { width: 22 },
    { width: 28 },
  ];
  sheet.getRow(1).values = stockImportHeaders;
  sheet.views = [{ state: "frozen", ySplit: 1 }];
  sheet.autoFilter = { from: "A1", to: "H1" };
  sheet.getRow(1).height = 24;
  sheet.getRow(1).eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF235242" },
    };
    cell.alignment = { vertical: "middle" };
  });

  const validations = [
    [1, "ItemNames", true, false],
    [3, "UnitOptions", true, false],
    [4, "CategoryOptions", true, true],
    [5, "LocationOptions", true, false],
    [7, "DateKindOptions", true, true],
  ];
  for (let row = 2; row <= 2001; row++) {
    for (const [column, name, allowBlank, showErrorMessage] of validations) {
      sheet.getCell(row, column).dataValidation = {
        type: "list",
        allowBlank,
        formulae: [name],
        showErrorMessage,
        errorStyle: showErrorMessage ? "stop" : "warning",
        errorTitle: "ค่าที่ไม่อยู่ในรายการ",
        error: showErrorMessage ? "กรุณาเลือกค่าจาก dropdown" : "เลือกจาก dropdown หรือกรอกค่าใหม่",
      };
    }
    sheet.getCell(row, 2).dataValidation = {
      type: "decimal",
      operator: "between",
      allowBlank: true,
      formulae: [0.001, 999999],
      showErrorMessage: true,
      errorStyle: "stop",
      errorTitle: "จำนวนไม่ถูกต้อง",
      error: "กรอกจำนวนมากกว่า 0 และไม่เกิน 999,999",
    };
    sheet.getCell(row, 6).numFmt = "dd/mm/yyyy";
    sheet.getCell(row, 8).dataValidation = {
      type: "whole",
      operator: "between",
      allowBlank: true,
      formulae: [0, 365],
      showErrorMessage: true,
      errorStyle: "stop",
      errorTitle: "จำนวนวันไม่ถูกต้อง",
      error: "ใส่จำนวนเต็ม 0 ถึง 365 วัน หรือเว้นว่าง",
    };
  }

  const help = workbook.addWorksheet("วิธีกรอก");
  [
    "กรอกข้อมูลในชีต นำเข้าของ โดยไม่เปลี่ยนหัวตาราง",
    "รองรับสูงสุด 2,000 รายการ รวมของที่มีอยู่แล้วในบ้าน",
    "ชื่อของ จำนวน และหน่วย เป็นข้อมูลที่ต้องกรอก",
    "จำนวนมากกว่า 0 ถึง 999999 ทศนิยมไม่เกิน 3 ตำแหน่ง",
    "หน่วยและที่เก็บเลือกจาก dropdown หรือพิมพ์ค่าใหม่ได้",
    "หมวดและติดตามวันที่เลือกจาก dropdown; เว้นว่างใช้ อื่น ๆ และ (EXP : วันหมดอายุ)",
    "แจ้งเตือนก่อนกำหนดใส่จำนวนเต็ม 0 ถึง 365 วัน; เว้นว่างใช้ค่าเริ่มต้นใน Settings",
    "วันที่เว้นว่างได้ หรือกรอกวัน/เดือน/ปี ค.ศ. เช่น 31/12/2026 หรือ 2026-12-31",
    "ไม่รองรับสูตรในเซลล์ กรุณาวางเป็นค่าแทน",
    "นำเข้าเป็นรายการใหม่ ไม่มีรูป และไม่แก้ไขหรือลบรายการเดิม",
    "ตรวจสอบพรีวิวแล้วกดนำเข้า; อัปโหลดไฟล์เดิมซ้ำจะเพิ่มรายการซ้ำ",
  ].forEach((text) => help.addRow([text]));
  help.getColumn(1).width = 110;

  const buffer = await workbook.xlsx.writeBuffer();
  const url = URL.createObjectURL(
    new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = "home-stock-import-template.xlsx";
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function stockImportValue(cell) {
  const value = cell.value;
  if (value === null || value === undefined) return "";
  if (typeof value === "string" || typeof value === "number" || value instanceof Date) return value;
  if (value.richText) return value.richText.map((part) => part.text).join("");
  throw new Error("ไม่รองรับสูตร ลิงก์ หรือค่าผิดพลาดในเซลล์ กรุณาวางเป็นค่า");
}

function stockImportDate(value, date1904 = false) {
  if (value === "" || (typeof value === "string" && !value.trim())) return "";
  let date;
  if (value instanceof Date) {
    if (!Number.isFinite(value.getTime())) throw new Error("วันที่ไม่ถูกต้อง");
    date = value.toISOString().slice(0, 10);
  } else if (typeof value === "number") {
    if (
      !Number.isFinite(value) ||
      value < (date1904 ? 0 : 1) ||
      (!date1904 && Math.floor(value) === 60)
    )
      throw new Error("วันที่ไม่ถูกต้อง");
    const epoch = Date.UTC(date1904 ? 1904 : 1899, date1904 ? 0 : 11, date1904 ? 1 : 31);
    const serial = Math.floor(value);
    const parsed = new Date(epoch + (serial - (!date1904 && serial > 60 ? 1 : 0)) * 86400000);
    if (!Number.isFinite(parsed.getTime())) throw new Error("วันที่ไม่ถูกต้อง");
    date = parsed.toISOString().slice(0, 10);
  } else {
    const text = String(value).trim();
    const parts = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(text);
    date = parts
      ? parts[3] + "-" + parts[2].padStart(2, "0") + "-" + parts[1].padStart(2, "0")
      : text;
  }
  const parsed = new Date(date + "T00:00:00Z");
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
    !Number.isFinite(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== date
  )
    throw new Error("วันที่ไม่ถูกต้อง ใช้วัน/เดือน/ปี ค.ศ. หรือ YYYY-MM-DD");
  return date;
}

function parseStockImport(workbook) {
  const sheet = workbook.getWorksheet("นำเข้าของ");
  if (!sheet) throw new Error("ไม่พบชีต นำเข้าของ กรุณาใช้ไฟล์เทมเพลต");
  const actualHeaders = stockImportHeaders.map((_, index) =>
    stockImportValue(sheet.getCell(1, index + 1)),
  );
  const legacyTemplate =
    legacyStockImportHeaders.every((header, index) => actualHeaders[index] === header) &&
    !actualHeaders[7];
  if (
    !legacyTemplate &&
    stockImportHeaders.some((header, index) => actualHeaders[index] !== header)
  )
    throw new Error("หัวตารางไม่ตรงกับเทมเพลต กรุณาดาวน์โหลดเทมเพลตใหม่");
  if (sheet.rowCount > 10001) throw new Error("ชีตมีแถวมากเกินไป กรุณาใช้เทมเพลตไม่เกิน 2,000 รายการ");
  const items = [],
    errors = [];
  let count = 0;
  for (let row = 2; row <= sheet.rowCount; row++) {
    const cells = (legacyTemplate ? legacyStockImportHeaders : stockImportHeaders).map((_, index) =>
      sheet.getCell(row, index + 1),
    );
    if (
      cells.every(
        (cell) =>
          cell.value === null ||
          cell.value === undefined ||
          (typeof cell.value === "string" && !cell.value.trim()),
      )
    )
      continue;
    count++;
    try {
      const values = cells.map(stockImportValue);
      const text = (index, max, required, label) => {
        if (values[index] instanceof Date) throw new Error(label + "ต้องเป็นข้อความ");
        const value = String(values[index]).trim();
        if ((required && !value) || value.length > max)
          throw new Error(
            label + "ต้อง" + (required ? "ไม่ว่างและ" : "") + "ยาวไม่เกิน " + max + " ตัวอักษร",
          );
        return value;
      };
      const name = text(0, 80, true, "ชื่อของ");
      const quantity = String(values[1]).trim();
      const qty = Number(quantity);
      if (
        !/^(?:\d+(?:\.\d+)?|\.\d+)$/.test(quantity) ||
        !(qty > 0 && qty <= 999999) ||
        Math.abs(qty * 1000 - Math.round(qty * 1000)) > 0.0000001 ||
        Math.round(qty * 1000) === 0
      )
        throw new Error("จำนวนต้องมากกว่า 0 ถึง 999999 ทศนิยมไม่เกิน 3 ตำแหน่ง");
      const unit = text(2, 20, true, "หน่วย");
      const categoryText = text(3, 30, false, "หมวด") || "อื่น ๆ";
      const category = categoryAliases[categoryText] || categoryText;
      if (!categories.includes(category)) throw new Error("หมวดไม่อยู่ในรายการ dropdown");
      const location = text(4, 60, false, "ที่เก็บ");
      const date = stockImportDate(values[5], workbook.properties.date1904);
      const kind = text(6, 40, false, "ติดตามวันที่") || "(EXP : วันหมดอายุ)";
      if (!["วันหมดอายุ", "(EXP : วันหมดอายุ)", "(BBE : ควรบริโภคก่อน)", "ตั้งใจใช้ภายใน"].includes(kind))
        throw new Error("ติดตามวันที่ไม่อยู่ในรายการ dropdown");
      let notifyBeforeDays;
      if (values[7] !== undefined && String(values[7]).trim() !== "") {
        notifyBeforeDays = Number(values[7]);
        if (!Number.isInteger(notifyBeforeDays) || notifyBeforeDays < 0 || notifyBeforeDays > 365)
          throw new Error("แจ้งเตือนก่อนกำหนดต้องเป็นจำนวนเต็ม 0 ถึง 365 วัน");
      }
      items.push({
        id: crypto.randomUUID(),
        name,
        qty: round(qty),
        unit,
        category,
        location,
        date,
        dateKind:
          kind === "ตั้งใจใช้ภายใน"
            ? "plan"
            : kind === "(BBE : ควรบริโภคก่อน)"
              ? "best-before"
              : "expiry",
        photo: null,
        ...(notifyBeforeDays === undefined ? {} : { notifyBeforeDays }),
      });
    } catch (error) {
      errors.push("แถว " + row + ": " + error.message);
    }
  }
  if (!count) throw new Error("ไฟล์ไม่มีรายการให้นำเข้า");
  if (count + stock.items.length > 2000)
    errors.push("รวมของเดิมแล้วเกิน 2,000 รายการ กรุณาลดรายการก่อนนำเข้า");
  return { items, errors, count, version: stock.version, stale: false };
}

async function readStockImport(file) {
  if (!file || busy || !stock) return;
  busy = true;
  ++generation;
  try {
    if (!/\.xlsx$/i.test(file.name)) throw new Error("กรุณาเลือกไฟล์ .xlsx");
    if (file.size > 10 * 1024 * 1024) throw new Error("ไฟล์ Excel ต้องไม่เกิน 10 MB");
    const ExcelJS = await loadExcelJS();
    const workbook = new ExcelJS.Workbook();
    try {
      await workbook.xlsx.load(await file.arrayBuffer());
    } catch {
      throw new Error("อ่านไฟล์ Excel ไม่ได้ ไฟล์อาจเสียหายหรือมีรหัสผ่าน");
    }
    pendingStockImport = parseStockImport(workbook);
    const { items, errors, count } = pendingStockImport;
    $("#excel-import-summary").innerHTML =
      '<p class="excel-import-count">พบ ' +
      count +
      " รายการ · เพิ่มเป็นรายการใหม่ ไม่ทับของเดิม ไม่มีรูป</p>" +
      (errors.length
        ? "<p>กรุณาแก้ไขไฟล์แล้วอัปโหลดใหม่ (" +
          errors.length +
          " ข้อผิดพลาด)</p><ul>" +
          errors
            .slice(0, 10)
            .map((error) => "<li>" + esc(error) + "</li>")
            .join("") +
          "</ul>"
        : "") +
      (items.length
        ? '<div class="excel-preview"><table><thead><tr>' +
          stockImportHeaders.map((header) => "<th>" + esc(header) + "</th>").join("") +
          "</tr></thead><tbody>" +
          items
            .slice(0, 20)
            .map(
              (item) =>
                "<tr>" +
                [
                  item.name,
                  item.qty,
                  item.unit,
                  item.category,
                  item.location,
                  item.date,
                  item.dateKind === "plan"
                    ? "ตั้งใจใช้ภายใน"
                    : item.dateKind === "best-before"
                      ? "(BBE : ควรบริโภคก่อน)"
                      : "(EXP : วันหมดอายุ)",
                  item.notifyBeforeDays ?? "",
                ]
                  .map((value) => "<td>" + esc(value) + "</td>")
                  .join("") +
                "</tr>",
            )
            .join("") +
          "</tbody></table></div>" +
          (items.length > 20 ? "<p>แสดงตัวอย่าง 20 รายการแรก</p>" : "")
        : "");
    $("#excel-import-error").textContent = "";
    $("#excel-import-confirm").disabled = errors.length > 0;
    $("#excel-import-dialog").showModal();
  } catch (error) {
    pendingStockImport = null;
    alertUser(error.message || "อ่านไฟล์นำเข้าไม่ได้");
  } finally {
    busy = false;
    $("#stock-import-file").value = "";
  }
}

$("#stock-import-file").addEventListener("change", (event) =>
  readStockImport(event.target.files[0]),
);
$("#excel-import-dialog").addEventListener("cancel", (event) => {
  if (busy) event.preventDefault();
});
$("#excel-import-dialog").addEventListener("close", () => {
  pendingStockImport = null;
});
$("#excel-import-confirm").addEventListener("click", () => {
  if (!pendingStockImport || pendingStockImport.errors.length || pendingStockImport.stale) return;
  const { items, version } = pendingStockImport;
  mutation(
    async (next) => {
      if (next.items.length + items.length > 2000) throw new Error("รวมของเดิมแล้วเกิน 2,000 รายการ");
      next.items.push(...items);
    },
    version,
    () => {
      $("#excel-import-dialog").close();
      alertUser("นำเข้าของแล้ว " + items.length + " รายการ");
    },
  );
});
