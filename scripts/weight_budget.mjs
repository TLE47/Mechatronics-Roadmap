/**
 * The weight budget: what the built workbench is allowed to cost (`scripts/weight_budget.mjs`).
 *
 * The music ids are read from the catalogue (`app/src/audio/musicCatalogue.ts`), so this file names no
 * tape itself: adding one there is enough for `music` to know about it.
 *
 * The Pages bundle is the whole product — there is no server to move work to — so a careless
 * dependency or an un-split import is a learner on a phone waiting for bytes. Nothing measured that
 * until now: `e2e_pages_bundle.mjs` proves the assets are *there*, not what they weigh.
 *
 * What is measured, and why each number:
 *
 * - **`js_gzip`** — the sum of every `.js` in `dist/assets`, gzipped. This is what a first load
 *   actually transfers (the CDN gzips; the browser gets the compressed bytes).
 * - **`css_gzip`** — the same for `.css`. Tailwind emits one file, so this is also the whole stylesheet.
 * - **`fonts`** — every emitted face, counted as its file size: the two self-hosted variable faces
 *   and KaTeX's 19 maths faces. woff2 is already compressed, so gzipping it again would flatter the
 *   number. This is emitted weight, not the cost of a visit — a browser fetches a face only when a
 *   rendered glyph needs it — but a bundle that has to work offline carries all of them.
 * - **`largest_js_gzip`** — the biggest single chunk. A total can stay flat while one route's chunk
 *   doubles and its own first paint gets slower; this is the number that notices. * - **`entry_gzip`** — the document plus everything `index.html` names: its module script, the
 *     chunks it preloads, and its stylesheets. This is what a first paint waits for, and it is the
 *     number a chunk split is supposed to move; `total` cannot, because a chunk nobody opens is
 *     still emitted into `dist/`.
 * - **`prose_gzip`** — the searchable course pages (`dist/prose-index.json`), which the app fetches
 *   only the first time `⌘⇧F` is opened. It is measured on its own rather than folded into
 *   `js_gzip` or `total`: it is neither JavaScript nor part of a first paint, and a ceiling that
 *   counted it with the shell would make a learner who never searches pay for it in the report.
 *   A budget with no file behind it fails like every other unmeasured metric.
 * - **`reader_gzip`** — every reader payload under `dist/lesson-pages/**`, summed. It is the same
 *   kind of number as `prose_gzip`: served beside the bundle, fetched one page at a time when a
 *   lesson opens, and neither JavaScript nor part of a first paint. Summed rather than averaged
 *   because the ceiling is on what a course costs if every lesson is read; a single page's ceiling
 *   would let a slow page hide among fast ones.
 * - **`audio`** — the room's recorded file at its own size: the rain loop
 *   (`app/src/audio/assets/rain-loop.m4a`). Audio is already compressed, so gzipping it again would
 *   flatter the number, and the metric exists so a second room file cannot arrive unnoticed. It is in
 *   `total` because it ships in the bundle, but it is fetched only after sound is turned on — see
 *   `docs/AUDIO.md`.
 * - **`music`** — the tapes (`app/src/audio/assets/music/*.m4a`, one file per entry in
 *   `musicCatalogue.ts`), at their own size for the same reason, and split from `audio` so a 400 kB
 *   lo-fi track cannot hide inside a room-tone budget. All eight are inside `total` and outside
 *   `entry_gzip`: a learner who leaves sound off fetches none, and one who chooses the drone fetches
 *   none either. The ids come from the catalogue rather than a second hand-written list, so a tape
 *   added there is measured here without anyone remembering to edit this file.
 * - **`total`** — everything emitted (assets plus the document): a ceiling on the bundle as a whole,
 *     not the cost of a visit. A split raises this slightly (chunk headers) while lowering
 *     `entry_gzip`, which is exactly the trade the report is meant to show.
 *
 * The comparison is pure (`compareBudgets`) so a unit suite can pin every direction — a metric under
 * budget, exactly at it, over it by one byte, missing from the measurement, and a budget for a metric
 * nothing measured — without building anything.
 *
 * A byte budget is deterministic, which is why it is a gate. Wall-clock timings are not: a shared CI
 * runner's variance is larger than any regression this app could plausibly ship, and a flaky gate is
 * a gate somebody turns off.
 */

import { MUSIC_TAPES } from '../app/src/audio/musicCatalogue.ts';

/** The metrics the budget covers, in the order the report prints them. */
export const METRICS = [
  'entry_gzip',
  'js_gzip',
  'css_gzip',
  'fonts',
  'largest_js_gzip',
  'prose_gzip',
  'reader_gzip',
  'audio',
  'music',
  'total',
];

/** The container formats the room may be recorded in. One file today; the list is the ceiling's. */
const AUDIO_FILE = /\.(m4a|aac|mp3|ogg|opus|flac|wav|webm)$/i;
/**
 * The music tapes, by the ids in `app/src/audio/musicCatalogue.ts`.
 *
 * Imported rather than copied: the catalogue has no imports of its own that Node cannot parse, and a
 * second hand-written list is exactly the way a new tape ends up counted as room tone.
 */
const MUSIC_IDS = MUSIC_TAPES.map((tape) => tape.id);

export const isMediaFile = (name) => AUDIO_FILE.test(name);

/**
 * True for a tape, whatever Vite named the emitted file.
 *
 * A source path is `…/assets/music/winter-blues.m4a`, but the bundle emits
 * `assets/winter-blues-B1c2D3e4.m4a`: the directory is gone and a hash is appended. Matching on the id
 * prefix plus the separator is what survives both shapes without a regex per id.
 */
export const isMusicFile = (name) => {
  if (!AUDIO_FILE.test(name)) return false;
  const base = name.split('/').pop() ?? name;
  return MUSIC_IDS.some((id) => base.startsWith(`${id}.`) || base.startsWith(`${id}-`));
};

/** `1234567` -> `1.18 MB`, `45678` -> `44.6 kB` — a size a person reads without arithmetic. */
export function formatBytes(bytes) {
  if (!Number.isFinite(bytes)) return '—';
  if (bytes < 1000) return `${Math.round(bytes)} B`;
  if (bytes < 1000 * 1000) return `${(bytes / 1000).toFixed(1)} kB`;
  return `${(bytes / (1000 * 1000)).toFixed(2)} MB`;
}

/** `0.04` over budget -> `+4%`; a failure message reads "over by 26.0 kB (+4%)". */
export function formatHeadroom(measured, budget) {
  if (!Number.isFinite(measured) || !Number.isFinite(budget) || budget <= 0) return '—';
  const ratio = (measured - budget) / budget;
  const percent = Math.round(ratio * 100);
  return `${percent >= 0 ? '+' : ''}${percent}%`;
}

/** How much of its budget a metric spends: `92%`. The report's column, because it never reads as
 *  a negative amount of room. */
export function formatUsed(measured, budget) {
  if (!Number.isFinite(measured) || !Number.isFinite(budget) || budget <= 0) return '—';
  return `${Math.round((measured / budget) * 100)}%`;
}

/**
 * Compare a measurement against the recorded budget.
 *
 * `measured` and `budget` are `{ metric: bytes }`. A metric is a **breach** when it is over its
 * budget; an **unmeasured metric** (a budget with nothing measured behind it) is a problem of its
 * own, because a budget that measures nothing always passes; a metric the build produced that has no
 * budget is reported but does not fail — new weight should be recorded deliberately, and the report
 * says so.
 */
export function compareBudgets(measured, budget) {
  const rows = METRICS.map((metric) => {
    const have = measured[metric];
    const limit = budget[metric];
    return {
      metric,
      measured: Number.isFinite(have) ? have : null,
      budget: Number.isFinite(limit) ? limit : null,
      headroom: Number.isFinite(have) && Number.isFinite(limit) ? limit - have : null,
      verdict:
        !Number.isFinite(have) || !Number.isFinite(limit)
          ? 'unmeasured'
          : have > limit
          ? 'over'
          : 'within',
    };
  });
  return {
    rows,
    breaches: rows.filter((row) => row.verdict === 'over'),
    unmeasured: rows.filter((row) => row.verdict === 'unmeasured'),
    // The slack left in the tightest metric: the whole budget in one number.
    tightest: rows
      .filter((row) => row.headroom !== null)
      .sort((left, right) => left.headroom - right.headroom)[0] ?? null,
  };
}

/**
 * Which build this one is, from the file names it emitted.
 *
 * The bundle has two shapes and the gate has to know which one it is measuring. Without the Supabase
 * variables at build time (`npm run build` on a fresh clone) the account panel's library is never
 * imported, so `vendor-auth` is not emitted and the bundle is `local_only`. With them set — a CI
 * build, where the anon key is a repository variable — every visitor downloads a shell that also
 * carries those bytes, so the ceilings that count emitted bytes have to be higher for it. Run 207 is
 * why: the CI build measured `entry_gzip` at 532.6 kB against the 480 kB ceiling, a real breach that
 * only ever happened on the runner, because the library had landed in the preloaded `vendor` chunk.
 * (The chunk split is the fix; this is the gate that keeps the two shapes honest.)
 *
 * Detection is by what the account chunk actually **contains**, not by whether the file exists or by
 * reading the environment. Both builds emit a `vendor-auth` chunk — Vite names the dynamic import
 * before it knows the library will not be used — but with the variables unset the branch is folded
 * away and the chunk is a one-byte stub. So the shape is "the chunk carries code", measured on the
 * chunk's raw size: a stub is bytes, the library is tens of kilobytes. Reading `process.env` would be
 * wrong as well as unavailable, because CI sets the variables on the build step only, not on the gate.
 */
export const VARIANTS = ['local_only', 'signed_in'];

/** Raw bytes above which the account chunk is code rather than the folded-away stub. */
const ACCOUNT_CHUNK_STUB_BYTES = 1024;

export function buildVariant(files) {
  return files.some(
    (file) =>
      /(^|\/)vendor-auth[a-zA-Z0-9._-]*\.js$/.test(file.name) &&
      file.size > ACCOUNT_CHUNK_STUB_BYTES
  )
    ? 'signed_in'
    : 'local_only';
}

/**
 * The shape a run still has to build: the one that ships.
 *
 * A `signed_in` build on disk is already that shape, and CI's is signed_in by construction. A
 * `local_only` build on disk — a fresh clone, every developer without `app/.env.local` — has never
 * been graded with the account library present, which is the state in which Run 207's entry breach
 * was invisible until the push. So the gate builds `signed_in` itself; it does not try to build
 * `local_only` beside a signed-in `dist/`, because unwinding a developer's `.env.local` is not the
 * gate's business and the local-only shape is what that machine's `npm run dev` and the rest of the
 * local suite already use.
 */
export function shapeToBuild(variant) {
  return variant === 'local_only' ? 'signed_in' : null;
}

/**
 * The two variables a shape is decided by, and the stand-ins a build-only check uses for them.
 *
 * The placeholders are never connected to: they exist so the account branch stays live and the
 * library is really emitted, which is the only thing a weight measurement needs. `accountsConfigured`
 * cannot tell a placeholder from a real project — the panel offers a sign-in field either way — but
 * this bundle is written to `dist-signed-in/`, measured, and deleted, never served to a person.
 * Nothing here is a secret, and nothing is written to a file.
 */
export const SHAPE_PLACEHOLDERS = {
  VITE_SUPABASE_URL: 'https://placeholder.invalid',
  VITE_SUPABASE_ANON_KEY: 'local-verification-placeholder',
};

/**
 * The environment the missing signed-in shape is built in.
 *
 * Both variables are set in the process environment, which Vite gives precedence over every `.env`
 * file, so a developer who configured real credentials in `app/.env.local` still gets a build that
 * measures the same bytes. The variant check in the gate refuses a build that did not take them.
 */
export function signedInEnv(base = process.env) {
  return { ...base, ...SHAPE_PLACEHOLDERS };
}

/**
 * The ceilings for one variant: the base set, with the variant's overrides on top.
 *
 * Only the metrics a signed-in build really moves are overridden — the emitted-byte ceilings
 * (`js_gzip`, `total`) and, if the library ever reaches the preload list again, `entry_gzip`. A
 * variant with no block of its own gets the base set, so an unknown variant can never pass by being
 * unmeasured.
 */
export function budgetsFor(budgetFile, variant = 'local_only') {
  const base = budgetFile?.budgets ?? {};
  const overrides = variant === 'signed_in' ? budgetFile?.signed_in?.budgets ?? {} : {};
  return { ...base, ...overrides };
}

/**
 * Which source files are newer than the build that claims to measure them.
 *
 * Why this exists: the gate reads `dist/`, and a `dist/` left over from an earlier checkout is
 * indistinguishable from a fresh one — it has the right file names, the right shape, and every budget
 * fits. Run 165 measured 950.3 kB that way: the number was real, it was simply of a build from before
 * the two features being verified, and it was reported as a pass. A gate that can be run against the
 * wrong bytes is not a gate.
 *
 * The rule is the simplest one that cannot misfire on a legitimate build: **the build is fresh when
 * its newest output is at least as new as every source**. Copied public files and `tsc`'s own
 * bookkeeping are outputs or excluded, not sources, so a normal `npm run build && node
 * scripts/check_weight_budget.mjs` is always fresh. Equal timestamps count as fresh: a filesystem
 * with one-second resolution would otherwise flake.
 *
 * Both lists are `{ path, mtimeMs }` with the checkout-relative path, so this stays file-system-free
 * and the suite can pin stale, fresh and "nothing built at all".
 */
export function staleSources(sources, outputs) {
  if (!sources.length) return [];
  const newestOutput = outputs.reduce((newest, file) => Math.max(newest, file.mtimeMs), -Infinity);
  return sources
    .filter((file) => file.mtimeMs > newestOutput)
    .sort((left, right) => right.mtimeMs - left.mtimeMs);
}

/**
 * The measurement a build produces: totals plus the biggest chunk, from per-file gzip sizes.
 *
 * `entry` is the list of file names `index.html` itself names (its module script, its modulepreloads
 * and its stylesheets). An empty list yields `NaN` rather than `0`, so a document that stopped
 * naming its script reads as **unmeasured** at the gate instead of as a free visit.
 *
 * `prose` is the one file that is served but not part of the shell: `dist/prose-index.json`, fetched
 * by `⌘⇧F`. It is deliberately not in `files`, so it changes `prose_gzip` without changing `total`.
 * `reader` is the same arrangement for `dist/lesson-pages/**`: `{ gzip }`, the sum over every page,
 * because a lesson opens one file but the ceiling is on the whole course. Missing, both are `NaN` —
 * a budget nothing measures is a failure, not a pass.
 */
export function measurementFrom(files, entry = [], prose = null, reader = null) {
  const sum = (predicate) =>
    files.filter(predicate).reduce((total, file) => total + file.gzip, 0);
  const js = files.filter((file) => file.name.endsWith('.js'));
  const entryFiles = files.filter((file) => entry.includes(file.name));
  return {
    entry_gzip: entry.length && entryFiles.length === entry.length
      ? entryFiles.reduce((total, file) => total + file.gzip, 0)
      : Number.NaN,
    js_gzip: sum((file) => file.name.endsWith('.js')),
    css_gzip: sum((file) => file.name.endsWith('.css')),
    fonts: files
      .filter((file) => file.name.endsWith('.woff2') || file.name.endsWith('.woff'))
      .reduce((total, file) => total + file.size, 0),
    largest_js_gzip: js.length ? Math.max(...js.map((file) => file.gzip)) : 0,
    prose_gzip: prose && Number.isFinite(prose.gzip) ? prose.gzip : Number.NaN,
    reader_gzip: reader && Number.isFinite(reader.gzip) ? reader.gzip : Number.NaN,
    // Media is already compressed: its own bytes, not a gzip of them. A build with no media reads as
    // unmeasured, so removing the room's loop fails the gate instead of passing as zero bytes. The
    // tapes are the same kind of number, split out so a track cannot hide inside a room-tone ceiling;
    // a build with no tapes is unmeasured for `music` and does not fail the room's metric.
    audio: files.some((file) => isMediaFile(file.name) && !isMusicFile(file.name))
      ? files
          .filter((file) => isMediaFile(file.name) && !isMusicFile(file.name))
          .reduce((total, file) => total + file.size, 0)
      : Number.NaN,
    music: files.some((file) => isMusicFile(file.name))
      ? files
          .filter((file) => isMusicFile(file.name))
          .reduce((total, file) => total + file.size, 0)
      : Number.NaN,
    total: files.reduce((total, file) => total + file.gzip, 0),
  };
}
