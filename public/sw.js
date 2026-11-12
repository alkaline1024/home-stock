self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});
self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

const photoCacheName = "home-stock-photos-v1";
const photoRequests = new Map();

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (request.method === "POST" && url.pathname === "/api/session") {
    event.respondWith(
      (async () => {
        const body = await request
          .clone()
          .json()
          .catch(() => null);
        const response = await fetch(request);
        if (body?.logout && response.ok) await caches.delete(photoCacheName);
        return response;
      })(),
    );
    return;
  }
  if (
    request.method !== "GET" ||
    url.pathname !== "/api/photo" ||
    !/^[0-9a-f-]{36}$/i.test(url.searchParams.get("id") || "")
  )
    return;
  event.respondWith(
    (async () => {
      let cache;
      try {
        cache = await caches.open(photoCacheName);
      } catch {
        return fetch(request);
      }
      const saved = await cache.match(request);
      if (saved) return saved;
      // A photo ID is immutable. Share simultaneous requests for the same image.
      let pending = photoRequests.get(request.url);
      if (!pending) {
        pending = (async () => {
          const response = await fetch(request);
          if (response.ok && response.headers.get("content-type")?.startsWith("image/")) {
            try {
              await cache.put(request, response.clone());
            } catch {
              // Storage may be full or disabled; the image must still display.
            }
          }
          return response;
        })();
        photoRequests.set(request.url, pending);
      }
      try {
        return (await pending).clone();
      } finally {
        if (photoRequests.get(request.url) === pending) photoRequests.delete(request.url);
      }
    })(),
  );
});

self.addEventListener("push", (event) => {
  const data = event.data?.json() || {};
  event.waitUntil(
    self.registration.showNotification(data.title || "home-stock", {
      body: data.body || "มีของใกล้หมดอายุ",
      tag: "home-stock-expiry",
      data: { url: data.url || "/" },
    }),
  );
});
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(clients.openWindow(event.notification.data?.url || "/"));
});
