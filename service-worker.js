// ============================================================
// Service Worker: makes the app shell (HTML/CSS/JS) load
// instantly with ZERO internet after the first visit.
// Supabase API calls always go to the network (can't meaningfully
// cache live data), but the app itself will open offline.
// ============================================================
const CACHE_NAME = 'appliance-pos-shell-v1';

const APP_SHELL = [
  './',
  'index.html',
  'pos.html',
  'inventory.html',
  'dashboard.html',
  'staff.html',
  'css/style.css',
  'js/supabase-config.js',
  'js/offline-sync.js',
  'js/offline-cache.js',
  'manifest.json',
  'icons/icon-192.png',
  'icons/icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Never intercept Supabase API/auth calls or other cross-origin
  // requests — those must always go live to the network.
  if (url.origin !== self.location.origin) {
    return;
  }

  // App shell: cache-first, so it opens instantly even offline.
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((response) => {
        // Cache newly-seen same-origin files too (e.g. future pages)
        const clone = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        return response;
      }).catch(() => cached);
    })
  );
});
