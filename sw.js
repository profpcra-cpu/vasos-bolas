/* ============================================================
   Service Worker — Ball Sort Puzzle PWA
   Estratégia:
   - App Shell (HTML/CSS/JS/ícones): Cache First
   - Fonts (Google): Stale-While-Revalidate
   - Tudo mais: Network First com fallback pro cache
   ============================================================ */

const VERSION = 'v1.0.0';
const CACHE_STATIC = `ballsort-static-${VERSION}`;
const CACHE_RUNTIME = `ballsort-runtime-${VERSION}`;
const CACHE_FONTS = `ballsort-fonts-${VERSION}`;

// Arquivos essenciais (App Shell)
const STATIC_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable.png',
  './icons/apple-touch-icon.png',
  './icons/favicon-32.png'
];

// ============================================================
// INSTALL — Pré-cache do App Shell
// ============================================================
self.addEventListener('install', (event) => {
  console.log('[SW] Install', VERSION);
  event.waitUntil(
    caches.open(CACHE_STATIC)
      .then(cache => cache.addAll(STATIC_ASSETS))
      .then(() => self.skipWaiting()) // Ativa imediatamente
      .catch(err => console.warn('[SW] Falha no pré-cache:', err))
  );
});

// ============================================================
// ACTIVATE — Limpa caches antigos
// ============================================================
self.addEventListener('activate', (event) => {
  console.log('[SW] Activate', VERSION);
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys
          .filter(key => !key.endsWith(VERSION))
          .map(key => {
            console.log('[SW] Removendo cache antigo:', key);
            return caches.delete(key);
          })
      );
    }).then(() => self.clients.claim())
  );
});

// ============================================================
// FETCH — Estratégias por tipo de recurso
// ============================================================
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Ignora requisições não-GET e extensões de browser
  if (request.method !== 'GET') return;
  if (!url.protocol.startsWith('http')) return;

  // Fonts do Google → Stale-While-Revalidate
  if (url.hostname.includes('fonts.googleapis.com') ||
      url.hostname.includes('fonts.gstatic.com')) {
    event.respondWith(staleWhileRevalidate(request, CACHE_FONTS));
    return;
  }

  // Navegação (HTML) → Network First com fallback
  if (request.mode === 'navigate') {
    event.respondWith(networkFirstWithFallback(request, './index.html'));
    return;
  }

  // Recursos locais (JS, CSS, imagens, manifest) → Cache First
  if (url.origin === location.origin) {
    event.respondWith(cacheFirst(request, CACHE_STATIC));
    return;
  }

  // Resto → Network First
  event.respondWith(networkFirstWithFallback(request));
});

// ============================================================
// ESTRATÉGIAS
// ============================================================

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch (err) {
    // Sem rede e sem cache
    return new Response('Offline', { status: 503, statusText: 'Offline' });
  }
}

async function networkFirstWithFallback(request, fallbackUrl) {
  const cache = await caches.open(CACHE_RUNTIME);
  try {
    const response = await fetch(request);
    if (response.ok && request.method === 'GET') {
      cache.put(request, response.clone());
    }
    return response;
  } catch (err) {
    const cached = await cache.match(request);
    if (cached) return cached;
    if (fallbackUrl) {
      const fallback = await caches.match(fallbackUrl);
      if (fallback) return fallback;
    }
    return new Response('Offline', { status: 503, statusText: 'Offline' });
  }
}

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);

  const fetchPromise = fetch(request).then(response => {
    if (response.ok) cache.put(request, response.clone());
    return response;
  }).catch(() => cached);

  return cached || fetchPromise;
}

// ============================================================
// MESSAGES (para forçar update pelo app)
// ============================================================
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
