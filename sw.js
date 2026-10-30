// Offline: serve from cache instantly, refresh the cache in the background.
// After you change a file, the update shows on the second launch.
const CACHE = 'gym';
const FILES = ['./', 'index.html', 'app.js', 'programme.js', 'manifest.webmanifest', 'icon-180.png', 'icon-512.png'];

self.addEventListener('install', e => e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting())));
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET' || e.request.cache === 'no-store' || new URL(e.request.url).pathname.endsWith('.mp4')) return; // the tutorial video streams, it isn't stored offline; Check for updates goes to the network
  e.respondWith(caches.open(CACHE).then(async c => {
    const hit = await c.match(e.request, { ignoreSearch: true });
    const net = fetch(e.request).then(r => { if (r.ok) c.put(e.request, r.clone()); return r; }).catch(() => hit);
    return hit || net;
  }));
});
