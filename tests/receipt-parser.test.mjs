import assert from 'node:assert/strict';
import {test} from 'node:test';
import {parseReceipt} from '../public/receipt-parser.js';

test('parses Thai and English product lines while excluding payment lines', () => {
  const rows = parseReceipt('นมสด 2 x 45.00 90.00\nRICE 1 150.00\nรวม 240.00\nเงินสด 300.00');
  assert.equal(rows.length, 2);
  assert.deepEqual(rows.map(({name, qty}) => ({name, qty})), [
    {name: 'นมสด', qty: 2}, {name: 'RICE', qty: 1},
  ]);
});

test('reuses a known item unit, category, location and barcode', () => {
  const rows = parseReceipt('นมสด 1 45.00', [{name: 'นมสด', unit: 'กล่อง',
    category: 'ของสด', location: 'ตู้เย็น', barcode: '12345678'}]);
  assert.deepEqual(rows[0], {name: 'นมสด', qty: 1, unit: 'กล่อง',
    category: 'ของสด', location: 'ตู้เย็น', barcode: '12345678', raw: 'นมสด 1 45.00'});
});

test('does not mistake receipt headings or arbitrary text for products', () => {
  assert.deepEqual(parseReceipt('ใบเสร็จ\nวันที่ 10/11/2026\nขอบคุณค่ะ\nรายการสินค้า\nABC'), []);
});
