import { createHash } from "node:crypto";
import webpush from "web-push";
import { endpoint, HttpError, json, readJson } from "./http.js";
import { requireSession } from "./session.js";
import { mutate, readState } from "./state.js";

const hash = (value) => createHash("sha256").update(value).digest("hex");
const validEndpoint = (value) =>
  typeof value === "string" && value.length < 2048 && value.startsWith("https://");
const validKey = (value) =>
  typeof value === "string" && value.length < 512 && /^[A-Za-z0-9_-]+$/.test(value);
const hasItemAlerts = (state) =>
  (state.items || []).some(
    (item) =>
      item.date &&
      ["expiry", "best-before"].includes(item.dateKind) &&
      Number.isInteger(item.notifyBeforeDays) &&
      item.notifyBeforeDays >= 0 &&
      item.notifyBeforeDays <= 365,
  );

export function createAlertHandlers(store) {
  return {
    GET: endpoint(async (request) => {
      requireSession(request);
      const { state } = await readState(store);
      return json({
        publicKey: process.env.VAPID_PUBLIC_KEY || "",
        days: state.alertDays ?? 3,
        enabled: Boolean(state.alertDays),
        itemAlerts: hasItemAlerts(state),
      });
    }),
    POST: endpoint(async (request) => {
      requireSession(request);
      const body = await readJson(request, 8192);
      if (![0, 1, 3, 7].includes(body.days))
        throw new HttpError(400, "เลือกเตือนล่วงหน้า 1, 3 หรือ 7 วัน");
      const subscription = body.subscription;
      if (
        subscription !== undefined &&
        (!subscription ||
          !validEndpoint(subscription.endpoint) ||
          !validKey(subscription.keys?.p256dh) ||
          !validKey(subscription.keys?.auth))
      )
        throw new HttpError(400, "ข้อมูลการแจ้งเตือนไม่ถูกต้อง");
      const id = subscription && hash(subscription.endpoint);
      await mutate(store, (state) => {
        state.alertDays = body.days;
        state.subscriptions ??= [];
        if (subscription) {
          state.subscriptions = state.subscriptions.filter((entry) => entry.id !== id);
          if (body.days || hasItemAlerts(state))
            state.subscriptions.push({ id, subscription, lastSent: "" });
        }
        if (state.subscriptions.length > 10) state.subscriptions.shift();
      });
      return json({ ok: true });
    }),
  };
}

export function createCronHandler(store) {
  return endpoint(async (request) => {
    const secret = process.env.CRON_SECRET;
    if (!secret || request.headers.get("authorization") !== "Bearer " + secret)
      throw new HttpError(401, "ไม่ได้รับอนุญาต");
    const { state } = await readState(store);
    const days = state.alertDays ?? 3;
    const itemAlerts = hasItemAlerts(state);
    if ((!days && !itemAlerts) || !state.subscriptions?.length) return json({ sent: 0 });
    const now = new Date();
    const localDate = new Date(now.getTime() + 7 * 3600000);
    const today = localDate.toISOString().slice(0, 10);
    const todayDay = Math.floor(Date.parse(today + "T00:00:00Z") / 86400000);
    const due = state.items.filter((item) => {
      if (!item.date || !["expiry", "best-before"].includes(item.dateKind)) return false;
      const hasOverride = Number.isInteger(item.notifyBeforeDays);
      if (!hasOverride && !days) return false;
      const threshold = hasOverride ? item.notifyBeforeDays : days;
      const remainingDays = Math.floor(Date.parse(item.date + "T00:00:00Z") / 86400000) - todayDay;
      return threshold >= 0 && remainingDays <= threshold && remainingDays >= 0;
    });
    if (!due.length) return json({ sent: 0 });
    const pending = state.subscriptions.filter((entry) => entry.lastSent !== today);
    if (!pending.length) return json({ sent: 0 });
    // Claim this local day before sending so a cron retry cannot send twice.
    let claimed = [];
    await mutate(store, (current) => {
      claimed = (current.subscriptions || []).filter(
        (entry) => pending.some((target) => target.id === entry.id) && entry.lastSent !== today,
      );
      for (const entry of claimed) entry.lastSent = today;
    });
    if (!claimed.length) return json({ sent: 0 });
    webpush.setVapidDetails(
      "mailto:home-stock@users.noreply.github.com",
      process.env.VAPID_PUBLIC_KEY,
      process.env.VAPID_PRIVATE_KEY,
    );
    const body = JSON.stringify({
      title: "ของใกล้ถึงกำหนด",
      body:
        due.length === 1
          ? due[0].name +
            (due[0].dateKind === "best-before" ? " ควรบริโภคก่อน " : " หมดอายุ ") +
            due[0].date
          : due.length + " รายการใกล้ถึงกำหนด",
      url: "/",
    });
    const results = await Promise.allSettled(
      claimed.map((entry) => webpush.sendNotification(entry.subscription, body)),
    );
    const expired = claimed
      .filter(
        (_, i) =>
          results[i].status === "rejected" && [404, 410].includes(results[i].reason?.statusCode),
      )
      .map((entry) => entry.id);
    if (expired.length)
      await mutate(store, (current) => {
        current.subscriptions = (current.subscriptions || []).filter(
          (entry) => !expired.includes(entry.id),
        );
      });
    return json({ sent: results.filter((result) => result.status === "fulfilled").length });
  });
}
