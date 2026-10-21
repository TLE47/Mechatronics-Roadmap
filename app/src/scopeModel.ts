/**
 * The Scope panel's data, kept out of React so it can be tested without a browser.
 *
 * The learner's Python calls `scope.stream("theta", t, y)`; the worker buffers the points and posts
 * them, and this module is what decides whether a payload is a plottable series at all. A partial
 * message, a NaN from a diverging simulation, or a series longer than the panel can draw must degrade
 * to something honest - the points that can be drawn, and a note saying the rest were dropped - never
 * to a blank panel or a broken scale.
 */

/** One traced signal: times and values, same length. */
export interface ScopeSeries {
  name: string;
  t: number[];
  y: number[];
  /** True when the series was longer than the cap and only its first points are here. */
  truncated?: boolean;
}

/** Per series and per message: 20 000 points is ~8 ms of a 1 kHz sim and far past what a canvas shows. */
export const MAX_SCOPE_POINTS = 20_000;

/** Canvas colours, in the same order as the token names; the fallbacks are the dark-theme values. */
export const SCOPE_TOKENS = ['--accent', '--emerald', '--amber', '--rose'] as const;
export const SCOPE_FALLBACKS = ['#38bdf8', '#34d399', '#fbbf24', '#fb7185'] as const;

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/** A JS array from the worker, or anything array-like with numeric entries. */
function toNumbers(value: unknown): number[] {
  if (Array.isArray(value)) return value.map((entry) => (isFiniteNumber(entry) ? entry : NaN));
  if (ArrayBuffer.isView(value)) {
    return Array.from(value as unknown as ArrayLike<number>, (entry) =>
      isFiniteNumber(entry) ? entry : NaN
    );
  }
  if (isFiniteNumber(value)) return [value];
  return [];
}

/**
 * Turn a worker `scope` payload into series that can be drawn.
 *
 * Rules, each of which a learner can hit:
 * - a series needs a name; an unnamed one is kept as `series N` rather than dropped, because the
 *   numbers are still the run's evidence;
 * - a pair with a NaN or an infinity is dropped, not plotted: one bad point would stretch the axis
 *   and flatten everything that did converge;
 * - `t` and `y` are cut to the shorter of the two, so a half-written message cannot misalign them;
 * - past `MAX_SCOPE_POINTS` the **first** points are kept and the series is marked `truncated`,
 *   because a simulation's transient is at the start and that is what a learner is looking at.
 */
export function normalizeScopeSeries(raw: unknown): ScopeSeries[] {
  if (!Array.isArray(raw)) return [];
  const series: ScopeSeries[] = [];
  raw.forEach((entry) => {
    if (!entry || typeof entry !== 'object') return;
    const record = entry as Record<string, unknown>;
    const name =
      typeof record.name === 'string' && record.name.trim()
        ? record.name.trim().slice(0, 48)
        : // Numbered among the series that are kept, so one unnamed trace is "series 1", not "series 3".
          `series ${series.length + 1}`;
    const times = toNumbers(record.t);
    const values = toNumbers(record.y);
    const length = Math.min(times.length, values.length);
    const t: number[] = [];
    const y: number[] = [];
    for (let i = 0; i < length && t.length < MAX_SCOPE_POINTS; i += 1) {
      if (!Number.isFinite(times[i]) || !Number.isFinite(values[i])) continue;
      t.push(times[i]);
      y.push(values[i]);
    }
    if (!t.length) return;
    series.push({ name, t, y, ...(length > MAX_SCOPE_POINTS ? { truncated: true } : {}) });
  });
  return series;
}

export interface ScopeBounds {
  tMin: number;
  tMax: number;
  yMin: number;
  yMax: number;
}

/** The window every series shares, so two traces can be compared on one pair of axes. */
export function scopeBounds(series: ScopeSeries[]): ScopeBounds | null {
  let tMin = Infinity;
  let tMax = -Infinity;
  let yMin = Infinity;
  let yMax = -Infinity;
  for (const one of series) {
    for (const value of one.t) {
      if (value < tMin) tMin = value;
      if (value > tMax) tMax = value;
    }
    for (const value of one.y) {
      if (value < yMin) yMin = value;
      if (value > yMax) yMax = value;
    }
  }
  if (!Number.isFinite(tMin) || !Number.isFinite(yMin)) return null;
  // A flat trace has a zero-height range; give it a unit so the divider is not a division by zero.
  if (tMax === tMin) tMax = tMin + 1;
  if (yMax === yMin) {
    yMin -= 1;
    yMax += 1;
  }
  return { tMin, tMax, yMin, yMax };
}

/** The last finite value of a trace, which is the one worth printing beside its name. */
export function scopeLast(series: ScopeSeries): number | null {
  for (let i = series.y.length - 1; i >= 0; i -= 1) {
    if (Number.isFinite(series.y[i])) return series.y[i];
  }
  return null;
}

/** A legend-sized number: four significant figures, and an exponent only when it earns it. */
export function formatScopeNumber(value: number): string {
  if (!Number.isFinite(value)) return '—';
  if (value === 0) return '0';
  const magnitude = Math.abs(value);
  if (magnitude >= 1e5 || magnitude < 1e-3) return value.toExponential(2);
  return Number(value.toPrecision(4)).toString();
}

export interface ScopeTableRow {
  i: number;
  t: number;
  /** One value per series, aligned by index; null when this series is shorter. */
  values: Array<number | null>;
}

/**
 * Evenly spaced samples for the table view.
 *
 * The canvas is not readable to a screen reader or a learner who cannot tell amber from emerald, so
 * the same data has to exist as text. Sampling rather than dumping: `maxRows` rows across the whole
 * window, first and last included, is what a person reads to check a settling value.
 */
export function scopeTableRows(series: ScopeSeries[], maxRows = 12): ScopeTableRow[] {
  const longest = series.reduce((length, one) => Math.max(length, one.t.length), 0);
  if (!longest) return [];
  const rows = Math.max(1, Math.min(maxRows, longest));
  const indexes: number[] = [];
  for (let r = 0; r < rows; r += 1) {
    indexes.push(rows === 1 ? 0 : Math.round((r * (longest - 1)) / (rows - 1)));
  }
  const unique = Array.from(new Set(indexes));
  return unique.map((i) => ({
    i,
    t: series[0]?.t[i] ?? i,
    values: series.map((one) => (Number.isFinite(one.y[i]) ? one.y[i] : null)),
  }));
}
