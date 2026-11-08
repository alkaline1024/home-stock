import { HttpError } from "./http.js";

export const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const categories = [
  "เนื้อสัตว์",
  "ผัก",
  "ของสด",
  "ของแช่แข็ง",
  "ของแห้ง",
  "อาหารปรุงสุก",
  "อื่น ๆ",
];
const categoryAliases = { อาหารสด: "ของสด", อาหารแห้ง: "ของแห้ง" };
const dateKinds = ["expiry", "plan"];

function fail(message = "กรุณาตรวจสอบข้อมูลรายการ") {
  throw new HttpError(400, message);
}

function shortText(value, limit, optional = false, label = "ข้อมูล") {
  if (typeof value !== "string" || value.length > limit)
    fail(label + "ไม่ถูกต้องหรือยาวเกินกำหนด");
  if (!optional && !value.trim()) fail("กรุณากรอก" + label);
  return value.trim();
}

function row(item, shopping) {
  if (
    !item ||
    typeof item.id !== "string" ||
    !uuid.test(item.id)
  )
    fail("รหัสรายการไม่ถูกต้อง");
  if (
    typeof item.qty !== "number" ||
    !(item.qty > 0 && item.qty <= 999999)
  )
    fail("จำนวนต้องมากกว่า 0 และไม่เกิน 999,999");
  const scaled = item.qty * 1000;
  if (
    Math.abs(scaled - Math.round(scaled)) > 0.0000001 ||
    Math.round(scaled) === 0
  )
    fail("จำนวนรองรับทศนิยมไม่เกิน 3 ตำแหน่ง");
  const result = {
    id: item.id,
    name: shortText(item.name, 80, false, "ชื่อของ"),
    qty: item.qty,
    unit: shortText(item.unit, 20, false, "หน่วย"),
  };
  if (shopping) return result;
  const category = categoryAliases[item.category] || item.category;
  const dateKind = item.dateKind ?? "expiry";
  if (!categories.includes(category) || !dateKinds.includes(dateKind))
    fail(
      !categories.includes(category)
        ? "หมวดหมู่ของรายการไม่ถูกต้อง"
        : "ประเภทวันที่ไม่ถูกต้อง",
    );
  const date = item.date ?? "";
  if (date !== "") {
    if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date))
      fail("วันที่ไม่ถูกต้อง กรุณาเลือกวันที่อีกครั้ง");
    const parsed = new Date(date + "T00:00:00Z");
    if (
      Number.isNaN(parsed.getTime()) ||
      parsed.toISOString().slice(0, 10) !== date
    )
      fail("วันที่ไม่มีอยู่จริง กรุณาเลือกวันที่อีกครั้ง");
  }
  const photo = item.photo ?? null;
  if (photo !== null && (typeof photo !== "string" || !uuid.test(photo)))
    fail("รูปภาพของรายการไม่ถูกต้อง กรุณาเลือกรูปอีกครั้ง");
  const location = shortText(item.location ?? "", 60, true, "ที่เก็บ");
  return {
    ...result,
    category,
    date,
    dateKind,
    location,
    photo,
  };
}

function mealIngredient(item) {
  if (
    !item ||
    typeof item.id !== "string" ||
    !uuid.test(item.id)
  )
    fail("รหัสวัตถุดิบในเมนูไม่ถูกต้อง");
  if (
    typeof item.qty !== "number" ||
    !(item.qty > 0 && item.qty <= 999999)
  )
    fail("จำนวนวัตถุดิบต้องมากกว่า 0 และไม่เกิน 999,999");
  const scaled = item.qty * 1000;
  if (
    Math.abs(scaled - Math.round(scaled)) > 0.0000001 ||
    Math.round(scaled) === 0
  )
    fail("จำนวนวัตถุดิบรองรับทศนิยมไม่เกิน 3 ตำแหน่ง");
  return {
    id: item.id,
    name: shortText(item.name, 80, false, "ชื่อวัตถุดิบ"),
    qty: item.qty,
    unit: shortText(item.unit, 20, false, "หน่วยวัตถุดิบ"),
  };
}

function mealIngredients(value) {
  if (!Array.isArray(value) || value.length < 1 || value.length > 40)
    fail("เมนูต้องมีวัตถุดิบ 1-40 รายการ");
  const ingredients = value.map(mealIngredient);
  if (new Set(ingredients.map((item) => item.id)).size !== ingredients.length)
    fail("มีวัตถุดิบรหัสซ้ำในเมนู");
  return ingredients;
}

function servings(value) {
  if (!Number.isInteger(value) || value < 1 || value > 100)
    fail("จำนวนเสิร์ฟต้องเป็นจำนวนเต็มระหว่าง 1-100");
  return value;
}

function recipe(value) {
  if (!value || typeof value.id !== "string" || !uuid.test(value.id))
    fail("รหัสเมนูต้นแบบไม่ถูกต้อง");
  return {
    id: value.id,
    name: shortText(value.name, 80, false, "ชื่อเมนู"),
    servings: servings(value.servings),
    ingredients: mealIngredients(value.ingredients),
  };
}

function mealPlan(value) {
  if (!value || typeof value.id !== "string" || !uuid.test(value.id))
    fail("รหัสแผนทำอาหารไม่ถูกต้อง");
  const recipeId = value.recipeId ?? null;
  if (
    recipeId !== null &&
    (typeof recipeId !== "string" || !uuid.test(recipeId))
  )
    fail("สูตรต้นแบบของแผนไม่ถูกต้อง");
  if (value.status !== "planned" && value.status !== "cooked")
    fail("สถานะแผนทำอาหารไม่ถูกต้อง");
  const date = value.date;
  if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date))
    fail("วันที่ทำเมนูไม่ถูกต้อง");
  const parsed = new Date(date + "T00:00:00Z");
  if (
    Number.isNaN(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== date
  )
    fail("วันที่ทำเมนูไม่มีอยู่จริง");
  return {
    id: value.id,
    recipeId,
    name: shortText(value.name, 80, false, "ชื่อเมนู"),
    date,
    servings: servings(value.servings),
    status: value.status,
    ingredients: mealIngredients(value.ingredients),
  };
}

function collection(value, max, validate, label) {
  if (!Array.isArray(value) || value.length > max)
    fail(label + "มีจำนวนไม่ถูกต้อง");
  const result = value.map(validate);
  if (new Set(result.map((item) => item.id)).size !== result.length)
    fail(label + "มีรหัสซ้ำ");
  return result;
}

export function validatedStock(data) {
  if (
    data.version !== null &&
    (typeof data.version !== "string" || !uuid.test(data.version))
  )
    fail("เวอร์ชันข้อมูลไม่ถูกต้อง กรุณาโหลดรายการใหม่");
  const rows = (array, max, shopping, label) => {
    if (!Array.isArray(array) || array.length > max)
      fail(label + "มีจำนวนไม่ถูกต้อง");
    const result = array.map((item) => row(item, shopping));
    if (new Set(result.map((item) => item.id)).size !== array.length)
      fail(label + "มีรหัสซ้ำ");
    return result;
  };
  const result = {
    items: rows(data.items, 2000, false, "ของในบ้าน"),
    shopping: rows(data.shopping, 1000, true, "รายการซื้อ"),
    version: data.version,
  };
  if (Object.hasOwn(data, "recipes"))
    result.recipes = collection(data.recipes, 500, recipe, "เมนูต้นแบบ");
  if (Object.hasOwn(data, "mealPlans"))
    result.mealPlans = collection(data.mealPlans, 2000, mealPlan, "แผนทำอาหาร");
  if (result.recipes && result.mealPlans) {
    const recipeIds = new Set(result.recipes.map((item) => item.id));
    if (
      result.mealPlans.some(
        (plan) => plan.recipeId && !recipeIds.has(plan.recipeId),
      )
    )
      fail("ไม่พบเมนูต้นแบบที่แผนอ้างอิง กรุณาเลือกเมนูใหม่");
  }
  return result;
}
