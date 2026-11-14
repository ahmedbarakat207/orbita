// AURA Telemetry Service Worker
const CACHE_NAME = 'aura-telemetry-v2';
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/favicon.svg'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  // Navigation and asset requests fallback to cache if offline
  if (event.request.method !== 'GET') return;

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }
      return fetch(event.request).then((networkResponse) => {
        // Cache external fonts and stylesheets dynamically
        if (
          networkResponse &&
          networkResponse.status === 200 &&
          (event.request.url.includes('fonts.googleapis.com') ||
           event.request.url.includes('fonts.gstatic.com') ||
           event.request.url.includes('cdnjs.cloudflare.com'))
        ) {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
        }
        return networkResponse;
      }).catch(() => {
        // Fallback for HTML documents
        if (event.request.headers.get('accept')?.includes('text/html')) {
          return caches.match('/');
        }
      });
    })
  );
});
