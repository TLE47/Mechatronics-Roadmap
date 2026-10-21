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
 * 3. **The Python runtime.** Pyodide is fetched from a CDN by a worker, so the worker had to stop being
 *    a blob (a service worker controls only real URLs). `pythonWorker.js` is a module worker served from
 *    this origin, which puts it in scope: its `pyodide.mjs`, `pyodide.asm.wasm`, the stdlib zip and any
 *    wheel it loads are cached here, and a lesson still runs with the network off.
 *
 * The page half lives at the bottom: `if (typeof window !== 'undefined')`. One file, no build step,
 * because the same script has to be served byte-for-byte from `public/`.
 */

const VERSION = 'v1';
const SHELL_CACHE = `mechalab-shell-${VERSION}`;
const ASSET_CACHE = `mechalab-assets-${VERSION}`;
// The interpreter and its wheels: ~10 MB, and the reason a run works offline after one online run.
const PYODIDE_CACHE = `mechalab-pyodide-${VERSION}`;
// The shell is `./` and its document; the hashed bundle files are picked up as they are requested.
const SHELL_URLS = ['./', './index.html', './manifest.webmanifest', './favicon.svg'];
const OWN_CACHES = [SHELL_CACHE, ASSET_CACHE, PYODIDE_CACHE];
// Pyodide's CDN. Everything under this prefix is immutable for a version, so cache-first is safe.
const PYODIDE_CDN = 'cdn.jsdelivr.net';

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
    // Only this origin's responses: a CDN response is not part of the document's isolation decision, and
    // re-wrapping an opaque one is impossible anyway.
    try {
      if (new URL(response.url).origin !== self.location.origin) return response;
    } catch {
      return response;
    }
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

  /**
   * Cache a list of same-origin URLs and report what it cost.
   *
   * `self.fetch` inside a service worker does **not** pass through this worker's own `fetch` handler -
   * a worker never intercepts itself - so "the request will be cached on the way past" is false here:
   * every response has to be put into the cache explicitly, which is also what makes the byte count
   * possible. `cache: 'reload'` is deliberate: the point of the button is to take what is current, not
   * a stale entry the browser is holding.
   */
  async function warmInto(cacheName, urls) {
    const cache = await caches.open(cacheName);
    let entries = 0;
    let bytes = 0;
    await Promise.all(
      urls.map(async (url) => {
        try {
          const request = new Request(url, { cache: 'reload' });
          const response = await fetch(request);
          if (!response || !response.ok) return;
          const size = Number(response.headers.get('content-length')) || 0;
          await cache.put(request, response.clone());
          entries += 1;
          bytes += size || (await response.clone().blob()).size;
        } catch (error) {
          // One missing asset (a font this build does not use, a 404) must not fail the whole warm.
        }
      })
    );
    return { entries, bytes };
  }

  /**
   * The "take this step offline" button, over a MessageChannel.
   *
   * The page sends the URLs it is actually running (its own script, styles, manifest, favicon) rather
   * than the worker keeping a copy of a build's hashed file names, which change every deploy. The reply
   * is the measured cost, so the button can say what it took rather than "done".
   */
  self.addEventListener('message', (event) => {
    const data = event.data || {};
    if (data.type !== 'warm') return;
    const port = event.ports && event.ports[0];
    const urls = Array.isArray(data.urls)
      ? Array.from(new Set(data.urls.filter((url) => typeof url === 'string')))
      : [];
    event.waitUntil(
      (async () => {
        const sameOrigin = urls.filter((url) => {
          try {
            return new URL(url, self.location.href).origin === self.location.origin;
          } catch {
            return false;
          }
        });
        const shellish = sameOrigin.filter((url) => /\/(index\.html)?$|manifest\.webmanifest$|favicon\.[a-z]+$/.test(url));
        const assets = sameOrigin.filter((url) => !shellish.includes(url));
        const [shell, bundle] = await Promise.all([
          warmInto(SHELL_CACHE, shellish),
          warmInto(ASSET_CACHE, assets),
        ]);
        if (port) {
          port.postMessage({
            type: 'warm-done',
            entries: shell.entries + bundle.entries,
            bytes: shell.bytes + bundle.bytes,
          });
        }
      })()
    );
  });

  self.addEventListener('fetch', (event) => {
    const request = event.request;
    if (request.method !== 'GET') return;
    // `only-if-cached` may only be used with same-origin, and re-wrapping it throws.
    if (request.cache === 'only-if-cached' && request.mode !== 'same-origin') return;

    const url = new URL(request.url);
    if (url.origin !== self.location.origin) {
      // The interpreter comes from a CDN; the module worker that loads it is in this worker's scope, so
      // these are ordinary requests to cache. Anything else third-party is left to the browser.
      if (url.hostname === PYODIDE_CDN && url.pathname.startsWith('/pyodide/')) {
        event.respondWith(cacheFirst(request, PYODIDE_CACHE, event));
      }
      return;
    }

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
