import { bodyBytes, endpoint, HttpError, json } from "./http.js";
import { requireSession } from "./session.js";

export function createReceiptOcrHandlers(fetchImpl = fetch) {
  function service() {
    return process.env.OPENTHAI_OCR_URL || (process.env.VERCEL ? "" : "http://127.0.0.1:8788");
  }
  function headers() {
    return process.env.OPENTHAI_OCR_TOKEN
      ? { Authorization: "Bearer " + process.env.OPENTHAI_OCR_TOKEN }
      : {};
  }
  return {
    GET: endpoint(async (request) => {
      requireSession(request);
      if (!service()) return json({ available: false });
      try {
        const response = await fetchImpl(new URL("health", service().replace(/\/?$/, "/")), {
          headers: headers(),
          signal: AbortSignal.timeout(1500),
        });
        return json({ available: response.ok });
      } catch {
        return json({ available: false });
      }
    }),
    POST: endpoint(async (request) => {
      requireSession(request);
      if (!service()) throw new HttpError(503, "OpenThai OCR ยังไม่พร้อม");
      const image = await bodyBytes(request, "image/png", 8 * 1024 * 1024);
      if (!image.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])))
        throw new HttpError(400, "รูปใบเสร็จไม่ถูกต้อง");
      try {
        const response = await fetchImpl(new URL("ocr", service().replace(/\/?$/, "/")), {
          method: "POST",
          headers: { ...headers(), "Content-Type": "image/png" },
          body: image,
          signal: AbortSignal.timeout(60000),
        });
        if (!response.ok) throw new Error();
        const result = await response.json();
        if (typeof result.text !== "string" || !result.text.trim() || result.text.length > 100000)
          throw new Error();
        return json({ text: result.text, engine: "openthai" });
      } catch {
        throw new HttpError(503, "OpenThai OCR อ่านรูปไม่ได้ กำลังใช้ระบบสำรอง");
      }
    }),
  };
}
