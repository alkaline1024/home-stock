const ignored = /(?:^รวม(?:\s|$)|ใบเสร็จ|เลขที่|สาขา|ที่อยู่|โทรศัพท์|โทร\.|วันที่|เวลา|รายการสินค้า|ยอดรวม|รวมทั้งสิ้น|รวมเงิน|เงินสด|เงินทอน|ภาษี|ส่วนลด|สมาชิก|คะแนน|ชำระ|ขอบคุณ|receipt|invoice|subtotal|total|discount|tax|vat|cash|change|thank you)/i;
const normalize = (value) => value.normalize('NFC').toLocaleLowerCase().replace(/\s+/g, ' ').trim();

export function parseReceipt(text, knownItems = []) {
  const rows = [];
  for (const raw of text.split(/\r?\n/).slice(0, 300)) {
    let line = raw.replace(/\s+/g, ' ').trim();
    if (line.length < 3 || ignored.test(line) || /^[-\d.,\s/:]+$/.test(line)) continue;
    // Remove one or two trailing prices, then use an explicit quantity when present.
    if (!/(?:\s|^)[฿]?\d{1,6}[.,]\d{2}\s*$/.test(line)) continue;
    for (let i = 0; i < 2; i++) {
      const price = line.match(/(?:\s|^)[฿]?\d{1,6}[.,]\d{2}\s*$/);
      if (price) line = line.slice(0, price.index).trim();
    }
    let qty = 1;
    const count = line.match(/(?:^|\s)(\d{1,3})\s*[x×]\s*$/i) ||
      line.match(/\s+[x×]\s*(\d{1,3})(?:\s|$)/i);
    if (count) {
      qty = Number(count[1]);
      line = line.replace(count[0], ' ').trim();
      line = line.replace(/^\d{1,6}[.,]\d{2}\s*/, '').trim();
    } else {
      const bareCount = line.match(/\s+(\d{1,3})$/);
      if (bareCount) { qty = Number(bareCount[1]); line = line.slice(0, bareCount.index).trim(); }
    }
    line = line.replace(/^\d{8,14}\s+/, '').replace(/^[*#\-.\s]+/, '').trim();
    if (!line || qty < 1 || qty > 999 || /^\d+$/.test(line)) continue;
    const candidate = normalize(line);
    const known = knownItems.find((item) => normalize(item.name) === candidate) ||
      knownItems.find((item) => normalize(item.name).length >= 4 &&
        candidate.includes(normalize(item.name)));
    rows.push({name: (known?.name || line).slice(0, 80), qty,
      unit: known?.unit || 'ชิ้น', category: known?.category || 'อื่น ๆ',
      location: known?.location || '', barcode: known?.barcode || '', raw});
    if (rows.length >= 80) break;
  }
  return rows;
}
