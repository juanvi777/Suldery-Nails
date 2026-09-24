const CACHE_NAME = 'suldery-shell-v51-free-push';
const ASSET_PATHS = [
  'style.css?v=20260923-v51','auth.js?v=20260923-v51','login.js?v=20260923-v51','registro.js?v=20260923-v51','cliente.js?v=20260923-v51','duena.js?v=20260923-v51',
  'catalogo.html','catalogo.js?v=20260923-v51','assets/suldery-nails-logo.jpeg','assets/suldery-nails-icon-192.png','assets/suldery-nails-icon-512.png','manifest.webmanifest','assets/favicon-48.png','assets/favicon-96.png','assets/suldery-nails-icon-180.png'
];
const scopedUrl = path => new URL(path, self.registration.scope).href;
const APP_ASSETS = ASSET_PATHS.map(scopedUrl);
self.addEventListener('install', event => event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(APP_ASSETS)).then(() => self.skipWaiting())));
self.addEventListener('activate', event => event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key)))).then(() => self.clients.claim())));
self.addEventListener('push', event => {
  let payload = { title: 'Suldery Nails 💕', body: 'Tienes un nuevo aviso.', url: './' };
  try { if (event.data) payload = { ...payload, ...event.data.json() }; } catch { try { if (event.data) payload.body = event.data.text(); } catch {} }
  const target = payload.url || self.registration.scope;
  const icon = payload.icon ? new URL(payload.icon, self.registration.scope).href : new URL('assets/suldery-nails-icon-192.png', self.registration.scope).href;
  event.waitUntil(self.registration.showNotification(payload.title, { body: payload.body, icon, badge: icon, vibrate: [120,60,120], tag: payload.tag || 'suldery-nails', renotify: true, data: { url: target } }));
});
self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
    const target = event.notification.data?.url || self.registration.scope;
    const existing = list.find(client => client.url === target || client.url.startsWith(target));
    if (existing) return existing.focus();
    return clients.openWindow(target);
  }));
});
self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.includes('/api/') || url.pathname.includes('/uploads/')) return;

  // Navigation documents must always try the network first so login/session
  // changes never get trapped behind a stale cached HTML page.
  if (request.mode === 'navigate' || request.destination === 'document') {
    event.respondWith(fetch(request).catch(() => caches.match(request)));
    return;
  }

  event.respondWith(caches.match(request).then(cached => {
    const network = fetch(request).then(response => {
      if (response.ok) caches.open(CACHE_NAME).then(cache => cache.put(request, response.clone()));
      return response;
    }).catch(() => cached);
    return cached || network;
  }));
});
