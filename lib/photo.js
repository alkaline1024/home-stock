import { randomUUID } from "node:crypto";
import {
  endpoint,
  HttpError,
  bodyBytes,
  json,
  privateHeaders,
} from "./http.js";
import { uuid } from "./inventory.js";
import { requireSession } from "./session.js";
import {
  cleanRetired,
  expireReservations,
  mutate,
  photoPath,
} from "./state.js";

export function createPhotoHandlers(store) {
  return {
    GET: endpoint(async (request) => {
      requireSession(request);
      const id = new URL(request.url).searchParams.get("id");
      if (!id || !uuid.test(id)) throw new HttpError(400, "รหัสรูปไม่ถูกต้อง");
      const photo = await store.read(photoPath(id));
      if (!photo) throw new HttpError(404, "ไม่พบรูปนี้");
      return new Response(photo.bytes, {
        headers: {
          ...privateHeaders,
          "Content-Type": "image/jpeg",
          "Content-Security-Policy": "default-src 'none'; sandbox",
        },
      });
    }),

    POST: endpoint(async (request) => {
      requireSession(request);
      const jpeg = await bodyBytes(request, "image/jpeg", 450000);
      if (
        jpeg.length < 4 ||
        jpeg[0] !== 0xff ||
        jpeg[1] !== 0xd8 ||
        jpeg[2] !== 0xff ||
        jpeg.at(-2) !== 0xff ||
        jpeg.at(-1) !== 0xd9
      ) {
        throw new HttpError(400, "กรุณาเลือกรูป JPEG");
      }
      const id = randomUUID();
      const state = await mutate(store, (current) => {
        expireReservations(current);
        if (current.pending.length >= 256)
          throw new HttpError(
            429,
            "มีรูปที่รอบันทึกจำนวนมาก กรุณาลองใหม่ภายหลัง",
          );
        current.pending.push({ id, at: Date.now() });
      });
      // Reserving before storing also makes an interrupted upload eligible for cleanup.
      await store.write(photoPath(id), jpeg, {
        version: null,
        contentType: "image/jpeg",
      });
      await cleanRetired(store, state);
      return json({ id }, 201);
    }),
  };
}
