/**
 * The recorded room (`app/src/audio/rainAsset.ts`).
 *
 * One file, addressed by URL. Vite hashes it into `dist/assets/` so the browser can cache it
 * forever, and this module is only ever reached through a dynamic import inside the engine's
 * `ensureRain()` — which is why `scripts/test_audio.mjs` can import the engine under Node without
 * meeting an `.m4a`. `new URL(..., import.meta.url)` is used instead of a `?url` import because the
 * import made Vite emit a whole module (and a whole chunk, since this file is loaded dynamically)
 * to carry one string; the URL is resolved into the bundle instead.
 *
 * It is fetched **only after sound is turned on** (see `engine.ts`): a learner who never enables
 * sound downloads no audio at all, and the service worker caches the loop on first success rather
 * than precaching it. Provenance, format and licence: `docs/AUDIO.md` and
 * `app/src/audio/assets/README.md`.
 */
export const RAIN_URL: string = new URL('./assets/rain-loop.m4a', import.meta.url).href;
