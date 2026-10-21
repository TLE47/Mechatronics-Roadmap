/**
 * The cross-origin isolation pair, defined once.
 *
 * `SharedArrayBuffer` — and so the interrupt-based Stop in the Python runtime — needs a document
 * served with COOP `same-origin` and COEP `require-corp`. GitHub Pages cannot set headers, so the
 * bundle ships `app/public/sw.js` for production; every server the project controls
 * (Vite's dev/preview server, the built-bundle test server, the browser suites) sends them here, so
 * tests exercise the same isolated document a learner gets.
 *
 * Kept in a plain `.mjs` so `vite.config.ts` and the test servers can both import it without a
 * TypeScript build step.
 */
export const ISOLATION_HEADERS = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
};
