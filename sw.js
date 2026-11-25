// Fator RP - service worker: permite instalar o jogo e abrir mais rápido.
// 22q: dois jeitos de buscar:
//  - página e código (html, js, manifesto): rede primeiro, para nunca prender uma versão velha; sem internet, a cópia;
//  - arquivos pesados (modelos 3D, texturas, imagens, sons curtos, fontes e a biblioteca 3D da CDN): sai na hora da
//    cópia guardada no aparelho e a cópia é atualizada por trás. Da segunda vez em diante o jogo não baixa tudo de
//    novo: abre mais rápido e não engasga enquanto os modelos chegam.
const CACHE = 'fator-rp-v2', PESADOS = 'fator-rp-arquivos-v1';
self.addEventListener('install', (e) => { self.skipWaiting(); e.waitUntil(caches.open(CACHE).then((c) => c.addAll(['./', './index.html', './manifest.webmanifest']).catch(() => {}))); });
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE && k !== PESADOS).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
const ehPesado = (url, cdn) => /\.(glb|gltf|bin|webp|png|jpe?g|ktx2|hdr|woff2?|ogg|wav)$/i.test(url.pathname) || (cdn && /\/three@[\d.]+\//.test(url.pathname));
self.addEventListener('fetch', (e) => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET') return;
  const mesmoSite = url.origin === self.location.origin, cdn = url.hostname === 'cdn.jsdelivr.net';
  if (!mesmoSite && !cdn) return;                        // banco de dados e login passam direto
  if (/\.(mp4|mp3)$/i.test(url.pathname) || req.headers.has('range')) return;   // vídeo e música: o navegador busca em pedaços (não guarda)
  if (ehPesado(url, cdn)) {   // da cópia na hora; atualiza por trás
    e.respondWith(caches.open(PESADOS).then(async (c) => {
      const guardado = await c.match(req);
      const rede = fetch(req).then((resp) => { if (resp.ok) c.put(req, resp.clone()); return resp; }).catch(() => guardado);
      if (guardado) { e.waitUntil(rede.catch(() => {})); return guardado; }
      return rede;
    }));
    return;
  }
  e.respondWith(fetch(req).then((resp) => {
    if (resp.ok) { const copia = resp.clone(); caches.open(CACHE).then((c) => c.put(req, copia)); }
    return resp;
  }).catch(() => caches.match(req).then((r) => r || caches.match('./index.html'))));
});
