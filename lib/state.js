import { HttpError } from "./http.js";

const statePath = "home-stock/stock.json";
const reservationAge = 24 * 60 * 60 * 1000;
export const photoPath = (id) => "home-stock/photos/" + id + ".jpg";

export async function readState(store) {
  const entry = await store.read(statePath);
  if (!entry) {
    return {
      etag: null,
      state: {
        version: null,
        items: [],
        shopping: [],
        recentItems: [],
        minLevels: [],
        recipes: [],
        mealPlans: [],
        pending: [],
        retired: [],
      },
    };
  }
  const state = JSON.parse(Buffer.from(entry.bytes).toString("utf8"));
  if (!state.recentItems) {
    const seen = new Set();
    state.recentItems = [...state.items]
      .reverse()
      .filter((item) => {
        const id =
          item.name.trim().normalize("NFC").toLocaleLowerCase() +
          "\u0000" +
          item.unit.trim().normalize("NFC").toLocaleLowerCase();
        if (seen.has(id)) return false;
        seen.add(id);
        return true;
      })
      .slice(0, 100)
      .map(({ name, unit, category, location, barcode }) => ({
        name,
        unit,
        category,
        location,
        barcode: barcode || "",
      }));
  }
  state.minLevels ??= [];
  state.recipes ??= [];
  state.mealPlans ??= [];
  return { etag: entry.version, state };
}

// Each retry re-reads the latest snapshot and preserves independent edits.
// A logical stock version lets a photo reservation coexist with an open item form.
export async function mutate(store, edit) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const { etag, state } = await readState(store);
    edit(state);
    try {
      await store.write(statePath, Buffer.from(JSON.stringify(state)), {
        version: etag,
        contentType: "application/json",
      });
      return state;
    } catch (error) {
      if (!(error instanceof HttpError && error.status === 409)) throw error;
    }
  }
  throw new HttpError(409, "ข้อมูลมีการแก้ไขพร้อมกัน กรุณาโหลดแล้วลองอีกครั้ง");
}

export function expireReservations(state) {
  const cutoff = Date.now() - reservationAge;
  for (const entry of state.pending) {
    if (entry.at < cutoff) state.retired.push(entry.id);
  }
  state.pending = state.pending.filter((entry) => entry.at >= cutoff);
}

// Only delete after a successful CAS removes the ID from both stock and pending.
// Failed deletions stay queued for the next write. A retired ID cannot be reattached.
export async function cleanRetired(store, state) {
  if (state.retired.length === 0) return;
  const batch = state.retired.slice(0, 12);
  const results = await Promise.allSettled(batch.map((id) => store.remove(photoPath(id))));
  const removed = new Set(batch.filter((_, i) => results[i].status === "fulfilled"));
  if (!removed.size) return;
  try {
    await mutate(store, (latest) => {
      latest.retired = latest.retired.filter((id) => !removed.has(id));
    });
  } catch {
    // The stock edit already committed. Repeating a delete is safe.
  }
}
