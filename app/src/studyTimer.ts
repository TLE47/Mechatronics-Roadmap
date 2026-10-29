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
 *   heartbeat, and the lesson it belongs to. Blocked storage leaves the clock unrecorded for the
 *   visit, never the lesson broken.
 *
 * Everything above the storage layer is pure and takes `now`, so `npm run test:studyclock` can pin
 * the arithmetic across pauses and reloads without a browser or a timer.
 */

import { IDLE_GAP_MS } from './sittingClock.ts';

export const TIMER_STORAGE_KEY = 'mechalab_study_timer_v1';

export interface StudyTimer {
  /** Milliseconds in stretches that already ended — a pause, a reload, a hidden tab. */
  bankedMs: number;
  /** When the running stretch began, or null while the clock is not counting. */
  runningSince: number | null;
  /** The last heartbeat: how far the clock is trusted after the page went away. */
  lastTick: number;
  /** The lesson the current stretch belongs to, so the sitting can name it. */
  lesson: string;
}

export const IDLE_TIMER: StudyTimer = {
  bankedMs: 0,
  runningSince: null,
  lastTick: 0,
  lesson: '',
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

/** Begin, or resume, counting: what is already on the clock is banked and a stretch opens. */
export function startTimer(timer: StudyTimer, now: number, lesson: string): StudyTimer {
  const at = Math.round(now);
  const banked = elapsedMs(timer, at);
  // A clock whose bank is zero and which never ran is the idle value: the resume is a start, and a
  // stretch that begins at zero has no earlier lesson to carry.
  return {
    bankedMs: banked,
    runningSince: at,
    lastTick: at,
    lesson: lesson || timer.lesson,
  };
}

/** Stop counting and keep the time. Idempotent: pausing a paused clock only moves the heartbeat. */
export function pauseTimer(timer: StudyTimer, now: number): StudyTimer {
  const at = Math.round(now);
  if (timer.runningSince === null) return { ...timer, lastTick: Math.max(timer.lastTick, at) };
  return {
    bankedMs: elapsedMs(timer, at),
    runningSince: null,
    lastTick: at,
    lesson: timer.lesson,
  };
}

/** Say the page is still here. Called with each measured minute; the sitting is written beside it. */
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
    return { bankedMs, runningSince: running, lastTick, lesson };
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
    if (timer.bankedMs === 0 && timer.runningSince === null && !timer.lastTick) {
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
