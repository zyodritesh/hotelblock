self.addEventListener('push', event => {
  let data = { title: 'HotelBlock', body: '', url: '/phone' };
  try { data = { ...data, ...(event.data ? event.data.json() : {}) }; } catch { /* keep the fallback */ }
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const visible = windows.some(win => win.visibilityState === 'visible');
    if (visible) {
      windows.forEach(win => win.postMessage({ type: 'push', data }));
      return;
    }
    await self.registration.showNotification(data.title, {
      body: data.body,
      icon: '/icon-192.png',
      data,
    });
  })());
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/phone';
  event.waitUntil(self.clients.openWindow(url));
});

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(self.clients.claim());
});
