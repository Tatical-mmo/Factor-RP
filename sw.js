// Fator RP - service worker: permite instalar o jogo e abrir mais rápido.
// Sempre tenta a rede primeiro (para nunca prender uma versão velha); sem internet, usa a cópia guardada.
const CACHE = 'fator-rp-v1';
self.addEventListener('install', (e) => { self.skipWaiting(); e.waitUntil(caches.open(CACHE).then((c) => c.addAll(['./', './index.html', './manifest.webmanifest']).catch(() => {}))); });
self.addEventListener('activate', (e) => { e.waitUntil(self.clients.claim()); });
self.addEventListener('fetch', (e) => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET') return;
  const mesmoSite = url.origin === self.location.origin, cdn = url.hostname === 'cdn.jsdelivr.net';
  if (!mesmoSite && !cdn) return;                        // banco de dados e login passam direto
  e.respondWith(fetch(req).then((resp) => {
    if (resp.ok && (mesmoSite || cdn)) { const copia = resp.clone(); caches.open(CACHE).then((c) => c.put(req, copia)); }
    return resp;
  }).catch(() => caches.match(req).then((r) => r || caches.match('./index.html'))));
});
