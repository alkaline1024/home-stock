import { HttpError } from "./http.js";

export const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const categories = ["อาหารสด", "อาหารแห้ง", "อื่น ๆ"];
const dateKinds = ["expiry", "plan"];

function fail() {
  throw new HttpError(400, "กรุณาตรวจสอบชื่อ จำนวน หน่วย และวันที่ของรายการ");
}

function shortText(value, limit, optional = false) {
  if (
    typeof value !== "string" ||
    value.length > limit ||
    (!optional && !value.trim())
  )
    fail();
  return value.trim();
}

function row(item, shopping) {
  if (
    !item ||
    typeof item.id !== "string" ||
    !uuid.test(item.id) ||
    typeof item.qty !== "number" ||
    !(item.qty > 0 && item.qty <= 999999)
  )
    fail();
  const scaled = item.qty * 1000;
  if (
    Math.abs(scaled - Math.round(scaled)) > 0.0000001 ||
    Math.round(scaled) === 0
  )
    fail();
  const result = {
    id: item.id,
    name: shortText(item.name, 80),
    qty: item.qty,
    unit: shortText(item.unit, 20),
  };
  if (shopping) return result;
  if (!categories.includes(item.category) || !dateKinds.includes(item.dateKind))
    fail();
  const date = item.date ?? "";
  if (date !== "") {
    if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date)) fail();
    const parsed = new Date(date + "T00:00:00Z");
    if (
      Number.isNaN(parsed.getTime()) ||
      parsed.toISOString().slice(0, 10) !== date
    )
      fail();
  }
  if (
    item.photo !== null &&
    (typeof item.photo !== "string" || !uuid.test(item.photo))
  )
    fail();
  return {
    ...result,
    category: item.category,
    date,
    dateKind: item.dateKind,
    location: shortText(item.location, 60, true),
    photo: item.photo,
  };
}

export function validatedStock(data) {
  if (
    data.version !== null &&
    (typeof data.version !== "string" || !uuid.test(data.version))
  )
    fail();
  const rows = (array, max, shopping) => {
    if (!Array.isArray(array) || array.length > max) fail();
    const result = array.map((item) => row(item, shopping));
    if (new Set(result.map((item) => item.id)).size !== array.length) fail();
    return result;
  };
  return {
    items: rows(data.items, 2000, false),
    shopping: rows(data.shopping, 1000, true),
    version: data.version,
  };
}
