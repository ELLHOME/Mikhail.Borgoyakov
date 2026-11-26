/* Силуэтика service worker: offline app shell + runtime cache for same-origin assets. */
const VERSION = '20261124-35';
const SHELL_CACHE = `siluetika-shell-${VERSION}`;
const RUNTIME_CACHE = 'siluetika-runtime-v1';
const FONT_CACHE = 'siluetika-fonts-v1';
const NAV_TIMEOUT_MS = 4500;
const FONT_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com'];

const V = `?v=${VERSION}`;
const SHELL_URLS = [
  './',
  `./css/styles.css${V}`,
  `./css/glass.css${V}`,
  ...[
    'app', 'cv-analyzer', 'exercise-animator', 'exercises-db', 'plan-generator', 'music-player',
    'hero-orb', 'glass', 'heart-rate', 'sample-photos', 'storage', 'pwa',
  ].map((name) => `./js/${name}.js${V}`),
  './manifest.webmanifest',
  './assets/brand/siluetika-mark.svg',
  './assets/brand/favicon.svg',
  './assets/brand/favicon-64.png',
  './assets/brand/icon-192.png',
];

const ROOT_URL = new URL('./', self.registration.scope).href;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE)
      .then((cache) => cache.addAll(SHELL_URLS.map((url) => new Request(url, { cache: 'reload' }))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys
      .filter((key) => key.startsWith('siluetika-shell-') && key !== SHELL_CACHE)
      .map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

// Assets the page loaded before this worker took control, so they work offline too.
self.addEventListener('message', (event) => {
  const data = event.data || {};
  if (data.type !== 'warm' || !Array.isArray(data.urls)) return;
  event.waitUntil((async () => {
    const runtime = await caches.open(RUNTIME_CACHE);
    for (const url of data.urls.slice(0, 200)) {
      try {
        const parsed = new URL(url);
        const font = FONT_HOSTS.includes(parsed.hostname);
        if (!font && (parsed.origin !== self.location.origin || isBypassed(parsed))) continue;
        if (await caches.match(url)) continue;
        const res = await fetch(url);
        if (res.ok) await (font ? caches.open(FONT_CACHE) : Promise.resolve(runtime)).then((c) => c.put(url, res));
      } catch { /* best effort */ }
    }
  })());
});

function isBypassed(url) {
  return url.pathname.includes('/api/') || url.pathname.endsWith('/sw.js');
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || req.headers.has('range')) return;
  const url = new URL(req.url);

  if (FONT_HOSTS.includes(url.hostname)) {
    event.respondWith(staleWhileRevalidate(event, req, FONT_CACHE));
    return;
  }
  if (url.origin !== self.location.origin || isBypassed(url)) return;

  if (req.mode === 'navigate') {
    event.respondWith(navigate(event, req));
    return;
  }
  if (url.searchParams.has('v')) {
    event.respondWith(cacheFirst(req, SHELL_CACHE));
    return;
  }
  event.respondWith(staleWhileRevalidate(event, req, RUNTIME_CACHE));
});

async function navigate(event, req) {
  const cache = await caches.open(SHELL_CACHE);
  const network = fetch(req).then((res) => {
    if (res.ok && res.type === 'basic') cache.put(ROOT_URL, res.clone());
    return res;
  });
  event.waitUntil(network.catch(() => {}));
  const cached = await caches.match(ROOT_URL);
  if (!cached) return network;
  const timeout = new Promise((resolve) => setTimeout(() => resolve(cached), NAV_TIMEOUT_MS));
  return Promise.race([network, timeout]).catch(() => cached);
}

async function cacheFirst(req, cacheName) {
  const cached = await caches.match(req);
  if (cached) return cached;
  const res = await fetch(req);
  if (res.ok) (await caches.open(cacheName)).put(req, res.clone());
  return res;
}

async function staleWhileRevalidate(event, req, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(req);
  const network = fetch(req).then((res) => {
    if (res.ok || res.type === 'opaque') cache.put(req, res.clone());
    return res;
  });
  if (cached) {
    event.waitUntil(network.catch(() => {}));
    return cached;
  }
  return network;
}
