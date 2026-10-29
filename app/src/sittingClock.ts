/**
 * How long a sitting lasts (`app/src/sittingClock.ts`).
 *
 * The pilot's time estimates (`docs/PILOT.md`) were the last thing in the study layer with no
 * measurement behind them: the learning log records *what* happened — an open, a run, a hint — and
 * never how long the learner was there for. This is the clock that answers that, and it answers it in
 * sittings rather than in a running stopwatch, because a tab left open over lunch is not two hours of
 * study.
 *
 * The rules, and why each is the one it is:
 *
 * - **A sitting is a run of activity.** Any open, run or review extends the one in progress. A gap
 *   longer than `IDLE_GAP_MS` (five minutes) closes it and starts a new one, so the clock measures the
 *   work between two real breaks, not the hour a tab sat untouched.
 * - **A sitting is capped at `MAX_SITTING_MS` (three hours).** No legitimate single sitting of a
 *   self-paced course runs longer, and a machine that woke up and replayed events would otherwise
 *   file an eight-hour sitting. Past the cap the sitting closes and the next event opens a new one.
 * - **The clock going backwards starts a new sitting** rather than extending one with a negative
 *   duration — a learner whose system clock was corrected should not lose the sitting, but the stored
 *   numbers must never be negative.
 * - **Only the facts are stored**: start, last activity, how many runs and reviews, and up to twelve
 *   lesson ids. Nothing per-keystroke, so a write costs one `setItem` per run or review.
 *
 * The store is bounded (200 sittings, oldest dropped) and never throws: blocked or full storage
 * leaves the clock unrecorded for the session, not the lesson broken. Sittings are deliberately **not**
 * in the backup: a sitting is a fact about one machine's clock, and merging two machines' sittings
 * would count the same hour twice — the exact number this exists to keep honest.
 *
 * Everything above the storage layer is pure and takes `now`, so `scripts/test_sitting.mjs` can pin
 * the idle cutoff, the cap, the backwards clock and the statistics without a browser or a timer.
 */

import { bulkStorage } from './bulkStorage.ts';

export const STORAGE_KEY_SITTINGS = 'mechalab_sittings_v1';
export const SITTINGS_SCHEMA = 'mechalab.sittings/1';
/**
 * Announced on `window` after every write.
 *
 * A sitting is written from wherever the activity happened — a lesson open and a run in the runner,
 * a rating in the study panel — and those are three different components. The panel's clock line is
 * not the writer for two of them, so without this it kept printing whatever the store held when the
 * lesson mounted: the walk in `docs/pilot-results.md` ended with 232 s stored and "under a minute" on
 * screen. One event at the single write point is cheaper and more honest than a timer guessing when
 * the store might have moved.
 */
export const SITTING_RECORDED_EVENT = 'mechalab:sitting-recorded';
/** Five minutes without a run, a review or a lesson open is a break. */
export const IDLE_GAP_MS = 5 * 60_000;
/** Past this, the sitting closes and the next event opens a new one. */
export const MAX_SITTING_MS = 3 * 60 * 60_000;
export const MAX_SITTINGS = 200;
export const MAX_SITTING_LESSONS = 12;

/**
 * What extended a sitting. `study` is the lesson brief's clock (`studyTimer.ts`): a heartbeat while
 * it runs, so an hour of reading the lesson counts as an hour even with no run in it.
 */
export type SittingKind = 'open' | 'run' | 'review' | 'study';

export interface Sitting {
  /** When the sitting began, epoch milliseconds. */
  start: number;
  /** The last activity in it — what the duration is measured to. */
  end: number;
  runs: number;
  reviews: number;
  /** Lessons touched, in the order they were first touched, capped at twelve. */
  lessons: string[];
}

export interface SittingEvent {
  at: number;
  kind: SittingKind;
  lesson?: string;
}

export interface SittingTotals {
  count: number;
  totalMs: number;
  medianMs: number;
  longestMs: number;
  /** Time in sittings that started since local midnight. */
  todayMs: number;
  /** How many sittings started since local midnight — zero-time ones included, so a fresh sitting
   *  reads as "under a minute" rather than as no work at all. */
  todayCount: number;
}

function blank(at: number): Sitting {
  return { start: at, end: at, runs: 0, reviews: 0, lessons: [] };
}

function applyEvent(sitting: Sitting, event: SittingEvent): Sitting {
  const at = Math.round(event.at);
  const next: Sitting = {
    ...sitting,
    end: Math.max(sitting.end, at),
    lessons: [...sitting.lessons],
  };
  if (event.kind === 'run') next.runs += 1;
  if (event.kind === 'review') next.reviews += 1;
  if (
    event.lesson &&
    !next.lessons.includes(event.lesson) &&
    next.lessons.length < MAX_SITTING_LESSONS
  ) {
    next.lessons.push(event.lesson);
  }
  return next;
}

/** A sitting as it is filed: never longer than the cap, never ending before it started. */
export function closeSitting(sitting: Sitting): Sitting {
  const end = Math.min(sitting.end, sitting.start + MAX_SITTING_MS);
  return { ...sitting, end: Math.max(sitting.start, end) };
}

/**
 * Apply one event to the open sitting.
 *
 * Pure and total: the caller passes what is stored and what just happened, and gets the sitting to
 * store plus the one (if any) that this event closed. The four ways a sitting ends are all here — the
 * idle gap, the cap, a backwards clock, and there being no sitting yet — so the store below only has
 * to place the result in the list.
 */
export function nextSitting(
  open: Sitting | null,
  event: SittingEvent
): { sitting: Sitting; closed: Sitting | null } {
  const at = Math.round(event.at);
  const stale =
    !open ||
    at < open.start ||
    at - open.end > IDLE_GAP_MS ||
    at - open.start > MAX_SITTING_MS;
  if (stale) {
    return {
      sitting: applyEvent(blank(at), event),
      closed: open ? closeSitting(open) : null,
    };
  }
  return { sitting: applyEvent(open, event), closed: null };
}

function asSitting(value: unknown): Sitting | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const entry = value as Record<string, unknown>;
  const start = Number(entry.start);
  const end = Number(entry.end);
  if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end < start) return null;
  const count = (key: string) => {
    const raw = Number(entry[key]);
    return Number.isFinite(raw) && raw > 0 ? Math.round(raw) : 0;
  };
  const lessons = Array.isArray(entry.lessons)
    ? entry.lessons.filter((id): id is string => typeof id === 'string' && id.length > 0)
    : [];
  return closeSitting({
    start: Math.round(start),
    end: Math.round(end),
    runs: count('runs'),
    reviews: count('reviews'),
    lessons: lessons.slice(0, MAX_SITTING_LESSONS),
  });
}

/** A store written by another version reads as the part of itself that still parses. */
export function parseSittings(raw: string | null): Sitting[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map(asSitting)
      .filter((sitting): sitting is Sitting => Boolean(sitting))
      .sort((left, right) => left.start - right.start)
      .slice(-MAX_SITTINGS);
  } catch {
    return [];
  }
}

function storage(): Storage | null {
  // IndexedDB when the browser has it (`bulkStorage.ts`), the bucket otherwise.
  return bulkStorage();
}

export function readSittings(): Sitting[] {
  const store = storage();
  if (!store) return [];
  try {
    return parseSittings(store.getItem(STORAGE_KEY_SITTINGS));
  } catch {
    return [];
  }
}

/** Drop one sitting by its start: the reset panel's per-sitting erase, and nothing else calls it. */
export function forgetSitting(start: number): void {
  const kept = readSittings().filter((sitting) => sitting.start !== Math.round(start));
  writeSittings(kept);
}

function writeSittings(sittings: Sitting[]): void {
  const store = storage();
  if (!store) return;
  try {
    store.setItem(STORAGE_KEY_SITTINGS, JSON.stringify(sittings.slice(-MAX_SITTINGS)));
  } catch {
    // Blocked or full: the sitting is lost, and the lesson is not.
  }
}

/**
 * Record one event and hand back the sittings as they are now stored.
 *
 * The last entry is the open sitting: extending it replaces it in place, so the list never grows by
 * a write that only moved `end`.
 */
export function recordSittingEvent(event: SittingEvent): Sitting[] {
  const list = readSittings();
  const last = list.length ? list[list.length - 1] : null;
  const { sitting, closed } = nextSitting(last, event);
  const kept = list.slice(0, last ? list.length - 1 : list.length);
  if (closed) kept.push(closed);
  kept.push(sitting);
  writeSittings(kept);
  announce(sitting);
  return kept.slice(-MAX_SITTINGS);
}

/** Tell the screen the clock moved. Silent outside a browser, where the unit suites run. */
function announce(sitting: Sitting): void {
  if (typeof window === 'undefined' || typeof window.dispatchEvent !== 'function') return;
  try {
    // The page's own constructor, not this realm's: `focusMode.ts` learned the same thing — an event
    // built by another realm's `CustomEvent` is not dispatched by every DOM implementation, and the
    // symptom is a listener that never fires.
    const EventCtor = typeof window.CustomEvent === 'function' ? window.CustomEvent : CustomEvent;
    window.dispatchEvent(new EventCtor(SITTING_RECORDED_EVENT, { detail: { runs: sitting.runs } }));
  } catch {
    // A reader that cannot be told is a stale line, not a lost sitting.
  }
}

/** The sitting still open at `now`, or null when the learner has been away long enough. */
export function currentSitting(sittings: Sitting[], now: number = Date.now()): Sitting | null {
  const last = sittings.length ? sittings[sittings.length - 1] : null;
  if (!last) return null;
  return now >= last.start && now - last.end <= IDLE_GAP_MS ? last : null;
}

function duration(sitting: Sitting): number {
  return Math.max(0, sitting.end - sitting.start);
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : Math.round((sorted[middle - 1] + sorted[middle]) / 2);
}

/** Total, median, longest and today's time — the numbers a pilot report quotes. */
export function sittingTotals(sittings: Sitting[], now: number = Date.now()): SittingTotals {
  const durations = sittings.map(duration);
  const midnight = new Date(now);
  midnight.setHours(0, 0, 0, 0);
  const startOfToday = midnight.getTime();
  const today = sittings.filter((sitting) => sitting.start >= startOfToday);
  return {
    count: sittings.length,
    totalMs: durations.reduce((total, ms) => total + ms, 0),
    medianMs: median(durations),
    longestMs: durations.length ? Math.max(...durations) : 0,
    todayMs: today.map(duration).reduce((total, ms) => total + ms, 0),
    todayCount: today.length,
  };
}

export interface LessonTotals {
  /** Sittings that touched this lesson. */
  count: number;
  totalMs: number;
  /** The part of that total in sittings that started since local midnight. */
  todayMs: number;
}

/**
 * Time in sittings that had this lesson open.
 *
 * A sitting is a run of activity, not a per-lesson stopwatch: a sitting that touched two lessons is
 * counted for both, because the honest reading is "time spent while this lesson was open", not a
 * split the store never recorded. An empty lesson id matches nothing rather than every sitting, so a
 * row without a lesson cannot claim the whole day.
 */
export function lessonTotals(
  sittings: Sitting[],
  lessonId: string,
  now: number = Date.now()
): LessonTotals {
  const id = typeof lessonId === 'string' ? lessonId.trim() : '';
  if (!id) return { count: 0, totalMs: 0, todayMs: 0 };
  const midnight = new Date(now);
  midnight.setHours(0, 0, 0, 0);
  const startOfToday = midnight.getTime();
  const matching = sittings.filter((sitting) => sitting.lessons.includes(id));
  return {
    count: matching.length,
    totalMs: matching.map(duration).reduce((total, ms) => total + ms, 0),
    todayMs: matching
      .filter((sitting) => sitting.start >= startOfToday)
      .map(duration)
      .reduce((total, ms) => total + ms, 0),
  };
}

/** `under a minute`, `23 min`, `1 h 12 min` — a duration a person reads without arithmetic. */
export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 60_000) return 'under a minute';
  const minutes = Math.round(ms / 60_000);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours} h ${rest} min` : `${hours} h`;
}

/**
 * The sentence the study panel prints: what today cost, and how long an ordinary sitting is.
 *
 * The median is quoted rather than the mean, because one sitting that ran into a meeting should not
 * move the number the pilot's estimates are checked against — and it is only quoted once there are
 * two sittings to take a median of, since the median of one sitting is just that sitting, said twice.
 */
export function sittingSummary(sittings: Sitting[], now: number = Date.now()): string {
  const totals = sittingTotals(sittings, now);
  if (!totals.count) return 'No sittings recorded yet';
  const today = totals.todayCount ? `Today ${formatDuration(totals.todayMs)}` : 'Nothing today';
  return totals.count >= 2 ? `${today} · median sitting ${formatDuration(totals.medianMs)}` : today;
}
