/**
 * What the learner actually did, across lessons, as one trail (`app/src/timeline.ts`).
 *
 * The workbench records everything and shows almost none of it: the learning log holds each open, run,
 * hint and export with a timestamp, and the sitting clock holds how long each stretch lasted, but the
 * only reading of either is per lesson (the runner's attempts, the resume card, the portfolio's
 * summary). "What did I do last Tuesday" — the question a self-paced course is asked by its own
 * learner — had no answer on screen.
 *
 * This is the reading: a pure function from the two stores to days of work.
 *
 * The rules that make it a trail rather than a dump:
 *
 * - **Days are local**, because a sitting is a fact about the learner's evening, not about UTC. Tests
 *   construct their inputs with `new Date(2026, 9, 21, 9, 14)`, so the same assertions hold in every
 *   timezone.
 * - **An open is context, not work.** Opening a lesson and doing nothing is worth one line; opening it
 *   and then running, hinting or verifying inside the next `OPEN_WINDOW_MS` is the start of a sitting
 *   already shown by those events, so the open row is dropped rather than doubling the list. The same
 *   fold collapses a re-mount that logs the same open twice into the later of the two.
 * - **A verification is the run that passed.** The runner logs the run, then the verification; two
 *   rows for one success would be a list that flatters the learner. The verification row is dropped
 *   when a passing run for that lesson happened within `VERIFY_WINDOW_MS` before it.
 * - **Sittings contribute time, not rows.** The runs and reviews are already rows; the sitting adds
 *   its duration to its day's header, so "23 min" is measured rather than inferred from two stamps.
 *   A sitting is counted on the local day it *started*, which is stated in the UI.
 * - **Bounded**: the most recent `MAX_DAYS` days, `MAX_ENTRIES_PER_DAY` rows each, `MAX_ENTRIES` in
 *   total, with the counts of what was left out so the card can say so instead of ending silently.
 *
 * Nothing here throws on a store written by another version: an event with a kind this build does not
 * know is still a line (it is what happened), and an unreadable timestamp is dropped.
 */

// Type-only, and the `.ts` extensions are for Node's type stripping (`scripts/test_timeline.mjs`).
import type { LearningEvent } from './learningLog.ts';
import type { Sitting } from './sittingClock.ts';

export type TrailKind = 'open' | 'run' | 'hint' | 'solution' | 'verified' | 'export';

export interface TrailEntry {
  /** Milliseconds since the epoch, kept so a caller can sort or link to a moment. */
  at: number;
  kind: TrailKind;
  lesson?: string;
  /** `run`: verified | mismatch | behavior_failed | harness_failed | stopped | error. */
  outcome?: string;
  /** `run`: the first line of the failure, when it had one. */
  fail?: string;
  /** `hint`: which rung was opened. */
  level?: number;
}

export interface TrailDay {
  /** `YYYY-MM-DD` in local time — the grouping key, and what a test can pin. */
  day: string;
  /** `Today`, `Yesterday`, or `Tue 20 Oct`. */
  label: string;
  /** Newest first, the way a trail is read. */
  entries: TrailEntry[];
  /** Time inside sittings that started that day, measured by `sittingClock.ts`. */
  measuredMs: number;
  /** Sittings that started that day. */
  sittings: number;
  /** Runs and card reviews across those sittings. */
  runs: number;
  reviews: number;
  /** Entries this day had beyond the per-day cap. */
  omitted: number;
}

export interface Trail {
  /** Newest day first. */
  days: TrailDay[];
  totals: {
    days: number;
    entries: number;
    measuredMs: number;
    runs: number;
    reviews: number;
    verified: number;
  };
  /** Days and entries the caps left out, so the card can say so. */
  omitted: { days: number; entries: number };
}

/** An open followed by any other event for the same lesson inside this window is the same sitting. */
export const OPEN_WINDOW_MS = 30 * 60_000;
/** A verification this close behind a passing run is that run's result. */
export const VERIFY_WINDOW_MS = 10_000;
export const MAX_DAYS = 14;
export const MAX_ENTRIES_PER_DAY = 30;
export const MAX_ENTRIES = 120;

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** `2026-10-21` from local parts: the day a learner would name. */
export function dayKey(at: number): string {
  const date = new Date(at);
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

/** `09:14`, 24-hour and local: a stamp a list can sort by eye. */
export function timeLabel(at: number): string {
  const date = new Date(at);
  return `${`${date.getHours()}`.padStart(2, '0')}:${`${date.getMinutes()}`.padStart(2, '0')}`;
}

/** `Today`, `Yesterday`, or `Tue 20 Oct` — the words a learner uses for a day. */
export function dayLabel(at: number, now: number = Date.now()): string {
  const key = dayKey(at);
  if (key === dayKey(now)) return 'Today';
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (key === dayKey(yesterday.getTime())) return 'Yesterday';
  const date = new Date(at);
  return `${WEEKDAYS[date.getDay()]} ${date.getDate()} ${MONTHS[date.getMonth()]}`;
}

/** The log's kind names, in the words a row uses; anything this build does not know shows as itself. */
const KIND_NAMES: Record<string, TrailKind> = {
  lesson_open: 'open',
  run: 'run',
  hint: 'hint',
  solution_open: 'solution',
  verified: 'verified',
  export: 'export',
};

function kindOf(event: LearningEvent): TrailKind {
  return KIND_NAMES[event.kind] ?? (event.kind as TrailKind);
}

function asEntry(event: LearningEvent): TrailEntry | null {
  if (typeof event.t !== 'number' || !Number.isFinite(event.t)) return null;
  return {
    at: event.t,
    kind: kindOf(event),
    lesson: event.lesson,
    outcome: event.outcome,
    fail: event.fail,
    level: event.level,
  };
}

/**
 * Drop the rows that only repeat another row: the open a run already implies, and the verification a
 * passing run already implies.
 */
export function withoutContextRows(entries: TrailEntry[]): TrailEntry[] {
  const kept: TrailEntry[] = [];
  for (const entry of entries) {
    if (entry.kind === 'open' && entry.lesson) {
      const followed = entries.some(
        (other) =>
          other !== entry &&
          other.lesson === entry.lesson &&
          other.at >= entry.at &&
          other.at - entry.at <= OPEN_WINDOW_MS
      );
      if (followed) continue;
    }
    if (entry.kind === 'verified' && entry.lesson) {
      const passedRun = entries.some(
        (other) =>
          other.kind === 'run' &&
          other.lesson === entry.lesson &&
          other.outcome === 'passed' &&
          entry.at >= other.at &&
          entry.at - other.at <= VERIFY_WINDOW_MS
      );
      if (passedRun) continue;
    }
    kept.push(entry);
  }
  return kept;
}

interface DayBucket {
  day: string;
  label: string;
  entries: TrailEntry[];
  measuredMs: number;
  sittings: number;
  runs: number;
  reviews: number;
}

/**
 * The trail: days of work, newest first, with the caps applied and what they left out reported.
 *
 * `lessonTitle` is not used here — the model stays free of the lesson registry so a unit suite can
 * build one without the 2,000-line data file — and the card resolves a title when it renders.
 */
export function buildTrail(
  events: LearningEvent[],
  sittings: Sitting[],
  options: {
    now?: number;
    maxDays?: number;
    maxEntriesPerDay?: number;
    maxEntries?: number;
  } = {}
): Trail {
  const now = options.now ?? Date.now();
  const maxDays = options.maxDays ?? MAX_DAYS;
  const perDay = options.maxEntriesPerDay ?? MAX_ENTRIES_PER_DAY;
  const maxEntries = options.maxEntries ?? MAX_ENTRIES;

  // Oldest first while filtering, so "the event after this open" means *after* in time.
  const ordered = events
    .map(asEntry)
    .filter((entry): entry is TrailEntry => entry !== null)
    .sort((left, right) => left.at - right.at);
  const kept = withoutContextRows(ordered);

  const buckets = new Map<string, DayBucket>();
  for (const entry of kept) {
    const day = dayKey(entry.at);
    const bucket =
      buckets.get(day) ??
      ({
        day,
        label: dayLabel(entry.at, now),
        entries: [],
        measuredMs: 0,
        sittings: 0,
        runs: 0,
        reviews: 0,
      } satisfies DayBucket);
    bucket.entries.push(entry);
    buckets.set(day, bucket);
  }

  // A sitting counts on the day it started; its duration is measured, not inferred.
  for (const sitting of sittings) {
    if (typeof sitting.start !== 'number' || !Number.isFinite(sitting.start)) continue;
    const bucket = buckets.get(dayKey(sitting.start));
    if (!bucket) continue;
    bucket.measuredMs += Math.max(0, sitting.end - sitting.start);
    bucket.sittings += 1;
    bucket.runs += Math.max(0, sitting.runs);
    bucket.reviews += Math.max(0, sitting.reviews);
  }

  const allDays = [...buckets.values()].sort((left, right) => (left.day < right.day ? 1 : -1));
  const shownDays = allDays.slice(0, maxDays);

  let budget = maxEntries;
  let omittedEntries = 0;
  const days: TrailDay[] = [];
  for (const bucket of shownDays) {
    const rows = [...bucket.entries].sort((left, right) => right.at - left.at);
    const room = Math.max(0, Math.min(perDay, budget));
    const entries = rows.slice(0, room);
    budget -= entries.length;
    omittedEntries += rows.length - entries.length;
    days.push({
      day: bucket.day,
      label: bucket.label,
      entries,
      measuredMs: bucket.measuredMs,
      sittings: bucket.sittings,
      runs: bucket.runs,
      reviews: bucket.reviews,
      omitted: rows.length - entries.length,
    });
  }

  const totals = days.reduce(
    (sum, day) => ({
      days: sum.days + 1,
      entries: sum.entries + day.entries.length,
      measuredMs: sum.measuredMs + day.measuredMs,
      runs: sum.runs + day.runs,
      reviews: sum.reviews + day.reviews,
      verified: sum.verified + day.entries.filter((entry) => entry.kind === 'verified').length,
    }),
    { days: 0, entries: 0, measuredMs: 0, runs: 0, reviews: 0, verified: 0 }
  );

  return {
    days,
    totals,
    omitted: {
      days: allDays.length - shownDays.length,
      entries: omittedEntries,
    },
  };
}

/** Durations are worded by `formatDuration` in `sittingClock.ts`, so the study panel and the trail agree. */

/**
 * Whether the trail holds any work at all, as opposed to context.
 *
 * The app opens on the runner, so a brand-new learner's very first render logs one `lesson_open` —
 * a row that says "the app loaded", not "I studied". A card headed "Your trail" over that one line is
 * noise on the most important screen the course has, so the card waits for a run, a hint, a pass or
 * an export before it appears. A read-only visit after real work still shows its open, because there
 * the open is part of a day that happened.
 */
export function hasWork(trail: Trail): boolean {
  return trail.days.some((day) => day.entries.some((entry) => entry.kind !== 'open'));
}

/** The line a row prints for what happened, without the lesson name. */
export function entryLabel(entry: TrailEntry): string {
  switch (entry.kind) {
    case 'open':
      return 'opened';
    case 'run':
      return entry.outcome && entry.outcome !== 'passed' ? `run · ${verdictWord(entry.outcome)}` : 'run · passed';
    case 'verified':
      return 'verified';
    case 'hint':
      return entry.level && entry.level > 0 ? `read hint ${entry.level}` : 'read a hint';
    case 'solution':
      return 'opened the solution';
    case 'export':
      return 'exported the portfolio';
    default:
      return entry.kind;
  }
}

/** A run's verdict in the words a trail uses — short, because the row is a line. */
export function verdictWord(outcome: string): string {
  switch (outcome) {
    case 'passed':
    case 'verified':
      return 'passed';
    case 'mismatch':
      return 'output differed';
    case 'behavior_failed':
      return 'checks failed';
    case 'harness_failed':
      return 'bench missed';
    case 'stopped':
      return 'stopped';
    case 'error':
      return 'error';
    default:
      return outcome;
  }
}
