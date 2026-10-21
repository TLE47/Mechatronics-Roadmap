/*! MechaLab's service worker: the app, offline — and cross-origin isolation on a host that cannot set
 *  headers.
 *
 * Two jobs, one worker, because a page can only be controlled by one of them:
 *
 * 1. **Isolation.** GitHub Pages serves files, not headers, so a static site cannot send
 *    `Cross-Origin-Opener-Policy` / `Cross-Origin-Embedder-Policy`. Without them the browser refuses
 *    `SharedArrayBuffer`, and without that the Python runtime cannot be interrupted in place — Stop
 *    would have to terminate the worker and pay the 10 MB load again. This worker re-issues same-origin
 *    responses with the pair. The page registers it once and reloads once; after that the document is
 *    isolated and `crossOriginIsolated` is true. (This is what `coi-serviceworker.js` used to do, by
 *    Guido Zuidhof and contributors, MIT.)
 *
 * 2. **Offline.** The shell, the built assets and the lesson registry are cached on install and updated
 *    in the background, so a second visit starts without the network and a reload offline still opens
 *    the workbench and its lessons. Same-origin assets are cache-first with a background refresh, which
 *    is what makes a repeat visit instant; the shell itself is network-first, so a deploy is picked up
 *    as soon as it is reachable.
 *
 * What this does NOT cache: the Python runtime. Pyodide is loaded inside a blob-URL worker, and a
 * service worker does not control blob workers, so its CDN fetches never reach this handler. Offline
 * *reading* works; offline *running* needs the worker to move to a real module URL (see
 * docs/PLAN-2.0-GAP.md).
 *
 * The page half lives at the bottom: `if (typeof window !== 'undefined')`. One file, no build step,
 * because the same script has to be served byte-for-byte from `public/`.
 */

const VERSION = 'v1';
const SHELL_CACHE = `mechalab-shell-${VERSION}`;
const ASSET_CACHE = `mechalab-assets-${VERSION}`;
// The shell is `./` and its document; the hashed bundle files are picked up as they are requested.
const SHELL_URLS = ['./', './index.html', './manifest.webmanifest', './favicon.svg'];
const OWN_CACHES = [SHELL_CACHE, ASSET_CACHE];

if (typeof window === 'undefined') {
  self.addEventListener('install', (event) => {
    event.waitUntil(
      (async () => {
        const cache = await caches.open(SHELL_CACHE);
        // A first visit that is already offline must not fail the install: whatever can be fetched is
        // cached, and the missing entries are fetched on the next online load.
        await Promise.all(
          SHELL_URLS.map((url) => cache.add(url).catch(() => undefined))
        );
        await self.skipWaiting();
      })()
    );
  });

  self.addEventListener('activate', (event) => {
    event.waitUntil(
      (async () => {
        const names = await caches.keys();
        await Promise.all(
          names
            .filter((name) => name.startsWith('mechalab-') && !OWN_CACHES.includes(name))
            .map((name) => caches.delete(name))
        );
        await self.clients.claim();
      })()
    );
  });

  /** Add the isolation pair to a response this origin served, so the document is cross-origin isolated. */
  function withIsolation(response) {
    if (!response || response.status === 0) return response;
    const headers = new Headers(response.headers);
    headers.set('Cross-Origin-Embedder-Policy', 'require-corp');
    headers.set('Cross-Origin-Opener-Policy', 'same-origin');
    headers.set('Cross-Origin-Resource-Policy', 'cross-origin');
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  }

  /** The shell: the network first (so a deploy is picked up), the cached document when it is not there. */
  async function shellFirst(request) {
    try {
      const response = await fetch(request);
      if (response && response.ok) {
        const cache = await caches.open(SHELL_CACHE);
        cache.put('./index.html', response.clone()).catch(() => undefined);
      }
      return withIsolation(response);
    } catch (error) {
      const cache = await caches.open(SHELL_CACHE);
      const cached = (await cache.match('./index.html')) ?? (await cache.match('./'));
      if (cached) return withIsolation(cached);
      throw error;
    }
  }

  /** Cache-first with a background refresh: instant repeats, and a deploy lands on the next load. */
  async function cacheFirst(request, cacheName, event) {
    const cache = await caches.open(cacheName);
    const cached = await cache.match(request);
    const network = fetch(request)
      .then((response) => {
        if (response && response.ok) cache.put(request, response.clone()).catch(() => undefined);
        return response;
      })
      .catch(() => undefined);
    if (cached) {
      event.waitUntil(network);
      return withIsolation(cached);
    }
    const fresh = await network;
    if (!fresh) throw new Error(`offline and not cached: ${request.url}`);
    return withIsolation(fresh);
  }

  self.addEventListener('fetch', (event) => {
    const request = event.request;
    if (request.method !== 'GET') return;
    // `only-if-cached` may only be used with same-origin, and re-wrapping it throws.
    if (request.cache === 'only-if-cached' && request.mode !== 'same-origin') return;

    const url = new URL(request.url);
    if (url.origin !== self.location.origin) return;
    // The CDN (Pyodide) and anything else third-party is left to the browser: this worker does not
    // control the blob worker that loads Python, so caching it here would only be dead weight.

    if (request.mode === 'navigate') {
      event.respondWith(shellFirst(request));
      return;
    }
    event.respondWith(cacheFirst(request, ASSET_CACHE, event));
  });
} else {
  // ---- Page: register, then reload exactly once into the isolated document ----
  (() => {
    // A host that sends the headers itself (`npm run dev`, `preview`) needs no worker, and a worker in
    // front of the dev server would cache HMR modules. Production is the host that needs this.
    if (window.crossOriginIsolated) return;
    if (!window.isSecureContext || !('serviceWorker' in navigator)) return;
    const script = document.currentScript;
    const swUrl = script && script.src ? script.src : 'sw.js';
    navigator.serviceWorker
      .register(swUrl)
      .then((registration) => {
        if (registration.active && !navigator.serviceWorker.controller) {
          // Already running from a previous visit; this document is not covered yet.
          window.location.reload();
          return;
        }
        navigator.serviceWorker.addEventListener('controllerchange', () => window.location.reload());
      })
      .catch((error) => console.error('[sw] registration failed', error));
  })();
}
