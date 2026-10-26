/**
 * Night shifts (`app/src/gamification/nightShifts.ts`): a weekly target, never a streak.
 *
 * EA Corp set the learner's hours; here the learner sets their own. A night shift is a day on which
 * a *meaningful attempt* happened — a run or a verification. Opening a lesson is not one: a tab
 * opened and abandoned is exactly the time-on-page signal this game refuses to reward.
 *
 * A missed day erases nothing. There is no decay, no expiring reward and no guilt message; the
 * worst a week can say is "2 of 4" and the work itself is untouched.
 */
export type WeekStart = 'monday' | 'sunday';

/** The two fields this module reads. The full log's shape belongs to `learningLog.ts`. */
export interface LoggedActivity {
  t: number;
  kind: string;
}

/** Kinds that count as an attempt: work was actually run or verified. */
const MEANINGFUL: ReadonlySet<string> = new Set(['run', 'verified']);

const DAY_MS = 24 * 60 * 60 * 1000;

export interface NightShiftWeek {
  /** The week's first day, `YYYY-MM-DD`, so two devices agree on which week a day belongs to. */
  key: string;
  /** Local midnight of the first day, ms. */
  start: number;
  /** Distinct local days (0..6, Monday-first) with a meaningful attempt. */
  days: number[];
  count: number;
  target: number;
  met: boolean;
}

function startOfDay(ms: number): number {
  const date = new Date(ms);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

/** Local midnight of the week's first day. Weeks are local, because a learner's night is local. */
export function weekStart(ms: number, startsOn: WeekStart = 'monday'): number {
  const start = startOfDay(ms);
  const weekday = new Date(start).getDay(); // 0 = Sunday
  const fromFirst = startsOn === 'monday' ? (weekday + 6) % 7 : weekday;
  return start - fromFirst * DAY_MS;
}

export function weekKey(ms: number, startsOn: WeekStart = 'monday'): string {
  const date = new Date(weekStart(ms, startsOn));
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

function daysWithWork(events: readonly LoggedActivity[], start: number): number[] {
  const end = start + 7 * DAY_MS;
  const days = new Set<number>();
  for (const event of events) {
    if (!MEANINGFUL.has(event.kind)) continue;
    if (event.t < start || event.t >= end) continue;
    days.add(Math.round((startOfDay(event.t) - start) / DAY_MS));
  }
  return [...days].sort((a, b) => a - b);
}

/** The last `weeks` weeks, oldest first, ending with the week `now` is in. */
export function nightShiftWeeks(
  events: readonly LoggedActivity[],
  now: number,
  target: number,
  startsOn: WeekStart = 'monday',
  weeks = 8
): NightShiftWeek[] {
  const current = weekStart(now, startsOn);
  const out: NightShiftWeek[] = [];
  for (let index = weeks - 1; index >= 0; index -= 1) {
    const start = current - index * 7 * DAY_MS;
    const days = daysWithWork(events, start);
    out.push({
      key: weekKey(start, startsOn),
      start,
      days,
      count: days.length,
      target,
      met: days.length >= target,
    });
  }
  return out;
}

export function currentNightShift(
  events: readonly LoggedActivity[],
  now: number,
  target: number,
  startsOn: WeekStart = 'monday'
): NightShiftWeek {
  const weeks = nightShiftWeeks(events, now, target, startsOn, 1);
  return weeks[0];
}

/**
 * Consecutive weeks that met the target, ending with this week if it has met it, otherwise with
 * last week. The current week being unfinished never breaks a run — it just has not extended it yet.
 */
export function practiceWeekRun(
  events: readonly LoggedActivity[],
  now: number,
  target: number,
  startsOn: WeekStart = 'monday',
  weeks = 8
): number {
  const history = nightShiftWeeks(events, now, target, startsOn, weeks);
  let run = 0;
  let index = history.length - 1;
  if (index >= 0 && !history[index].met) index -= 1;
  for (; index >= 0; index -= 1) {
    if (!history[index].met) break;
    run += 1;
  }
  return run;
}

/** `3 of 4 night shifts` — the one line Mission Control prints about the week. */
export function nightShiftLabel(week: NightShiftWeek): string {
  return `${week.count} of ${week.target} night shift${week.target === 1 ? '' : 's'}`;
}
