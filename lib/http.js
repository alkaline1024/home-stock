export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export const privateHeaders = {
  'Cache-Control': 'private, no-store',
  'Vary': 'Cookie',
  'X-Content-Type-Options': 'nosniff',
};

export function json(value, status = 200, headers = {}) {
  return Response.json(value, { status, headers: { ...privateHeaders, ...headers } });
}

export function endpoint(fn) {
  return async (request) => {
    try {
      if (request.method === 'POST' && request.headers.get('origin') !== new URL(request.url).origin) {
        throw new HttpError(403, 'คำขอต้องมาจากหน้า home-stock');
      }
      return await fn(request);
    } catch (error) {
      if (error instanceof HttpError) return json({ error: error.message }, error.status);
      // Error messages from storage may contain a private path. Keep responses generic.
      console.error('home-stock request failed', error?.constructor?.name);
      return json({ error: 'เชื่อมต่อที่เก็บข้อมูลไม่สำเร็จ กรุณาลองอีกครั้ง' }, 503);
    }
  };
}

export async function bodyBytes(request, mediaType, maxBytes) {
  const type = request.headers.get('content-type')?.split(';')[0].trim().toLowerCase();
  if (type !== mediaType) throw new HttpError(415, 'ชนิดข้อมูลไม่ถูกต้อง');
  const tooLarge = () => new HttpError(413, 'ข้อมูลมีขนาดใหญ่เกินไป');
  if (Number(request.headers.get('content-length')) > maxBytes) throw tooLarge();
  if (!request.body) throw new HttpError(400, 'ไม่มีข้อมูล');
  const reader = request.body.getReader();
  const chunks = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel();
      throw tooLarge();
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks, size);
}

export async function readJson(request, maxBytes) {
  const bytes = await bodyBytes(request, 'application/json', maxBytes);
  try {
    const body = JSON.parse(bytes.toString('utf8'));
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error();
    return body;
  } catch {
    throw new HttpError(400, 'รูปแบบข้อมูลไม่ถูกต้อง');
  }
}
