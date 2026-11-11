// Add a rule by supplying a Thai name, matching keywords, allowed categories,
// and a suggested number of days for each supported storage type.
// These are quality estimates from the date received, never safety expiry dates.
// Sources: https://www.foodsafety.gov/food-safety-charts/cold-food-storage-charts
// https://agrilifeextension.tamu.edu/wp-content/uploads/2025/04/Storing-Vegetables.pdf
// https://aggie-horticulture.tamu.edu/food-technology/nutrition/parsley-and-cilantro/
// https://extension.illinois.edu/gardening/cabbage
// More produce: https://extension.oregonstate.edu/sites/extd8/files/2023-08/pnw612.pdf (Table 3)
globalThis.shelfLifeRules = [
  {
    name: "ผักชี",
    keywords: ["ผักชี", "cilantro", "coriander"],
    categories: ["ผัก", "ของสด"],
    days: { fridge: 5 },
  },
  {
    name: "ผักกาดหอม",
    keywords: ["ผักกาดหอม", "ผักสลัด", "lettuce"],
    categories: ["ผัก", "ของสด"],
    days: { fridge: 7 },
  },
  {
    name: "ผักกาดขาว",
    keywords: ["ผักกาดขาว", "napa cabbage"],
    categories: ["ผัก", "ของสด"],
    days: { fridge: 7 },
  },
  {
    name: "กะหล่ำปลี",
    keywords: ["กะหล่ำปลี", "กะหล่ำ", "cabbage"],
    categories: ["ผัก", "ของสด"],
    days: { fridge: 14 },
  },
  {
    name: "แครอท",
    keywords: ["แครอท", "carrot"],
    categories: ["ผัก", "ของสด"],
    days: { fridge: 14 },
  },
  {
    name: "บรอกโคลี",
    keywords: ["บรอกโคลี", "broccoli"],
    categories: ["ผัก", "ของสด"],
    days: { fridge: 5 },
  },
  {
    name: "ดอกกะหล่ำ",
    keywords: ["ดอกกะหล่ำ", "cauliflower"],
    categories: ["ผัก", "ของสด"],
    days: { fridge: 5 },
  },
  {
    name: "เห็ดสด",
    keywords: ["เห็ด", "mushroom"],
    categories: ["ผัก", "ของสด"],
    days: { fridge: 3 },
  },
  {
    name: "ไก่ดิบ",
    keywords: ["เนื้อไก่", "อกไก่", "น่องไก่", "ไก่สด", "ไก่ดิบ", "chicken"],
    categories: ["เนื้อสัตว์", "ของสด", "ของแช่แข็ง"],
    days: { fridge: 2, freezer: 120 },
  },
  {
    name: "หมูดิบ",
    keywords: ["เนื้อหมู", "หมูสัน", "หมูสด", "หมูดิบ", "pork"],
    categories: ["เนื้อสัตว์", "ของสด", "ของแช่แข็ง"],
    days: { fridge: 3, freezer: 120 },
  },
  {
    name: "เนื้อวัวดิบ",
    keywords: ["เนื้อวัว", "เนื้อโค", "beef"],
    categories: ["เนื้อสัตว์", "ของสด", "ของแช่แข็ง"],
    days: { fridge: 3, freezer: 120 },
  },
  {
    name: "เนื้อบดดิบ",
    keywords: ["หมูบด", "เนื้อบด", "ไก่บด", "หมูสับ", "ground meat"],
    categories: ["เนื้อสัตว์", "ของสด", "ของแช่แข็ง"],
    days: { fridge: 2, freezer: 90 },
  },
  {
    name: "ปลาสด",
    keywords: [
      "ปลาสด",
      "เนื้อปลา",
      "ปลาแซลมอน",
      "ปลาซาบะ",
      "ปลาทูน่า",
      "ปลานิล",
      "ปลาทับทิม",
      "ปลากะพง",
      "ปลาช่อน",
      "ปลาดุก",
      "fish",
      "salmon",
      "tuna",
      "mackerel",
    ],
    categories: ["เนื้อสัตว์", "ของสด", "ของแช่แข็ง"],
    days: { fridge: 2, freezer: 60 },
  },
  {
    name: "กุ้งสด",
    keywords: ["กุ้ง", "shrimp", "prawn"],
    categories: ["เนื้อสัตว์", "ของสด", "ของแช่แข็ง"],
    days: { fridge: 3, freezer: 90 },
  },
  {
    name: "ไข่ไก่ดิบ",
    keywords: ["ไข่ไก่", "ไข่สด", "ไข่เป็ด", "raw egg"],
    categories: ["ของสด"],
    days: { fridge: 21 },
  },
  {
    name: "ไข่ต้ม",
    keywords: ["ไข่ต้ม", "hard boiled egg"],
    categories: ["ของสด", "อาหารปรุงสุก"],
    days: { fridge: 7 },
  },
  {
    name: "อาหารปรุงสุก",
    keywords: ["แกง", "ต้ม", "ผัด", "ข้าวผัด", "อาหารเหลือ", "leftover"],
    categories: ["อาหารปรุงสุก"],
    days: { fridge: 3, freezer: 60 },
  },
];

// Lower ends of the published quality ranges are used where a range is given.
// Keep keywords specific: the calculator chooses the longest matching keyword.
const addFood = (name, keywords, categories, days) =>
  globalThis.shelfLifeRules.push({ name, keywords, categories, days });
const vegetables = ["ผัก", "ของสด"];
const fruit = ["ของสด"];
const rawMeat = ["เนื้อสัตว์", "ของสด", "ของแช่แข็ง"];
const cooked = ["อาหารปรุงสุก"];

// Fresh vegetables and herbs: OSU Extension, Table 3; whole and unwashed.
addFood("ผักกาดใบ", ["ผักกาด", "mustard greens"], vegetables, { fridge: 2 });
addFood("ต้นหอม", ["ต้นหอม", "หอมแบ่ง", "green onion", "scallion"], vegetables, { fridge: 7 });
addFood("คะน้า", ["คะน้า", "kale", "collard"], vegetables, { fridge: 2 });
addFood("ผักบุ้ง", ["ผักบุ้ง", "morning glory", "water spinach"], vegetables, { fridge: 2 });
addFood("ปวยเล้ง", ["ปวยเล้ง", "spinach"], vegetables, { fridge: 3 });
addFood("กวางตุ้ง", ["กวางตุ้ง", "bok choy", "pak choi"], vegetables, { fridge: 2 });
addFood("หน่อไม้ฝรั่ง", ["หน่อไม้ฝรั่ง", "asparagus"], vegetables, { fridge: 3 });
addFood("ถั่วแขก", ["ถั่วแขก", "green bean", "string bean"], vegetables, { fridge: 7 });
addFood("ถั่วลันเตา", ["ถั่วลันเตา", "peas"], vegetables, { fridge: 3 });
addFood("มะเขือยาว", ["มะเขือยาว", "มะเขือม่วง", "eggplant"], vegetables, { fridge: 3 });
addFood("แตงกวา", ["แตงกวา", "cucumber"], vegetables, { fridge: 4 });
addFood("มะเขือเทศสุก", ["มะเขือเทศ", "tomato"], vegetables, { fridge: 5 });
addFood("กระเทียม", ["กระเทียม", "garlic"], vegetables, { pantry: 30, fridge: 7 });
addFood("ขิง", ["ขิง", "ginger"], vegetables, { pantry: 2, fridge: 7 });
addFood("หอมใหญ่", ["หอมใหญ่", "หอมหัวใหญ่", "onion"], vegetables, { pantry: 30 });
addFood("มันฝรั่ง", ["มันฝรั่ง", "potato"], vegetables, { pantry: 30, fridge: 7 });
addFood("พริกสด", ["พริกสด", "พริกชี้ฟ้า", "พริกขี้หนู", "chili pepper"], vegetables, { fridge: 4 });
addFood("พริกหวาน", ["พริกหวาน", "bell pepper", "capsicum"], vegetables, { fridge: 4 });
addFood("หัวไชเท้า", ["หัวไชเท้า", "หัวผักกาด", "radish"], vegetables, { fridge: 10 });
addFood("กระเจี๊ยบเขียว", ["กระเจี๊ยบเขียว", "okra"], vegetables, { fridge: 3 });
addFood("ข้าวโพดสด", ["ข้าวโพดสด", "ข้าวโพดฝัก", "corn on the cob"], vegetables, { fridge: 2 });
addFood("ขึ้นฉ่าย", ["ขึ้นฉ่าย", "เซเลอรี", "celery"], vegetables, { fridge: 7 });
addFood("ต้นกระเทียม", ["ต้นกระเทียม", "leek"], vegetables, { fridge: 7 });
addFood("ฟักทอง", ["ฟักทอง", "winter squash"], vegetables, { pantry: 7, fridge: 14 });
addFood("บวบ", ["บวบ", "ซูกินี", "zucchini", "summer squash"], vegetables, { fridge: 4 });
addFood("หัวบีต", ["หัวบีต", "beetroot"], vegetables, { fridge: 7 });

// Fresh fruit: OSU Extension, Table 3. Ripe fruit assumptions are named explicitly.
addFood("แอปเปิล", ["แอปเปิล", "แอปเปิ้ล", "apple"], fruit, { pantry: 1, fridge: 14 });
addFood("กล้วยสุก", ["กล้วย", "banana"], fruit, { pantry: 2, fridge: 2 });
addFood("อะโวคาโดสุก", ["อะโวคาโด", "อโวคาโด", "avocado"], fruit, { fridge: 3 });
addFood("สตรอว์เบอร์รี", ["สตรอว์เบอร์รี", "สตรอเบอร์รี่", "strawberry"], fruit, { fridge: 2 });
addFood("บลูเบอร์รี", ["บลูเบอร์รี", "blueberry"], fruit, { fridge: 2 });
addFood("ราสป์เบอร์รี", ["ราสป์เบอร์รี", "raspberry"], fruit, { fridge: 2 });
addFood("เชอร์รี", ["เชอร์รี", "เชอร์รี่", "cherry"], fruit, { fridge: 2 });
addFood("ส้ม", ["ส้มเขียวหวาน", "ส้มแมนดาริน", "ส้ม", "orange", "mandarin"], fruit, {
  pantry: 10,
  fridge: 7,
});
addFood("มะนาว", ["มะนาว", "lime"], fruit, { pantry: 10, fridge: 7 });
addFood("เลมอน", ["เลมอน", "lemon"], fruit, { pantry: 10, fridge: 7 });
addFood("มะพร้าวสด", ["มะพร้าวสด", "มะพร้าว", "coconut"], fruit, { pantry: 7, fridge: 14 });
addFood("องุ่น", ["องุ่น", "grape"], fruit, { fridge: 7 });
addFood("กีวีสุก", ["กีวี", "kiwi"], fruit, { fridge: 3 });
addFood("แตงโมสุก", ["แตงโม", "watermelon"], fruit, { pantry: 2, fridge: 3 });
addFood("เมลอนสุก", ["เมลอน", "แคนตาลูป", "melon", "cantaloupe"], fruit, { pantry: 2, fridge: 3 });
addFood("มะม่วงสุก", ["มะม่วง", "mango"], fruit, { pantry: 3, fridge: 7 });
addFood("มะละกอสุก", ["มะละกอ", "papaya"], fruit, { pantry: 3, fridge: 7 });
addFood("ลูกพีชสุก", ["ลูกพีช", "peach", "nectarine"], fruit, { fridge: 3 });
addFood("ลูกแพร์สุก", ["ลูกแพร์", "pear"], fruit, { pantry: 3, fridge: 3 });
addFood("ลูกพลัมสุก", ["ลูกพลัม", "plum"], fruit, { pantry: 3, fridge: 3 });

// Meat and seafood: FoodSafety.gov cold storage chart, at 4 °C or colder.
addFood("ไก่งวงดิบ", ["ไก่งวง", "turkey"], rawMeat, { fridge: 2, freezer: 120 });
addFood("เนื้อแกะดิบ", ["เนื้อแกะ", "lamb"], rawMeat, { fridge: 3, freezer: 120 });
addFood("ไส้กรอกดิบ", ["ไส้กรอกดิบ", "raw sausage"], rawMeat, { fridge: 2, freezer: 30 });
addFood("เบคอน", ["เบคอน", "bacon"], rawMeat, { fridge: 7, freezer: 30 });
addFood("หมึกสด", ["ปลาหมึก", "หมึกสด", "squid"], rawMeat, { fridge: 1, freezer: 90 });
addFood("เนื้อปูสด", ["เนื้อปู", "crab meat"], rawMeat, { fridge: 2, freezer: 60 });
addFood("หอยแกะเปลือก", ["เนื้อหอย", "หอยแกะ", "shucked clam", "shucked oyster"], rawMeat, {
  fridge: 3,
  freezer: 90,
});

// Eggs and prepared foods: FoodSafety.gov cold storage chart.
addFood("ไข่ขาวหรือไข่แดงดิบ", ["ไข่ขาวดิบ", "ไข่แดงดิบ", "raw egg white", "raw egg yolk"], fruit, {
  fridge: 2,
  freezer: 90,
});
addFood("ซุปปรุงสุก", ["ซุป", "ต้มยำ", "ต้มจืด", "soup", "stew"], cooked, { fridge: 3, freezer: 60 });
addFood("ข้าวสุก", ["ข้าวสุก", "ข้าวสวย", "cooked rice"], cooked, { fridge: 3, freezer: 60 });
addFood("ไก่ปรุงสุก", ["ไก่ย่าง", "ไก่ทอด", "ไก่ต้ม", "cooked chicken"], cooked, {
  fridge: 3,
  freezer: 60,
});
addFood("หมูปรุงสุก", ["หมูทอด", "หมูย่าง", "หมูต้ม", "cooked pork"], cooked, { fridge: 3, freezer: 60 });
addFood("ปลาปรุงสุก", ["ปลาทอด", "ปลานึ่ง", "ปลาย่าง", "cooked fish"], cooked, {
  fridge: 3,
  freezer: 30,
});
addFood("พิซซ่า", ["พิซซ่า", "pizza"], cooked, { fridge: 3, freezer: 30 });
addFood(
  "สลัดไข่หรือเนื้อ",
  ["สลัดไข่", "สลัดไก่", "สลัดทูน่า", "egg salad", "chicken salad", "tuna salad"],
  cooked,
  { fridge: 3 },
);
addFood("อาหารเหลือ", ["อาหารเหลือ", "กับข้าวเหลือ", "leftover"], cooked, { fridge: 3, freezer: 60 });
