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

/** The window on the time axis, in the trace's own units. */
export interface ScopeWindow {
  tMin: number;
  tMax: number;
}

/** The extent every series covers in time, which is also the furthest a zoom may go out. */
export function scopeTimeRange(series: ScopeSeries[]): ScopeWindow | null {
  let tMin = Infinity;
  let tMax = -Infinity;
  for (const one of series) {
    for (const value of one.t) {
      if (value < tMin) tMin = value;
      if (value > tMax) tMax = value;
    }
  }
  if (!Number.isFinite(tMin)) return null;
  if (tMax === tMin) tMax = tMin + 1;
  return { tMin, tMax };
}

/**
 * A trace's value at an arbitrary time, by linear interpolation between the samples around it.
 *
 * A cursor lands wherever the pointer is, not on a logged sample, so the reading has to come from
 * the line between two samples - that is what a plotting tool does and what a learner comparing a
 * settling value expects. `null` outside the trace's own span: a series that starts later than the
 * cursor has no value there, and printing the nearest one would invent data.
 *
 * Order-independent: a loop that logs out of order still reads correctly, because the bracket is
 * found by comparing times rather than by index.
 */
export function sampleAt(series: ScopeSeries, t: number): number | null {
  const xs = series.t;
  const ys = series.y;
  if (!xs.length || !Number.isFinite(t)) return null;
  let below = -1;
  let above = -1;
  for (let i = 0; i < xs.length; i += 1) {
    const x = xs[i];
    if (x === t) return ys[i];
    if (x < t && (below < 0 || x > xs[below])) below = i;
    if (x > t && (above < 0 || x < xs[above])) above = i;
  }
  if (below < 0 || above < 0) return null;
  const span = xs[above] - xs[below];
  if (!(span > 0)) return ys[below];
  const fraction = (t - xs[below]) / span;
  return ys[below] + (ys[above] - ys[below]) * fraction;
}

export interface ScopeReading {
  name: string;
  /** The value at the cursor, or null when this trace has no sample at that time. */
  value: number | null;
}

/** One cursor reading per trace - the same `t`, every signal on the axes. */
export function cursorReadout(series: ScopeSeries[], t: number | null): ScopeReading[] {
  if (t === null) return [];
  return series.map((one) => ({ name: one.name, value: sampleAt(one, t) }));
}

/** The narrowest window a zoom stops at: one thousandth of the trace, which is past any lesson's detail. */
export const MIN_SCOPE_ZOOM_SPAN = 1 / 1000;

/**
 * Zoom the time axis about the pointer, clamped to the data.
 *
 * `factor < 1` zooms in. The anchor keeps the time under the pointer where it is, which is the one
 * behaviour that makes a wheel feel like a scope rather than like a slider; the window never leaves
 * the trace, so the axis cannot end up showing empty space a learner cannot scroll back from.
 */
export function zoomWindow(
  window: ScopeWindow,
  extent: ScopeWindow,
  factor: number,
  anchor: number
): ScopeWindow {
  const full = extent.tMax - extent.tMin;
  if (!(full > 0) || !(factor > 0)) return { ...extent };
  const span = window.tMax - window.tMin;
  const minSpan = full * MIN_SCOPE_ZOOM_SPAN;
  const next = Math.min(full, Math.max(minSpan, span * factor));
  const clampedAnchor = Math.min(window.tMax, Math.max(window.tMin, anchor));
  const ratio = span > 0 ? (clampedAnchor - window.tMin) / span : 0.5;
  let tMin = clampedAnchor - next * ratio;
  let tMax = tMin + next;
  if (tMin < extent.tMin) {
    tMin = extent.tMin;
    tMax = tMin + next;
  }
  if (tMax > extent.tMax) {
    tMax = extent.tMax;
    tMin = tMax - next;
  }
  return { tMin, tMax };
}

/** Slide the window by a fraction of its own span, stopping at the data's edges. */
export function panWindow(
  window: ScopeWindow,
  extent: ScopeWindow,
  fraction: number
): ScopeWindow {
  const span = window.tMax - window.tMin;
  const full = extent.tMax - extent.tMin;
  if (!(span > 0) || !Number.isFinite(fraction)) return { ...window };
  const next = Math.min(span, full);
  let tMin = window.tMin + span * fraction;
  let tMax = tMin + next;
  if (tMin < extent.tMin) {
    tMin = extent.tMin;
    tMax = tMin + next;
  }
  if (tMax > extent.tMax) {
    tMax = extent.tMax;
    tMin = tMax - next;
  }
  return { tMin, tMax };
}

/**
 * Bounds for what is actually on screen.
 *
 * Zooming in on one edge of a transient and keeping the full trace's height would leave the visible
 * part as a flat line near the middle. The y axis follows the window instead, and falls back to the
 * whole trace when the window holds no sample (a zoom between two points).
 */
export function scopeBoundsIn(series: ScopeSeries[], window: ScopeWindow): ScopeBounds | null {
  let yMin = Infinity;
  let yMax = -Infinity;
  for (const one of series) {
    for (let i = 0; i < one.t.length; i += 1) {
      const x = one.t[i];
      if (x < window.tMin || x > window.tMax) continue;
      const value = one.y[i];
      if (value < yMin) yMin = value;
      if (value > yMax) yMax = value;
    }
  }
  if (!Number.isFinite(yMin)) return scopeBounds(series);
  if (yMax === yMin) {
    yMin -= 1;
    yMax += 1;
  }
  return { tMin: window.tMin, tMax: window.tMax, yMin, yMax };
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
