// Oduzz OS Service Worker
const CACHE_NAME = 'oduzz-os-v3';
const PRECACHE_ASSETS = [
  '/manifest.json',
  '/favicon.svg',
  '/icons/icon-192.svg',
  '/icons/icon-512.svg',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/apple-touch-icon.png'
];

// Install: Cache essential static icons/manifest & activate immediately
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(PRECACHE_ASSETS);
    })
  );
});

// Activate: Clean up old caches and claim clients immediately
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((name) => {
          if (name !== CACHE_NAME) {
            return caches.delete(name);
          }
        })
      );
    }).then(() => {
      return self.clients.claim();
    })
  );
});

// Fetch: Network-first for HTML & hashed bundles so UI updates appear immediately
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Skip non-GET requests or external API/Supabase traffic
  if (event.request.method !== 'GET') return;
  if (url.origin !== self.location.origin) return;
  if (url.pathname.includes('/rest/v1/') || url.pathname.includes('/auth/v1/')) return;

  // Network-first for navigation and app assets
  event.respondWith(
    fetch(event.request)
      .then((networkResponse) => {
        if (
          networkResponse &&
          networkResponse.status === 200 &&
          networkResponse.type === 'basic'
        ) {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
        }
        return networkResponse;
      })
      .catch(() => {
        return caches.match(event.request).then((cachedResponse) => {
          if (cachedResponse) return cachedResponse;
          if (event.request.mode === 'navigate') {
            return caches.match('/') || caches.match('/index.html');
          }
          return new Response('Offline', {
            status: 503,
            statusText: 'Service Unavailable (Offline)',
          });
        });
      })
  );
});
