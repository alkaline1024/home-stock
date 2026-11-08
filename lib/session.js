import { createHmac, createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { HttpError, endpoint, json, readJson } from './http.js';

const cookieName = 'home_stock_session';
const lifetime = 30 * 24 * 60 * 60;

function secret() {
  const value = process.env.HOME_STOCK_SECRET;
  if (!value || value.length < 24 || value.length > 1024) {
    throw new HttpError(503, 'กรุณาตั้งรหัสบ้าน HOME_STOCK_SECRET ความยาว 24–1024 ตัวอักษร');
  }
  return value;
}

function same(a, b) {
  const digest = (value) => createHash('sha256').update(value).digest();
  return timingSafeEqual(digest(a), digest(b));
}

function signature(value, key) {
  return createHmac('sha256', key).update('home-stock/session/v1/' + value).digest('base64url');
}

export function requireSession(request) {
  const key = secret();
  const match = /(?:^|;\s*)home_stock_session=(\d{1,12})\.([\w-]{22})\.([\w-]{43})(?:;|$)/.exec(request.headers.get('cookie') || '');
  if (!match || Number(match[1]) <= Date.now() / 1000 || !same(signature(match[1] + '.' + match[2], key), match[3])) {
    throw new HttpError(401, 'กรุณาใส่รหัสบ้าน');
  }
}

function cookie(request, token, seconds) {
  const secure = process.env.VERCEL_ENV === 'production' || process.env.VERCEL_ENV === 'preview' ||
    new URL(request.url).protocol === 'https:';
  return cookieName + '=' + token + '; Path=/; Max-Age=' + seconds + '; HttpOnly; SameSite=Strict' + (secure ? '; Secure' : '');
}

export const login = endpoint(async (request) => {
  const body = await readJson(request, 8192);
  if (body.logout === true) return json({ ok: true }, 200, { 'Set-Cookie': cookie(request, '', 0) });

  const key = secret();
  if (typeof body.password !== 'string' || !same(body.password, key)) {
    throw new HttpError(401, 'รหัสบ้านไม่ถูกต้อง');
  }
  const expires = Math.floor(Date.now() / 1000) + lifetime;
  const value = expires + '.' + randomBytes(16).toString('base64url');
  return json({ ok: true }, 200, { 'Set-Cookie': cookie(request, value + '.' + signature(value, key), lifetime) });
});
