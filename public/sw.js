self.addEventListener('push', (event) => {
  const data = event.data?.json() || {};
  event.waitUntil(self.registration.showNotification(data.title || 'home-stock', {
    body: data.body || 'มีของใกล้หมดอายุ', tag: 'home-stock-expiry', data: {url: data.url || '/'}
  }));
});
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(clients.openWindow(event.notification.data?.url || '/'));
});
