const ignored =
  /(?:^รวม(?:\s|$)|ใบเสร็จ|เลขที่|สาขา|ที่อยู่|โทรศัพท์|โทร\.|วันที่|เวลา|รายการสินค้า|ยอดรวม|เงินรวม|รวมทั้งสิ้น|รวมเงิน|เงินสด|เงินทอน|ภาษี|ส่วนลด|สมาชิก|คะแนน|ชำระ|ขอบคุณ|receipt|invoice|subtotal|total|discount|tax|vat|cash|change|thank you)/i;
const normalize = (value) => value.normalize("NFC").toLocaleLowerCase().replace(/\s+/g, " ").trim();
const pricePattern = /(?:\s|^)[฿]?(?:\d{1,3}(?:,\d{3})+|\d{1,6})[.,]\d{2}\s*$/;

function product(name, qty, barcode, raw, knownItems, weighted = false) {
  const candidate = normalize(name);
  const known =
    knownItems.find((item) => barcode && item.barcode === barcode) ||
    knownItems.find((item) => normalize(item.name) === candidate) ||
    knownItems.find(
      (item) => normalize(item.name).length >= 4 && candidate.includes(normalize(item.name)),
    );
  return {
    name: (known?.name || name).slice(0, 80),
    qty,
    unit: known?.unit || (weighted ? "กก." : "ชิ้น"),
    category: known?.category || "อื่น ๆ",
    location: known?.location || "",
    barcode: known?.barcode || barcode || "",
    raw,
  };
}

function barcodeLine(line) {
  // A digit immediately after ')' is usually a tax code. The separated number is the quantity.
  const match = line.match(/^[^\d(]{0,5}\(?\s*(\d{8}|\d{12,14})\s*\)\s*\d?\s*(.*)$/);
  if (match) {
    const quantity = match[2].match(/(?:^|\s)([1-9]\d{0,2})(?=\s|$)/);
    return { barcode: match[1], qty: quantity ? Number(quantity[1]) : 1, weighted: false };
  }
  // Weighed goods print a long shop code followed by the measured kilograms.
  const weight = line.match(/^[^\d(]{0,5}\(\s*2[^\n]{12,}?(?:0[.,](\d{3,4}))(?=\s|$)/);
  if (weight)
    return {
      barcode: "",
      qty: weight[1].length === 3 ? Number("0." + weight[1]) : 1,
      weighted: true,
    };
  if (/^[^\d(]{0,5}\(\s*2/.test(line) && (line.match(/\d/g) || []).length >= 10)
    return { barcode: "", qty: 1, weighted: true };
  return null;
}

function stripPrices(line) {
  let result = line;
  for (let i = 0; i < 2; i++) {
    const match = result.match(pricePattern);
    if (match) result = result.slice(0, match.index).trim();
  }
  return result;
}

function pricedProduct(line, knownItems) {
  if (!pricePattern.test(line)) return null;
  let name = stripPrices(line);
  let qty = 1;
  const count =
    name.match(/(?:^|\s)(\d{1,3})\s*[x×]\s*$/i) || name.match(/\s+[x×]\s*(\d{1,3})(?:\s|$)/i);
  if (count) {
    qty = Number(count[1]);
    name = name.replace(count[0], " ").trim();
    name = name.replace(/^\d{1,6}[.,]\d{2}\s*/, "").trim();
  } else {
    const bareCount = name.match(/\s+(\d{1,3})$/);
    if (bareCount) {
      qty = Number(bareCount[1]);
      name = name.slice(0, bareCount.index).trim();
    }
  }
  name = name
    .replace(/^\d{8,14}\s+/, "")
    .replace(/^[*#\-.\s]+/, "")
    .trim();
  return name && qty >= 1 && qty <= 999 && !/^\d+$/.test(name)
    ? product(name, qty, "", line, knownItems)
    : null;
}

export function parseReceipt(text, knownItems = []) {
  const rows = [];
  let pending = [];
  const flush = () => {
    const priced = pending.findLast((part) => part.priced);
    if (priced && stripPrices(priced.name).length >= 4)
      rows.push(pricedProduct(priced.raw, knownItems));
    pending = [];
  };
  for (const raw of text.split(/\r?\n/).slice(0, 300)) {
    const line = raw.replace(/\s+/g, " ").trim();
    if (line.length < 3 || ignored.test(line)) continue;
    const code = barcodeLine(line);
    if (code) {
      if (pending.length) {
        const name = pending
          .map((part) => part.name)
          .join(" ")
          .trim();
        if (name)
          rows.push(
            product(
              name,
              code.qty,
              code.barcode,
              pending.map((part) => part.raw).join("\n") + "\n" + raw,
              knownItems,
              code.weighted,
            ),
          );
      }
      pending = [];
    } else if (!/^[-\d.,\s/:*x×()]+$/i.test(line)) {
      const priced = pricePattern.test(line);
      // A fresh product line after a priced one means the prior product had no barcode row.
      if (pending.some((part) => part.priced)) flush();
      pending.push({ name: priced ? stripPrices(line) : line, raw, priced });
      if (pending.length > 2) pending.shift();
    }
    if (rows.length >= 80) break;
  }
  if (pending.length) flush();
  return rows.filter(Boolean).slice(0, 80);
}
