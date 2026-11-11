/* Offline-Cache: erst Netz (damit Updates sofort ankommen), bei Funkloch aus dem Cache. */
const CACHE = 'sj7-v44';
const FILES = ['./', 'index.html', 'style.css', 'app.js', 'live.js', 'team.js', 'invite.js', 'extras.js', 'fun.js', 'check.js', 'photo.js', 'more.js', 'vendor/qrcode.min.js', 'stations.dat', 'manifest.webmanifest', 'icon.svg', 'icon-180.png', 'icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES.map(f => new Request(f, { cache: 'reload' })))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith('sj7-v') && k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  if (url.pathname.includes('/audio/') && !url.pathname.endsWith('.json')) return; // Audio direkt laden (Range-Anfragen)
  // cache: 'no-cache' umgeht den 10-Minuten-HTTP-Cache von GitHub Pages, damit nie alte und neue Dateien gemischt werden
  e.respondWith(fetch(url.href, { cache: 'no-cache', credentials: 'same-origin' }).then(r => {
    if (r.ok) { const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); }
    return r;
  }).catch(() => caches.match(e.request).then(r => r || caches.match(e.request, { ignoreSearch: true }))));
});
