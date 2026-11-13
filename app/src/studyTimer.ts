/**
 * The study clock in the lesson brief (`app/src/studyTimer.ts`).
 *
 * `sittingClock.ts` measures study time on its own: it extends a sitting whenever the learner opens
 * a lesson, runs code or answers a card, and closes it after five idle minutes. That is honest, but
 * it is invisible — the only read-out was a small line in the Study panel, and nothing lets a
 * learner say "this hour was study". So the brief card carries a clock with one toggle — **Start /
 * Pause / Resume** — and **Log & reset**. The clock counts while the lesson is open; Log & reset
 * files the stretch as study time and puts the digits back to zero.
 *
 * The rules, and why each is the one it is:
 *
 * - **It counts in banked stretches.** A stretch ends when the learner presses Pause or the page
 *   reloads; the time it earned is banked and the next press of Resume starts a new one. That is
 *   what makes the clock honest across a reload instead of losing the half hour before it.
 * - **Only the learner stops it.** A tab in the background keeps counting while the lesson stays
 *   open: the clock used to pause itself on `document.visibility.hidden`, and the learner came back
 *   to digits that had not moved, which read as the clock breaking. Pause is the explicit stop.
 * - **A page that was gone is trusted only to its last heartbeat.** While the clock runs it writes a
 *   heartbeat a minute; a store that says "running since Tuesday" cannot credit the week, so
 *   `resumeTimer` pauses it at the last heartbeat. It is the sitting's own five-minute break rule,
 *   reused rather than re-derived.
 * - **Only the facts are stored**: what is banked, when the running stretch began, the last
 *   heartbeat, the lesson it belongs to, and this session's presses. Blocked storage leaves the
 *   clock unrecorded for the visit, never the lesson broken.
 *
 * The card names three things, because they are easy to mix up:
 *
 * - **A press** is one Start, Pause or Resume.
 * - **A stretch** is what a Start or Resume opens and what the next Pause closes.
 * - **The session** is everything since the last Log & reset: the digits are its time, and its
 *   presses are the log.
 *
 * Everything above the storage layer is pure and takes `now`, so `npm run test:studyclock` can pin
 * the arithmetic across pauses and reloads without a browser or a timer.
 */

import { IDLE_GAP_MS } from './sittingClock.ts';

export const TIMER_STORAGE_KEY = 'mechalab_study_timer_v1';

/**
 * One line in a session: a press, or the lesson being finished.
 *
 * `complete` is not a press - nobody pressed it - but it belongs in the same log: "when did this
 * session start, when did it pause, when was the lesson actually done".
 */
export type ClockAction = 'start' | 'pause' | 'resume' | 'complete';

/**
 * One press in the session log.
 *
 * `clockMs` is what the big digits read at that press. `stretchMs` is how long the stretch a pause
 * ended had run, and is null on a start or a resume because those open a stretch.
 */
export interface ClockLogEntry {
  action: ClockAction;
  /** When the press happened (`Date.now()`); the card prints it as the time of day, e.g. 14:32. */
  at: number;
  /** The study clock at that press, in milliseconds. */
  clockMs: number;
  /** A pause: how long its stretch ran. A start or a resume: null. */
  stretchMs: number | null;
}

/** How many presses the log keeps. The newest win, so a long session cannot grow the store forever. */
export const MAX_CLOCK_LOG = 16;

export interface StudyTimer {
  /** Milliseconds in stretches that already ended — a pause, a reload, a hidden tab. */
  bankedMs: number;
  /** When the running stretch began, or null while the clock is not counting. */
  runningSince: number | null;
  /** The last heartbeat: how far the clock is trusted after the page went away. */
  lastTick: number;
  /** The lesson the current stretch belongs to, so the sitting can name it. */
  lesson: string;
  /** This session's presses, oldest first. Log & reset starts an empty log. */
  log: ClockLogEntry[];
}

export const IDLE_TIMER: StudyTimer = {
  bankedMs: 0,
  runningSince: null,
  lastTick: 0,
  lesson: '',
  log: [],
};

/** The clock's reading at `now`: banked time plus the stretch in progress. Never negative. */
export function elapsedMs(timer: StudyTimer, now: number): number {
  const banked = Number.isFinite(timer.bankedMs) ? Math.max(0, timer.bankedMs) : 0;
  if (timer.runningSince === null) return Math.round(banked);
  return Math.round(banked + Math.max(0, Math.round(now) - timer.runningSince));
}

/**
 * `h:mm:ss` — the shape a stopwatch is read in.
 *
 * Hours are not padded and do not roll over at 24: a sitting is capped at three, and "0:07:12" is
 * what a learner expects to see after seven minutes rather than "07:12".
 */
export function formatClock(ms: number): string {
  const seconds = Number.isFinite(ms) && ms > 0 ? Math.floor(ms / 1000) : 0;
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const rest = seconds % 60;
  return `${hours}:${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}`;
}

/**
 * The time of day a press happened, as the learner's own clock shows it: `14:32`, `00:05`.
 *
 * Twenty-four hours and no seconds: the digits already carry the seconds, and a press is named by
 * the minute it happened in.
 */
export function formatTimeOfDay(at: number): string {
  // No readable time reads as midnight rather than as the visitor's own 1969 evening.
  if (!Number.isFinite(at) || at <= 0) return '00:00';
  const date = new Date(at);
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
}

/** The log with one press added, newest last, kept to its bound. */
function addPress(timer: StudyTimer, entry: ClockLogEntry): ClockLogEntry[] {
  // A timer handed in without a log (a hand-built value, or one from before the log existed) starts
  // its log here rather than throwing on the first press.
  const log = Array.isArray(timer.log) ? timer.log : [];
  return [...log, entry].slice(-MAX_CLOCK_LOG);
}

/**
 * Begin, or resume, counting: what is already on the clock is banked and a stretch opens.
 *
 * `action` is what the learner pressed — `start` for the session's first press and `resume` after a
 * pause — because only the caller can see which label the one button is showing.
 */
export function startTimer(
  timer: StudyTimer,
  now: number,
  lesson: string,
  action: 'start' | 'resume' = 'start'
): StudyTimer {
  const at = Math.round(now);
  const banked = elapsedMs(timer, at);
  // A clock whose bank is zero and which never ran is the idle value: the resume is a start, and a
  // stretch that begins at zero has no earlier lesson to carry.
  return {
    bankedMs: banked,
    runningSince: at,
    lastTick: at,
    lesson: lesson || timer.lesson,
    log: addPress(timer, { action, at, clockMs: banked, stretchMs: null }),
  };
}

/**
 * Stop counting and keep the time.
 *
 * Idempotent in what matters: pressing Pause on a paused clock only moves the heartbeat, so the log
 * never gains a second pause for one stop and the stretch is never counted twice.
 */
export function pauseTimer(timer: StudyTimer, now: number): StudyTimer {
  const at = Math.round(now);
  if (timer.runningSince === null) return { ...timer, lastTick: Math.max(timer.lastTick, at) };
  const clockMs = elapsedMs(timer, at);
  return {
    bankedMs: clockMs,
    runningSince: null,
    lastTick: at,
    lesson: timer.lesson,
    log: addPress(timer, {
      action: 'pause',
      at,
      clockMs,
      stretchMs: Math.max(0, at - timer.runningSince),
    }),
  };
}

/** Say the page is still here. Called with each measured minute; the sitting is written beside it. */
/**
 * The lesson was finished, at `now`, on the clock's own reading.
 *
 * Finishing a lesson is the fact the clock exists to record, and it is not a press — nobody pressed
 * it. It is also where the clock stops: the pass is what the sitting was for, so the stretch is
 * banked at that instant exactly as a Pause would bank it, and the digits stop counting so an
 * unattended tab cannot keep billing after the lesson is done. The line joins the same session log a
 * Start or Pause writes — `Lesson completed` with the stretch it closed — so the card answers "when
 * was this done, and how long did the last stretch run".
 *
 * Resuming afterwards is allowed and is its own press: a learner who keeps reading presses Resume.
 */
export function completeTimer(timer: StudyTimer, now: number): StudyTimer {
  const at = Math.round(now);
  const clockMs = elapsedMs(timer, at);
  const stretchMs = timer.runningSince === null ? null : Math.max(0, at - timer.runningSince);
  return {
    bankedMs: clockMs,
    runningSince: null,
    lastTick: at,
    lesson: timer.lesson,
    log: addPress(timer, { action: 'complete', at, clockMs, stretchMs }),
  };
}

/**
 * One completion line per lesson per visit.
 *
 * `markLessonVerified` runs on every passing run, so this is the guard that keeps a second Run from
 * writing a second "Lesson completed" line. The set is per page, not stored: a new visit is a new
 * session, and a log that remembered last week's completions would be a history, not a session.
 *
 * A lesson finished while the clock was idle still writes its line — the fact is the fact — and the
 * clock stays at zero; a clock that stops on a completion it did not see running has nothing to stop.
 */
const completionLogged = new Set<string>();

export function recordLessonComplete(lessonId: string, now: number = Date.now()): StudyTimer {
  if (!lessonId || completionLogged.has(lessonId)) return readTimer();
  completionLogged.add(lessonId);
  const next = completeTimer(readTimer(), now);
  writeTimer(next);
  try {
    if (typeof window !== 'undefined') window.dispatchEvent(new Event(STUDY_CLOCK_EVENT));
  } catch {
    // A blocked window costs the announcement, not the log line.
  }
  return next;
}

export function heartbeat(timer: StudyTimer, now: number): StudyTimer {
  if (timer.runningSince === null) return timer;
  return { ...timer, lastTick: Math.max(timer.lastTick, Math.round(now)) };
}

/** Zero the clock, keeping the lesson the next stretch will belong to. */
export function clearedTimer(lesson = ''): StudyTimer {
  return { ...IDLE_TIMER, lesson };
}

/**
 * A stored clock, trusted as far as its last heartbeat.
 *
 * A running stretch whose heartbeat is older than a sitting's break means the page was gone, not
 * that the learner was studying: it is paused at that heartbeat, so the absence is never credited
 * and the time before it is kept.
 */
export function resumeTimer(timer: StudyTimer, now: number): StudyTimer {
  if (timer.runningSince === null) return timer;
  const at = Math.round(now);
  const trustedTo = Math.max(timer.runningSince, timer.lastTick || timer.runningSince);
  if (at - trustedTo > IDLE_GAP_MS) return pauseTimer(timer, trustedTo);
  return { ...timer, lastTick: Math.max(timer.lastTick, timer.runningSince) };
}

function count(value: unknown, fallback = 0): number {
  const raw = Number(value);
  return Number.isFinite(raw) && raw >= 0 ? Math.round(raw) : fallback;
}

/** One stored press, or null when it cannot be read. Junk costs its own line, not the log. */
function parsePress(value: unknown): ClockLogEntry | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const press = value as Record<string, unknown>;
  if (
    press.action !== 'start' &&
    press.action !== 'pause' &&
    press.action !== 'resume' &&
    press.action !== 'complete'
  )
    return null;
  const at = count(press.at);
  // A press with no readable time is not a press: printing it at 00:00 would invent one.
  if (at <= 0) return null;
  const stretchMs =
    press.stretchMs === null || press.stretchMs === undefined ? null : count(press.stretchMs);
  return { action: press.action, at, clockMs: count(press.clockMs), stretchMs };
}

/** A store written by another version reads as the part of itself that still parses. */
export function parseTimer(raw: string | null): StudyTimer {
  if (!raw) return { ...IDLE_TIMER };
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return { ...IDLE_TIMER };
    const entry = parsed as Record<string, unknown>;
    const lesson = typeof entry.lesson === 'string' ? entry.lesson : '';
    const running =
      entry.runningSince === null || entry.runningSince === undefined
        ? null
        : count(entry.runningSince, 0) || null;
    const bankedMs = count(entry.bankedMs);
    const lastTick = running === null ? count(entry.lastTick) : Math.max(running, count(entry.lastTick));
    const log = (Array.isArray(entry.log) ? entry.log : [])
      .map(parsePress)
      .filter((press): press is ClockLogEntry => press !== null)
      .slice(-MAX_CLOCK_LOG);
    return { bankedMs, runningSince: running, lastTick, lesson, log };
  } catch {
    return { ...IDLE_TIMER };
  }
}

function bucket(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

/** The stored clock, or idle when nothing is stored or the value is unusable. */
export function readTimer(store: Storage | null = bucket()): StudyTimer {
  if (!store) return { ...IDLE_TIMER };
  try {
    return parseTimer(store.getItem(TIMER_STORAGE_KEY));
  } catch {
    return { ...IDLE_TIMER };
  }
}

export function writeTimer(timer: StudyTimer, store: Storage | null = bucket()): void {
  if (!store) return;
  try {
    if (
      timer.bankedMs === 0 &&
      timer.runningSince === null &&
      !timer.lastTick &&
      timer.log.length === 0
    ) {
      store.removeItem(TIMER_STORAGE_KEY);
      return;
    }
    store.setItem(TIMER_STORAGE_KEY, JSON.stringify(timer));
  } catch {
    // Blocked or full: the clock lasts this visit only.
  }
}

export function clearTimer(store: Storage | null = bucket()): void {
  if (!store) return;
  try {
    store.removeItem(TIMER_STORAGE_KEY);
  } catch {
    // Nothing to do: the next write is the one that matters.
  }
}

/** Fired when the clock is started from outside its own row (the lesson's reminder). */
export const STUDY_CLOCK_EVENT = 'mechalab-study-clock';

/**
 * Start the clock from the reminder at the top of a lesson.
 *
 * The reminder and the row are two views of one store, so this writes the same record the row's own
 * Start button would and then announces it: every mounted clock re-reads instead of showing the
 * digits it had before the press.
 */
export function startClockFromReminder(lessonId: string, now: number): StudyTimer {
  const before = readTimer();
  const next = startTimer(before, now, lessonId, elapsedMs(before, now) > 0 ? 'resume' : 'start');
  writeTimer(next);
  try {
    if (typeof window !== 'undefined') window.dispatchEvent(new Event(STUDY_CLOCK_EVENT));
  } catch {
    // A blocked window costs the announcement, not the clock.
  }
  return next;
}
