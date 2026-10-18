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
 *  - `verified`: the numerator. A run that passed both behavioural and output checks.
 *  - `hint` / `solution_open`: which help was used and when, so "needed a person" can be told apart
 *    from "used the ladder".
 *  - `export`: when the learner handed the file over, so a partial log is not read as a whole one.
 *
 * Events are capped so the log cannot fill localStorage (a quota error would otherwise break the
 * runner); the oldest events are dropped first, and the cap is far above one Core route's worth.
 */

export type LearningEventKind = 'lesson_open' | 'run' | 'verified' | 'hint' | 'solution_open' | 'export';

export interface LearningEvent {
  /** Milliseconds since the epoch, so idle gaps are visible without a clock event. */
  t: number;
  kind: LearningEventKind;
  lesson?: string;
  /** `run`: verified | mismatch | behavior_failed | stopped | error. */
  outcome?: string;
  /** `run`: the first line of the failing assertion or traceback, truncated. */
  fail?: string;
  /** `hint`: how many hints were unlocked after this click. */
  level?: number;
  /** `run`: wall-clock milliseconds between the run starting and its result. */
  ms?: number;
}

export const LOG_STORAGE_KEY = 'mechalab.learningLog.v1';
export const LOG_SCHEMA = 'mechalab.learning-log/1';
const MAX_EVENTS = 5000;
const FAIL_LINE_CHARS = 200;

export function readLearningLog(): LearningEvent[] {
  try {
    const raw = localStorage.getItem(LOG_STORAGE_KEY);
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
    const events = readLearningLog();
    events.push(entry);
    localStorage.setItem(LOG_STORAGE_KEY, JSON.stringify(events.slice(-MAX_EVENTS)));
  } catch {
    // Storage disabled or over quota: the learner keeps working, the log simply misses this event.
  }
}

export function clearLearningLog(): void {
  try {
    localStorage.removeItem(LOG_STORAGE_KEY);
  } catch {
    // nothing to clear if storage is unavailable
  }
}

/** The exported document. Versioned so `scripts/friction_report.py` can refuse a shape it cannot read. */
export function learningLogJson(): string {
  return JSON.stringify(
    {
      schema: LOG_SCHEMA,
      exportedAt: Date.now(),
      events: readLearningLog(),
    },
    null,
    2
  );
}

/** Download the log as `mechalab-learning-log-<date>.json`. */
export function downloadLearningLog(): void {
  const events = readLearningLog();
  logEvent({ kind: 'export' });
  const stamp = new Date().toISOString().slice(0, 10);
  const blob = new Blob([JSON.stringify({ schema: LOG_SCHEMA, exportedAt: Date.now(), events }, null, 2)], {
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
