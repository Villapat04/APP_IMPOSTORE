// Cambia la versione quando aggiorni immagini o icone: le vecchie cache vengono cancellate.
const CACHE_NAME = 'impostore-game-v2';

// Solo file statici che esistono davvero in /public.
// La pagina "/" NON va qui: viene sempre presa dalla rete (così gli aggiornamenti arrivano subito)
// e salvata in cache solo come copia di riserva.
const FILE_STATICI = [
  '/manifest.json',
  '/logo_imposter.png',
  '/logo_detective.png',
  '/logo_infiltrato.png',
  '/icon-192.png',
  '/icon-512.png'
];

// 'install': salva i file statici. Ogni file è indipendente: se uno manca, gli altri vengono comunque salvati.
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => Promise.allSettled(FILE_STATICI.map(url => cache.add(url))))
      .then(() => self.skipWaiting())
  );
});

// 'activate': cancella le cache delle versioni precedenti.
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(nomi => Promise.all(nomi.filter(n => n !== CACHE_NAME).map(n => caches.delete(n))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const richiesta = event.request;
  if (richiesta.method !== 'GET') return;

  const url = new URL(richiesta.url);
  // Socket.IO, health check e richieste verso altri siti: sempre e solo rete.
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/socket.io/') || url.pathname === '/health') return;

  // Pagina HTML: prima la rete, la cache solo se si è offline.
  if (richiesta.mode === 'navigate') {
    event.respondWith(
      fetch(richiesta)
        .then(risposta => {
          if (risposta.ok) {
            const copia = risposta.clone();
            caches.open(CACHE_NAME).then(cache => cache.put('/', copia));
          }
          return risposta;
        })
        .catch(() => caches.match('/'))
    );
    return;
  }

  // Immagini e altri file statici: prima la cache, poi la rete.
  event.respondWith(
    caches.match(richiesta).then(inCache => inCache || fetch(richiesta))
  );
});
