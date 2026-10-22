/**
 * What the first paint costs, measured (`app/src/paintTiming.ts`).
 *
 * Two splits moved `entry_gzip` from 627.5 kB to 432.9 kB on the theory that bytes before the first
 * paint are time before the first paint. That theory had no reading behind it: the budget file can say
 * what a visit *downloads*, and nothing could say what it *waits for*. This is the reading.
 *
 * Four moments, each one the browser's own answer rather than a guess:
 *
 * - **`fcp`** — `first-contentful-paint`: something is on screen.
 * - **`lcp`** — `largest-contentful-paint`, updated until the learner interacts: the lesson's own text
 *   has arrived, which is the moment the tab is actually readable.
 * - **`editor`** — CodeMirror has mounted where the placeholder stood (`PythonEditor`'s impl). This is
 *   the number the lazy editor is judged by: the code has been readable since `fcp`, and this is when
 *   the editor finally agrees.
 * - **`run`** — the runner has committed, so the Run button is on screen and clickable.
 *
 * All four are milliseconds from navigation start, taken from `performance` rather than from
 * `Date.now()`, so a wall clock that jumps does not move them.
 *
 * Where the samples live, and why they are separate from the log: the learning log is a record of what
 * the *learner* did (`lesson_open`, `run`, `hint`), and every surface reads it that way — the trail,
 * the attempts fold, the friction report. A paint sample is a fact about the *build* on this machine.
 * Mixing them would put rows with no lesson into the trail and count them as activity, so they keep
 * their own small store: the newest `MAX_PAINT_SAMPLES` visits, one sample per navigation, replaced
 * rather than duplicated when the same visit flushes twice (a flush happens on `pagehide` too).
 *
 * Nothing here runs at import: the browser half starts from `startPaintTiming()` in `main.tsx`, and the
 * pure half is what `scripts/test_paint_timing.mjs` pins without a browser.
 */

import { bulkStorage } from './bulkStorage.ts';

export const PAINT_SCHEMA = 'mechalab.paint/1';
export const PAINT_KEY = 'mechalab.paint.v1';
/** Enough visits to see a spread, few enough that the store is a rounding error in a backup. */
export const MAX_PAINT_SAMPLES = 50;
/** Flush this long after load, so a tab that is never closed or exported still leaves a reading. */
export const PAINT_FLUSH_MS = 15_000;

export type PaintMetric = 'fcp' | 'lcp' | 'editor' | 'run';

export interface PaintSample {
  /** `performance.timeOrigin` of the visit: the sample's identity across flushes. */
  nav: number;
  fcp?: number;
  lcp?: number;
  editor?: number;
  run?: number;
}

export interface PaintSummary {
  /** Samples the summary was taken over. */
  count: number;
  /** The most recent sample, or null when nothing was ever recorded. */
  latest: PaintSample | null;
  /** Median of each metric across the samples that carry it; a metric nobody reported is absent. */
  median: Partial<Record<PaintMetric, number>>;
}

const METRICS: PaintMetric[] = ['fcp', 'lcp', 'editor', 'run'];

function storage(): Storage | null {
  return bulkStorage();
}

function isMetric(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

/** A store written by another build, or truncated, reads as the samples it can prove. */
export function parsePaintSamples(raw: string | null): PaintSample[] {
  if (!raw) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  const samples: PaintSample[] = [];
  for (const entry of parsed) {
    if (!entry || typeof entry !== 'object') continue;
    const record = entry as Record<string, unknown>;
    if (!isMetric(record.nav)) continue;
    const sample: PaintSample = { nav: Math.round(record.nav) };
    for (const metric of METRICS) {
      const value = record[metric];
      if (isMetric(value)) sample[metric] = Math.round(value);
    }
    samples.push(sample);
  }
  return samples.sort((left, right) => right.nav - left.nav).slice(0, MAX_PAINT_SAMPLES);
}

export function readPaintSamples(): PaintSample[] {
  try {
    return parsePaintSamples(storage()?.getItem(PAINT_KEY) ?? null);
  } catch {
    return [];
  }
}

/**
 * Put a sample in the list: newest first, one entry per navigation, capped.
 *
 * A visit flushes more than once (a timer, `pagehide`, and the export), and the later flush knows more
 * than the earlier one — `lcp` in particular keeps growing until the learner interacts. Replacing by
 * `nav` is what makes the last flush the sample rather than a second row for the same visit.
 */
export function mergePaintSample(samples: PaintSample[], sample: PaintSample): PaintSample[] {
  const rest = samples.filter((existing) => existing.nav !== sample.nav);
  return [sample, ...rest]
    .sort((left, right) => right.nav - left.nav)
    .slice(0, MAX_PAINT_SAMPLES);
}

/** Record one sample. Never throws: no storage means no measurement, not a broken page. */
export function recordPaintSample(sample: PaintSample): PaintSample[] {
  const merged = mergePaintSample(readPaintSamples(), sample);
  try {
    storage()?.setItem(PAINT_KEY, JSON.stringify(merged));
  } catch {
    // Storage disabled or over quota: the reading is lost, and the page keeps working.
  }
  return merged;
}

export function clearPaintSamples(): void {
  try {
    storage()?.removeItem(PAINT_KEY);
  } catch {
    // Nothing to clear when there is no storage.
  }
}

/** The median of a list already known to be non-empty. */
function median(values: number[]): number {
  const ordered = [...values].sort((left, right) => left - right);
  const middle = Math.floor(ordered.length / 2);
  return ordered.length % 2 === 1
    ? ordered[middle]
    : Math.round((ordered[middle - 1] + ordered[middle]) / 2);
}

/**
 * The medians, which is the number to quote: a first visit pays for a cold cache and a fifth does not
 * — including both in one average would describe neither, and the point of the reading is the warm
 * cost the learner actually lives with.
 */
export function paintSummary(samples: PaintSample[] = readPaintSamples()): PaintSummary {
  const medianOf: Partial<Record<PaintMetric, number>> = {};
  for (const metric of METRICS) {
    const values = samples.map((sample) => sample[metric]).filter(isMetric);
    if (values.length) medianOf[metric] = median(values);
  }
  return {
    count: samples.length,
    latest: samples[0] ?? null,
    median: medianOf,
  };
}

/** `312 ms` under a second, `1.42 s` above it: a millisecond the eye can read, not a float. */
export function durationLabel(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return '—';
  return ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(2)} s`;
}

/** The one sentence an export carries, or an empty string when nothing has been measured yet. */
export function paintLine(summary: PaintSummary): string {
  if (!summary.count) return '';
  const parts: string[] = [];
  if (summary.median.fcp !== undefined) parts.push(`first paint ${durationLabel(summary.median.fcp)}`);
  if (summary.median.lcp !== undefined) parts.push(`largest paint ${durationLabel(summary.median.lcp)}`);
  if (summary.median.editor !== undefined) parts.push(`editor ${durationLabel(summary.median.editor)}`);
  if (summary.median.run !== undefined) parts.push(`Run ready ${durationLabel(summary.median.run)}`);
  if (!parts.length) return '';
  const visits = `${summary.count} ${summary.count === 1 ? 'visit' : 'visits'}`;
  return `Startup (${visits}${summary.count > 1 ? ', medians' : ''}): ${parts.join(' · ')}`;
}

// ---------------------------------------------------------------------------------------------------
// The browser half: four moments observed once per navigation.
// ---------------------------------------------------------------------------------------------------

/** The visit being measured, or null before `startPaintTiming()` (and in Node). */
let current: PaintSample | null = null;
let started = false;
let flushTimer: ReturnType<typeof setTimeout> | null = null;
const observers: PerformanceObserver[] = [];

function observe(): void {
  if (typeof PerformanceObserver === 'undefined') return;
  const paint = new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      if (entry.name === 'first-contentful-paint' && current && current.fcp === undefined) {
        current.fcp = Math.round(entry.startTime);
      }
    }
  });
  paint.observe({ type: 'paint', buffered: true });
  observers.push(paint);

  // Kept until the learner interacts, which is what LCP means: the largest thing painted *before* they
  // took over. The last entry before the flush is the one to keep.
  const lcp = new PerformanceObserver((list) => {
    const entries = list.getEntries();
    const last = entries[entries.length - 1];
    if (last && current) current.lcp = Math.round(last.startTime);
  });
  lcp.observe({ type: 'largest-contentful-paint', buffered: true });
  observers.push(lcp);
}

/**
 * Start measuring this visit. Called once from `main.tsx`, before the first render.
 *
 * Idempotent, and silent where there is no `performance` (a unit suite importing this module must not
 * create observers or timers).
 */
export function startPaintTiming(): void {
  if (started || typeof window === 'undefined' || typeof performance === 'undefined') return;
  started = true;
  const origin = performance.timeOrigin;
  current = { nav: Math.round(Number.isFinite(origin) ? origin : Date.now() - performance.now()) };
  try {
    observe();
  } catch {
    // An observer the browser refuses (an old engine, a policy) simply leaves the metric absent.
  }
  flushTimer = setTimeout(() => flushPaintSample(), PAINT_FLUSH_MS);
  // Both of the ways a visit ends: a close, and a tab put in the background for good.
  window.addEventListener('pagehide', () => flushPaintSample());
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushPaintSample();
  });
}

/** One ready moment. First call wins: the editor mounts once and the runner commits once per visit. */
export function markPaintReady(metric: 'editor' | 'run'): void {
  if (!current || current[metric] !== undefined) return;
  if (typeof performance === 'undefined') return;
  current[metric] = Math.round(performance.now());
}

/**
 * Write what has been observed so far.
 *
 * Called by the timer, on the way out, and by the export — a learner who exports the log before the
 * flush should get this visit's reading rather than the one before it.
 */
export function flushPaintSample(): void {
  if (!current) return;
  recordPaintSample({ ...current });
}

/** Stop the timer and the observers. For a suite that drives several visits in one process. */
export function stopPaintTiming(): void {
  if (flushTimer !== null) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  for (const observer of observers.splice(0)) observer.disconnect();
  current = null;
  started = false;
}

/** The visit being measured, for a suite that wants the live marks rather than the stored sample. */
export function currentPaintSample(): PaintSample | null {
  return current ? { ...current } : null;
}
