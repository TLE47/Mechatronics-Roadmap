/**
 * The recorded room (`app/src/audio/rainAsset.ts`).
 *
 * One file, imported for its URL. Vite hashes it into `dist/assets/` so the browser can cache it
 * forever, and the import is only ever reached through a dynamic import inside the engine's
 * `ensureRain()` — which is why `scripts/test_audio.mjs` can import the engine under Node without
 * meeting an `.m4a`.
 *
 * It is fetched **only after sound is turned on** (see `engine.ts`): a learner who never enables
 * sound downloads no audio at all, and the service worker caches the loop on first success rather
 * than precaching it. Provenance, format and licence: `docs/AUDIO.md` and
 * `app/src/audio/assets/README.md`.
 */
import rainUrl from './assets/rain-loop.m4a?url';

export const RAIN_URL: string = rainUrl;
