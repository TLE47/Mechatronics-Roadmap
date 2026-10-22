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
 *   doubles and its own first paint gets slower; this is the number that notices. *   - **`total`** — everything the browser pulls for the shell (assets plus the document), which is
 *     the honest "cost of the app".
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
export const METRICS = ['js_gzip', 'css_gzip', 'fonts', 'largest_js_gzip', 'total'];

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

/** The measurement a build produces: totals plus the biggest chunk, from per-file gzip sizes. */
export function measurementFrom(files) {
  const sum = (predicate) =>
    files.filter(predicate).reduce((total, file) => total + file.gzip, 0);
  const js = files.filter((file) => file.name.endsWith('.js'));
  return {
    js_gzip: sum((file) => file.name.endsWith('.js')),
    css_gzip: sum((file) => file.name.endsWith('.css')),
    fonts: files
      .filter((file) => file.name.endsWith('.woff2') || file.name.endsWith('.woff'))
      .reduce((total, file) => total + file.size, 0),
    largest_js_gzip: js.length ? Math.max(...js.map((file) => file.gzip)) : 0,
    total: files.reduce((total, file) => total + file.gzip, 0),
  };
}
