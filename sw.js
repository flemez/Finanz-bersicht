// Service Worker – macht die App offline nutzbar (App-Shell-Caching).
// Bei jeder relevanten Änderung an den Dateien die Version erhöhen,
// damit Clients den neuen Stand laden.
const CACHE = 'finanzuebersicht-v19';

const ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/styles.css',
  './js/app.js',
  './js/db.js',
  './js/store.js',
  './js/format.js',
  './js/router.js',
  './js/ui.js',
  './js/icons.js',
  './js/swipe.js',
  './js/views/budget.js',
  './js/views/accounts.js',
  './js/views/buchungen.js',
  './js/views/recurring.js',
  './js/views/categories.js',
  './js/views/more.js',
  './icons/icon.svg',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  // Nur eigene Herkunft bedienen.
  if (url.origin !== self.location.origin) return;

  // Navigationsanfragen: Netzwerk zuerst, sonst App-Shell aus dem Cache.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() => caches.match('./index.html'))
    );
    return;
  }

  // Statische Dateien: Cache zuerst, dann Netzwerk (und nachladen).
  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((response) => {
          if (response && response.status === 200) {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});
