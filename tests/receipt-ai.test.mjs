import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createReceiptAiHandlers} from '../lib/receipt-ai.js';
import {login} from '../lib/session.js';

test('receipt AI is opt-in, authenticated, and validates provider output', async () => {
  const previousSecret = process.env.HOME_STOCK_SECRET;
  const previousKey = process.env.GEMINI_API_KEY;
  process.env.HOME_STOCK_SECRET = 'receipt-ai-test-password';
  delete process.env.GEMINI_API_KEY;
  const origin = 'https://home-stock.test';
  let cookie = '';
  const req = (body, mime = 'application/json') => new Request(origin + '/api/receipt-ai', {
    method: body === undefined ? 'GET' : 'POST',
    headers: {origin, cookie, 'content-type': mime},
    ...(body === undefined ? {} : {body: JSON.stringify(body)}),
  });
  const image = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(120)]).toString('base64');
  const body = {image, mimeType: 'image/jpeg', ocrText: 'ผักขมไทย\n(29595013)1 1 *'};
  let providerCalls = 0;
  const provider = async (_url, options) => {
    providerCalls++;
    assert.equal(options.headers['x-goog-api-key'], 'test-gemini-key');
    const input = JSON.parse(options.body);
    assert.equal(input.contents[0].parts[1].inline_data.data, image);
    return Response.json({candidates: [{content: {parts: [{text: JSON.stringify({items: [
      {name: 'ผักขมไทย 500 กรัม', quantity: 1, unit: 'แพ็ค',
        barcode: '29595013', category: 'ผัก'},
    ]})}]}}]});
  };
  const api = createReceiptAiHandlers(provider);
  try {
    assert.equal((await api.GET(req())).status, 401);
    assert.equal((await api.POST(req(body))).status, 401);
    const session = await login(new Request(origin + '/api/session', {
      method: 'POST', headers: {origin, 'content-type': 'application/json'},
      body: JSON.stringify({password: process.env.HOME_STOCK_SECRET}),
    }));
    cookie = session.headers.get('set-cookie').split(';')[0];
    assert.deepEqual(await (await api.GET(req())).json(), {available: false});
    assert.equal((await api.POST(req(body))).status, 503);
    assert.equal(providerCalls, 0);
    process.env.GEMINI_API_KEY = 'test-gemini-key';
    assert.deepEqual(await (await api.GET(req())).json(), {available: true});
    assert.equal((await api.POST(req({...body, image: 'bad'}))).status, 400);
    assert.equal(providerCalls, 0);
    const result = await api.POST(req(body));
    assert.equal(result.status, 200);
    assert.deepEqual((await result.json()).rows[0], {
      name: 'ผักขมไทย 500 กรัม', qty: 1, unit: 'แพ็ค',
      barcode: '29595013', category: 'ผัก', location: '',
      raw: 'AI แนะนำ · ตรวจรายละเอียดก่อนบันทึก',
    });
    assert.equal(providerCalls, 1);
  } finally {
    if (previousSecret === undefined) delete process.env.HOME_STOCK_SECRET;
    else process.env.HOME_STOCK_SECRET = previousSecret;
    if (previousKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = previousKey;
  }
});
