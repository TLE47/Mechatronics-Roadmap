/**
 * The learning log: a local, append-only record of what a learner actually did.
 *
 * Why it exists: every hour in the course is an author target until someone else sits the pages, and
 * a pilot can only be cheap if the learner's run leaves evidence behind without anyone watching. The
 * log never leaves the browser on its own — there is no server and no network call. It is exported by
 * the learner, deliberately, with the button in the header.
 *
 * What it records (and why each one is enough):
 *  - `lesson_open`: the denominator for abandon rate.
 *  - `run`: one per execution, with the outcome and its duration; attempts-to-verify is the count of
 *    runs before the first `verified`.
 *  - `verified`: the numerator. A run that passed both behavioural and output checks, and — on a
 *    capstone — every graded number on its harness.
 *  - `hint` / `solution_open`: which help was used and when, so "needed a person" can be told apart
 *    from "used the ladder".
 *  - `tour`: which onboarding step was on screen — shown, a step reached, skipped, or completed. It is
 *    the only record of whether the tour was walked or dismissed at step two, which is the question a
 *    pilot asks about onboarding.
 *  - `export`: when the learner handed the file over, so a partial log is not read as a whole one.
 *
 * Events are capped so the log cannot grow without bound - it is the largest store, and a log that grew
 * per run would make every write, every export and every backup pay for a learner's whole history; the
 * oldest events are dropped first, and the cap is far above one Core route's worth. The store itself is
 * IndexedDB (`bulkStorage.ts`), so the cap is a budget for the archive rather than a quota wall.
 *
 * The exported file also carries the measured sittings (`sittingClock.ts`): the log records what
 * happened, and the clock records how long each stretch lasted, which together are the pilot's
 * `active_minutes` without a stopwatch.
 */

// With the extension: this module is loaded by Node's type stripping in the unit suites, which does not
// resolve an extensionless relative import the way Vite does.
import { bulkStorage } from './bulkStorage.ts';
import { readSittings } from './sittingClock.ts';
import { PAINT_SCHEMA, flushPaintSample, paintSummary, readPaintSamples } from './paintTiming.ts';

export type LearningEventKind =
  | 'lesson_open'
  | 'run'
  | 'verified'
  | 'hint'
  | 'solution_open'
  | 'tour'
  | 'export';

/** What the first-run tour did: opened, resumed, reached a step, closed, or reached the end. */
export type TourLogAction = 'shown' | 'resume' | 'step' | 'skipped' | 'completed';

export interface LearningEvent {
  /** Milliseconds since the epoch, so idle gaps are visible without a clock event. */
  t: number;
  kind: LearningEventKind;
  lesson?: string;
  /** `run`: verified | mismatch | harness_failed | behavior_failed | stopped | error. */
  outcome?: string;
  /** `run`: the first line of the failing assertion or traceback, truncated. */
  fail?: string;
  /** `hint`: how many hints were unlocked after this click. `tour`: which step, 1-based. */
  level?: number;
  /** `tour`: which of the five things happened. */
  action?: TourLogAction;
  /** `run`: wall-clock milliseconds between the run starting and its result. */
  ms?: number;
}

export const LOG_STORAGE_KEY = 'mechalab.learningLog.v1';
export const LOG_SCHEMA = 'mechalab.learning-log/1';
/** The log's own cap. Exported so the backup's size ceiling is computed from it, not copied. */
export const MAX_EVENTS = 5000;
const FAIL_LINE_CHARS = 200;

function storage(): Storage | null {
  // IndexedDB when the browser has it (`bulkStorage.ts`), the bucket otherwise.
  return bulkStorage();
}

export function readLearningLog(): LearningEvent[] {
  try {
    const raw = storage()?.getItem(LOG_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as LearningEvent[]) : [];
  } catch {
    return [];
  }
}

/** Append one event. Never throws: a disabled or full storage must not take the runner down with it. */
export function logEvent(event: Omit<LearningEvent, 't'> & { t?: number }): void {
  const entry: LearningEvent = { t: event.t ?? Date.now(), ...event };
  if (entry.kind === 'run' && entry.fail) entry.fail = entry.fail.split('\n')[0].slice(0, FAIL_LINE_CHARS);
  try {
    const store = storage();
    if (!store) return;
    const events = readLearningLog();
    events.push(entry);
    store.setItem(LOG_STORAGE_KEY, JSON.stringify(events.slice(-MAX_EVENTS)));
  } catch {
    // Storage disabled or over quota: the learner keeps working, the log simply misses this event.
  }
}

/** Replace the whole log, used after a cloud merge has unioned this browser's events with another's. */
export function replaceLearningLog(events: LearningEvent[]): void {
  try {
    storage()?.setItem(LOG_STORAGE_KEY, JSON.stringify(events.slice(-MAX_EVENTS)));
  } catch {
    // Storage disabled or over quota: the log keeps whatever it already held.
  }
}

export function clearLearningLog(): void {
  try {
    storage()?.removeItem(LOG_STORAGE_KEY);
  } catch {
    // nothing to clear if storage is unavailable
  }
}

/** What one lesson's events add up to: opened, run, and how the last run landed. */
export interface LessonAttempt {
  /** `lesson_open` events - one per visit, including the first render. */
  opens: number;
  /** Executions the learner asked for; 0 means the starter was never run. */
  runs: number;
  /** The last run's verdict: verified | mismatch | harness_failed | behavior_failed | stopped | error. */
  lastOutcome?: string;
  /** The first line of that run's failure, when it had one. */
  lastFail?: string;
  /** When that run finished, so "this session" can be told from "weeks ago". */
  lastRunAt?: number;
}

/**
 * The log folded per lesson: how often it was opened, and whether anything was ever run.
 *
 * This is the difference between "opened" and "attempted" that no progress flag carries: a learner
 * who opens a lesson, reads it and leaves has an `lesson_open` and nothing else, and the roadmap can
 * say so instead of calling the same lesson untouched as one they wrote half of and ran four times.
 * Pure, so the rule is testable without a browser; the caller decides when to re-read the log.
 */
export function attemptsByLesson(events: LearningEvent[] = readLearningLog()): Record<string, LessonAttempt> {
  const attempts: Record<string, LessonAttempt> = {};
  for (const event of events) {
    if (!event.lesson) continue;
    if (event.kind === 'lesson_open') {
      const entry = (attempts[event.lesson] ??= { opens: 0, runs: 0 });
      entry.opens += 1;
      continue;
    }
    if (event.kind !== 'run') continue;
    const entry = (attempts[event.lesson] ??= { opens: 0, runs: 0 });
    entry.runs += 1;
    entry.lastOutcome = event.outcome;
    entry.lastFail = event.fail;
    entry.lastRunAt = event.t;
  }
  return attempts;
}

/**
 * The exported document. Versioned so `scripts/friction_report.py` can refuse a shape it cannot read.
 *
 * `sittings` rides beside the events because the pilot's `active_minutes` column is the one number in
 * `docs/PILOT.md` that had no measurement behind it: the log says *what* happened, and the sitting
 * clock (`sittingClock.ts`) says how long each stretch of it lasted.
 */
export function learningLogJson(): string {
  // The current visit's paint is flushed first: a learner who exports before the timed flush should
  // get this visit's reading, not the one before it. Slow-loading samples ride beside the events for
  // the same reason the sittings do — they are measurements *about* the visit, not things the learner
  // did, so they are not events (`paintTiming.ts` keeps them in their own store).
  flushPaintSample();
  const paint = readPaintSamples();
  return JSON.stringify(
    {
      schema: LOG_SCHEMA,
      exportedAt: Date.now(),
      events: readLearningLog(),
      sittings: readSittings(),
      paint: { schema: PAINT_SCHEMA, samples: paint, summary: paintSummary(paint) },
    },
    null,
    2
  );
}

/** Download the log as `mechalab-learning-log-<date>.json`. */
export function downloadLearningLog(): void {
  // The export is itself an event, so it has to be written before the document is built — one
  // builder for the document and the download, or the two files drift apart.
  logEvent({ kind: 'export' });
  const stamp = new Date().toISOString().slice(0, 10);
  const blob = new Blob([learningLogJson()], {
    type: 'application/json',
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `mechalab-learning-log-${stamp}.json`;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}
