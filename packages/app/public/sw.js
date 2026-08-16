/**
 * Service worker.
 *
 * Written by hand rather than generated, because the generated ones default to
 * precache-everything + cache-first, and that is how a web app strands its players on a
 * build from three months ago with no way to escape short of clearing site data.
 *
 * The strategy is split by what the resource *is*, not by convenience:
 *
 *   /assets/*  — Vite emits these with a content hash in the filename, so they are
 *                immutable by construction. Cache-first is not just safe here, it is
 *                correct: the URL changes when the content does.
 *
 *   navigations — network-first with a cache fallback. A deploy takes effect on the next
 *                 load, and going offline still opens the game. Getting this backwards is
 *                 the single most common PWA bug.
 *
 *   everything else — network-first, cached opportunistically.
 *
 * What is deliberately NOT done: `skipWaiting()`. Swapping the code out from under a running
 * session is how you get a half-updated app mid-fight. The new worker waits, and takes over
 * on the next full load.
 *
 * Saves live in localStorage and are never touched by any of this.
 */

const VERSION = 'v1';
const SHELL_CACHE = `mmasim-shell-${VERSION}`;
const ASSET_CACHE = `mmasim-assets-${VERSION}`;
const SHELL_URL = '/index.html';

/** The bare minimum needed to open the game with no network. */
const SHELL_FILES = ['/', SHELL_URL, '/manifest.webmanifest', '/icon.svg'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) =>
      // Individually, so one 404 on an optional file cannot fail the whole install and
      // leave the app permanently without a worker.
      Promise.allSettled(SHELL_FILES.map((url) => cache.add(url))),
    ),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // Drop every cache from a previous version. Without this the storage quota grows
      // without bound across deploys, and quota exhaustion is what breaks saving.
      const names = await caches.keys();
      await Promise.all(
        names
          .filter((name) => name.startsWith('mmasim-') && !name.endsWith(VERSION))
          .map((name) => caches.delete(name)),
      );

      // Lets navigations start fetching before this worker has finished booting.
      if (self.registration.navigationPreload) {
        await self.registration.navigationPreload.enable();
      }

      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Never interfere with anything that changes state, and never with cross-origin.
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(handleNavigation(event));
    return;
  }

  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(cacheFirst(request, ASSET_CACHE));
    return;
  }

  event.respondWith(networkFirst(request, SHELL_CACHE));
});

/**
 * Navigations: network, then preload, then cache, then the shell.
 *
 * The final fallback matters for a hash-routed SPA — a cold offline load of any URL should
 * still open the game rather than showing the browser's dinosaur.
 */
async function handleNavigation(event) {
  try {
    const preloaded = await event.preloadResponse;
    if (preloaded) {
      void cacheCopy(SHELL_CACHE, SHELL_URL, preloaded.clone());
      return preloaded;
    }

    const fresh = await fetch(event.request);
    void cacheCopy(SHELL_CACHE, SHELL_URL, fresh.clone());
    return fresh;
  } catch {
    const cache = await caches.open(SHELL_CACHE);
    return (
      (await cache.match(event.request)) ??
      (await cache.match(SHELL_URL)) ??
      (await cache.match('/')) ??
      new Response('Offline, and nothing cached yet. Reconnect once to install the game.', {
        status: 503,
        headers: { 'Content-Type': 'text/plain' },
      })
    );
  }
}

/** Immutable, content-hashed assets only. */
async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(request);
  if (hit) return hit;

  const response = await fetch(request);
  if (response.ok) void cache.put(request, response.clone());
  return response;
}

async function networkFirst(request, cacheName) {
  try {
    const response = await fetch(request);
    if (response.ok) void cacheCopy(cacheName, request, response.clone());
    return response;
  } catch {
    const cache = await caches.open(cacheName);
    const hit = await cache.match(request);
    if (hit) return hit;
    throw new Error('Offline and uncached');
  }
}

async function cacheCopy(cacheName, key, response) {
  try {
    const cache = await caches.open(cacheName);
    await cache.put(key, response);
  } catch {
    // A full quota must never break a fetch. The player would rather have a working game
    // than a warm cache, and this is the one place that trade-off gets made.
  }
}

/** Lets the page ask the waiting worker to take over, once the player says it is safe. */
self.addEventListener('message', (event) => {
  if (event.data === 'skipWaiting') self.skipWaiting();
});
