/**
 * What the trail is *saying* (`app/src/trailReading.ts`).
 *
 * `timeline.ts` answers "what did I do last Tuesday" — it is a record. A record is not advice: nine
 * opens and no run, one lesson that took nine attempts before it passed, a week that never came back
 * to the review deck. Those are readings of the same data, and each one names the move it implies
 * without storing anything new.
 *
 * The rules that keep it a reading rather than a scoreboard:
 *
 * - **Only what the trail already holds.** No new store, no counters, no derived history file: the
 *   readings are a pure function of the days the card was going to draw anyway. A week the caps cut
 *   off is not counted, so nothing is claimed about work the reader cannot see.
 * - **A threshold, or silence.** One failed run is a lesson, not a struggle; one day that only opened
 *   a lesson is a look, not a pattern. Every rule has a floor, and below it the reading is not
 *   softened into a compliment — it is absent.
 * - **The past tense of a pass is encouragement, not a nag.** "took 3 runs before it passed" is the
 *   same fact as "3 failed runs", worded the way the learner earned it.
 * - **At most three**, most actionable first: a lesson resisting, then the deck going quiet, then the
 *   days that were only opens. A card of ten observations is a report nobody reads.
 */

// Type-only, and the `.ts` extension is for Node's type stripping (`scripts/test_trail_reading.mjs`).
import { dayKey, type Trail, type TrailDay } from './timeline.ts';

export type ReadingKind = 'many-runs' | 'no-review' | 'opens-alone';

export interface TrailReading {
  kind: ReadingKind;
  /** One line, ready to print. The card adds a button when `lesson` is set. */
  text: string;
  /** A lesson the reading is about, so the card can offer to open it. */
  lesson?: string;
  /** `many-runs`: failed runs on that lesson. `opens-alone`: days that were only opens. */
  runs?: number;
  days?: number;
  /** `no-review`: how long it has been. */
  sinceDays?: number;
}

/** Fewer than three failed runs is a lesson being learned, not a lesson resisting. */
export const MIN_RUNS_FOR_ATTEMPT_READING = 3;
/** One day of opens is a look; two is a pattern. */
export const MIN_OPEN_DAYS = 2;
/** A deck left alone for this long is worth a line. */
export const REVIEW_QUIET_DAYS = 3;
export const MAX_READINGS = 3;

/** Whole local days between two `YYYY-MM-DD` keys, later minus earlier. */
function daysBetween(earlier: string, later: string): number {
  const parse = (key: string): number => {
    const [year, month, day] = key.split('-').map((part) => Number(part));
    return new Date(year, (month ?? 1) - 1, day ?? 1).getTime();
  };
  return Math.round((parse(later) - parse(earlier)) / 86_400_000);
}

/** Days whose every row is an open: the learner looked and did nothing after it. */
function openOnlyDays(days: TrailDay[]): TrailDay[] {
  return days.filter(
    (day) => day.entries.length > 0 && day.entries.every((entry) => entry.kind === 'open')
  );
}

/**
 * The lesson that took the most failed runs in this trail, with whether it ever passed.
 *
 * "Passed" is any later passing run or verification *for that lesson* — a lesson that resisted and
 * then landed is the reading worth having, so it is not hidden by the same count.
 */
function hardestLesson(
  trail: Trail
): { lesson: string; runs: number; passed: boolean } | null {
  const failed = new Map<string, number>();
  const passed = new Set<string>();
  for (const day of trail.days) {
    for (const entry of day.entries) {
      if (!entry.lesson) continue;
      if (entry.kind === 'verified') passed.add(entry.lesson);
      if (entry.kind !== 'run') continue;
      if (entry.outcome === 'passed') passed.add(entry.lesson);
      else failed.set(entry.lesson, (failed.get(entry.lesson) ?? 0) + 1);
    }
  }
  let worst: { lesson: string; runs: number; passed: boolean } | null = null;
  for (const [lesson, runs] of failed) {
    if (runs < MIN_RUNS_FOR_ATTEMPT_READING) continue;
    // Ties go to the lesson that has not passed: that is the one still asking for something.
    const candidate = { lesson, runs, passed: passed.has(lesson) };
    if (!worst || candidate.runs > worst.runs || (candidate.runs === worst.runs && !candidate.passed)) {
      worst = candidate;
    }
  }
  return worst;
}

/**
 * The trail's readings, most actionable first.
 *
 * `now` is passed in rather than read from the clock so a test can pin "three days ago" exactly; the
 * card hands it the same instant it built the trail with, so the reading and the days agree.
 */
export function readTrail(trail: Trail, options: { now?: number; max?: number } = {}): TrailReading[] {
  const now = options.now ?? Date.now();
  const max = Math.max(0, options.max ?? MAX_READINGS);
  if (max === 0) return [];

  const readings: TrailReading[] = [];

  const worst = hardestLesson(trail);
  if (worst) {
    readings.push({
      kind: 'many-runs',
      lesson: worst.lesson,
      runs: worst.runs,
      text: worst.passed
        ? `${worst.lesson}: ${worst.runs} failed runs before it passed.`
        : `${worst.lesson}: ${worst.runs} failed runs and not passed yet.`,
    });
  }

  // The deck going quiet, read from the sittings' own review counts: the newest day that had any.
  if (trail.totals.reviews > 0) {
    const lastReviewDay = trail.days.find((day) => day.reviews > 0);
    if (lastReviewDay) {
      const since = daysBetween(lastReviewDay.day, dayKey(now));
      if (since >= REVIEW_QUIET_DAYS) {
        readings.push({
          kind: 'no-review',
          sinceDays: since,
          text: `No card review since ${lastReviewDay.label}.`,
        });
      }
    }
  }

  const quietDays = openOnlyDays(trail.days);
  if (quietDays.length >= MIN_OPEN_DAYS) {
    readings.push({
      kind: 'opens-alone',
      days: quietDays.length,
      text: `${quietDays.length} of these ${trail.days.length} days are opens with nothing after them.`,
    });
  }

  return readings.slice(0, max);
}
