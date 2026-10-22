/**
 * The weight budget: what the built workbench is allowed to cost (`scripts/weight_budget.mjs`).
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
 * - **`fonts`** — the two self-hosted variable faces, counted as their file sizes: woff2 is already
 *   compressed, so gzipping it again would flatter the number.
 * - **`largest_js_gzip`** — the biggest single chunk. A total can stay flat while one route's chunk
 *   doubles and its own first paint gets slower; this is the number that notices. * - **`entry_gzip`** — the document plus everything `index.html` names: its module script, the
 *     chunks it preloads, and its stylesheets. This is what a first paint waits for, and it is the
 *     number a chunk split is supposed to move; `total` cannot, because a chunk nobody opens is
 *     still emitted into `dist/`.
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

/** The metrics the budget covers, in the order the report prints them. */
export const METRICS = ['entry_gzip', 'js_gzip', 'css_gzip', 'fonts', 'largest_js_gzip', 'total'];

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
 */
export function measurementFrom(files, entry = []) {
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
    total: files.reduce((total, file) => total + file.gzip, 0),
  };
}
