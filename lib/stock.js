import { randomUUID } from "node:crypto";
import { endpoint, HttpError, json, readJson } from "./http.js";
import { validatedStock } from "./inventory.js";
import { requireSession } from "./session.js";
import {
  cleanRetired,
  expireReservations,
  mutate,
  readState,
} from "./state.js";

export function createStockHandlers(store) {
  return {
    GET: endpoint(async (request) => {
      requireSession(request);
      const {
        state: { items, shopping, version },
      } = await readState(store);
      return json({ items, shopping, version });
    }),

    POST: endpoint(async (request) => {
      requireSession(request);
      const input = validatedStock(await readJson(request, 3 * 1024 * 1024));
      const nextVersion = randomUUID();
      const state = await mutate(store, (current) => {
        if (input.version !== current.version)
          throw new HttpError(
            409,
            "ข้อมูลเปลี่ยนจากอุปกรณ์อื่น กรุณาโหลดแล้วลองอีกครั้ง",
          );
        expireReservations(current);
        const previous = new Set(
          current.items.map((item) => item.photo).filter(Boolean),
        );
        const allowed = new Set([
          ...previous,
          ...current.pending.map((entry) => entry.id),
        ]);
        const next = new Set(
          input.items.map((item) => item.photo).filter(Boolean),
        );
        for (const id of next) {
          if (!allowed.has(id))
            throw new HttpError(400, "ไม่พบรูปนี้ กรุณาเลือกรูปอีกครั้ง");
        }
        for (const id of previous) {
          if (!next.has(id)) current.retired.push(id);
        }
        current.pending = current.pending.filter(
          (entry) => !next.has(entry.id),
        );
        Object.assign(current, {
          items: input.items,
          shopping: input.shopping,
          version: nextVersion,
        });
      });
      await cleanRetired(store, state);
      return json({ version: nextVersion });
    }),
  };
}
