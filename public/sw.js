const CACHE_NAME = 'suldery-shell-v18';

const ASSET_PATHS = [
  'index.html',
  'registro.html',
  'cliente.html',
  'duena.html',
  'style.css?v=2033',
  'auth.js?v=1801',
  'login.js',
  'registro.js',
  'cliente.js',
  'duena.js',
  'assets/suldery-nails-logo.jpeg',
  'assets/suldery-nails-icon-192.png',
  'assets/suldery-nails-icon-512.png',
  'manifest.webmanifest'
];

const scopedUrl = path => new URL(path, self.registration.scope).href;
const APP_SHELL = ASSET_PATHS.map(scopedUrl);

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.includes('/api/')) return;
  if (url.pathname.includes('/uploads/')) return;

  event.respondWith(
    caches.match(request).then(cached => {
      const network = fetch(request).then(response => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(request, copy));
        }
        return response;
      }).catch(() => cached);
      return cached || network;
    })
  );
});
