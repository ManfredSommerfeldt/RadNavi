// Service Worker für Rad-Navi: cached App-Shell + Kartenkacheln für Offline-Nutzung.
// Bei größeren Änderungen an der App: CACHE_NAME hochzählen, damit alte Caches ersetzt werden.
const CACHE_NAME = 'rad-navi-v3';

const SHELL_URLS = [
  './',
  './index.html',
  'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.css',
  'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.js'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(SHELL_URLS))
      .catch(() => {}) // falls z.B. index.html unter anderem Pfad liegt, nicht blockieren
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(names =>
      Promise.all(names.filter(n => n !== CACHE_NAME).map(n => caches.delete(n)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  if(event.request.method !== 'GET') return;

  // App-Shell-Seite: immer die frischeste Version laden, wenn online (verhindert,
  // dass ein Homescreen-Shortcut dauerhaft eine alte/kaputte Version zeigt).
  // Nur offline auf die zuletzt gecachte Version zurückfallen.
  const isNavigation = event.request.mode === 'navigate' || event.request.destination === 'document';
  if(isNavigation){
    event.respondWith(
      fetch(event.request).then(response => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy)).catch(() => {});
        return response;
      }).catch(() => caches.match(event.request).then(cached => cached || caches.match('./index.html')))
    );
    return;
  }

  const isTile = event.request.url.includes('tile.openstreetmap.org');

  event.respondWith(
    caches.match(event.request).then(cached => {
      const network = fetchAndCache(event.request, isTile);
      if(cached){
        // Im Hintergrund aktualisieren, aber sofort die gecachte Version zurückgeben
        network.catch(() => {});
        return cached;
      }
      return network.catch(() => cached);
    })
  );
});

function fetchAndCache(request, isTile){
  // Kachel-Server senden keine CORS-Header -> no-cors, damit das Bild trotzdem
  // gecached und später wieder angezeigt werden kann (opaque response).
  const req = isTile ? new Request(request.url, { mode:'no-cors' }) : request;
  return fetch(req).then(response => {
    const copy = response.clone();
    caches.open(CACHE_NAME).then(cache => cache.put(request, copy)).catch(() => {});
    return response;
  });
}
