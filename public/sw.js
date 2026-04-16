const STATIC_CACHE = 'zan-static-v1';
const IMAGE_CACHE = 'zan-image-v1';
const STATIC_ASSETS = ['/', '/index.html', '/styles.css', '/app.js', '/manifest.webmanifest'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(STATIC_CACHE).then(cache => cache.addAll(STATIC_ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET') return;

  if (url.pathname.startsWith('/image-cache') || url.pathname.startsWith('/assets/')) {
    event.respondWith(
      caches.open(IMAGE_CACHE).then(async (cache) => {
        const hit = await cache.match(event.request);
        if (hit) return hit;
        const res = await fetch(event.request);
        cache.put(event.request, res.clone());
        return res;
      })
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then(async (hit) => {
      if (hit) return hit;
      try {
        const res = await fetch(event.request);
        if (url.origin === location.origin) {
          const cache = await caches.open(STATIC_CACHE);
          cache.put(event.request, res.clone());
        }
        return res;
      } catch (e) {
        return caches.match('/index.html');
      }
    })
  );
});

self.addEventListener('push', (event) => {
  const data = event.data ? event.data.json() : { title: 'ZAN 1.1', text: 'Новое сообщение' };
  event.waitUntil(self.registration.showNotification(data.title || 'ZAN 1.1', {
    body: data.text || '',
    icon: '/assets/icon-192.png',
    badge: '/assets/icon-192.png'
  }));
});
