/*! coi-serviceworker — cross-origin isolation on a host that cannot set headers.
 *
 * GitHub Pages serves files, not headers, so a static site cannot send
 * `Cross-Origin-Opener-Policy` / `Cross-Origin-Embedder-Policy`. Without them the browser refuses
 * `SharedArrayBuffer`, and without that the Python runtime cannot be interrupted in place — Stop
 * has to terminate the worker and pay the 10 MB load again.
 *
 * A service worker can add headers to responses it controls, so this one re-issues every same-origin
 * response with the isolation pair. The page side registers it once and reloads once; after that the
 * document is isolated and `crossOriginIsolated` is true.
 *
 * Original: Guido Zuidhof and contributors, MIT. Trimmed here to the two branches this site needs.
 */

if (typeof window === 'undefined') {
  // ---- Service worker: add the isolation headers to everything we serve ----
  self.addEventListener('install', () => self.skipWaiting());
  self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

  self.addEventListener('fetch', (event) => {
    const request = event.request;
    // `only-if-cached` may only be used with same-origin, and re-wrapping it throws.
    if (request.cache === 'only-if-cached' && request.mode !== 'same-origin') return;
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.status === 0) return response;
          const headers = new Headers(response.headers);
          headers.set('Cross-Origin-Embedder-Policy', 'require-corp');
          headers.set('Cross-Origin-Opener-Policy', 'same-origin');
          headers.set('Cross-Origin-Resource-Policy', 'cross-origin');
          return new Response(response.body, {
            status: response.status,
            statusText: response.statusText,
            headers,
          });
        })
        .catch((error) => console.error('[coi-serviceworker]', error))
    );
  });
} else {
  // ---- Page: register, then reload exactly once into the isolated document ----
  (() => {
    if (window.crossOriginIsolated) return;
    if (!window.isSecureContext || !('serviceWorker' in navigator)) return;
    const script = document.currentScript;
    navigator.serviceWorker
      .register(script && script.src ? script.src : 'coi-serviceworker.js')
      .then((registration) => {
        if (registration.active && !navigator.serviceWorker.controller) {
          // The worker is already running from a previous visit; this document is not covered yet.
          window.location.reload();
        }
        registration.addEventListener('updatefound', () => window.location.reload());
      })
      .catch((error) => console.error('[coi-serviceworker] registration failed', error));
    navigator.serviceWorker.addEventListener('controllerchange', () => window.location.reload());
  })();
}
