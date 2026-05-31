// FinMente Service Worker — PWA "Add to Home Screen"
const CACHE = 'finmente-v1';

// Archivos a cachear al instalar (shell mínimo para que cargue offline)
const PRECACHE = [
  '/',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png',
  '/apple-touch-icon.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(PRECACHE))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  // Borra caches viejos
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  const { request } = e;
  const url = new URL(request.url);

  // Solo cachear GET del mismo origen (no las llamadas a la API)
  if (request.method !== 'GET') return;
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/backend/')) return;

  e.respondWith(
    caches.match(request).then((cached) => {
      // Network-first: intenta red, si falla devuelve cache
      return fetch(request)
        .then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE).then((c) => c.put(request, clone));
          }
          return response;
        })
        .catch(() => {
          if (cached) return cached;
          // Solo hacer fallback al shell para navegación HTML
          if (request.mode === 'navigate' || request.destination === 'document') {
            return caches.match('/');
          }
          return Response.error();
        });
    })
  );
});
