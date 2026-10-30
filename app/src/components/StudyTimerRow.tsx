import React, { useEffect, useId, useRef, useState } from 'react';
import { ChevronDown, Pause, Play, Timer, TimerReset } from 'lucide-react';
import {
  clearedTimer,
  elapsedMs,
  formatClock,
  heartbeat,
  pauseTimer,
  readTimer,
  resumeTimer,
  startTimer,
  writeTimer,
  type StudyTimer,
} from '../studyTimer';
import {
  SITTING_RECORDED_EVENT,
  formatDuration,
  lessonTotals,
  readSittings,
  recordSittingEvent,
  sittingTotals,
} from '../sittingClock';

/**
 * The study clock, in the lesson brief (`components/StudyTimerRow.tsx`).
 *
 * One toggle and a filing button: **Start / Pause / Resume** opens a stretch, stops the digits, or
 * carries on from where they stopped; **Log & reset** files what the clock holds as study time and
 * puts it back to `0:00:00`. The time goes nowhere new — it is a `study` heartbeat into
 * `sittingClock.ts`, the same store Today, the trail and the portfolio already read — so the hours
 * the learner logs and the hours the site reports are one number.
 *
 * The clock counts while the lesson is open until the learner pauses it. It used to stop itself
 * whenever the tab went to the background, which read as the clock breaking: a learner who glanced at
 * a datasheet came back to digits that had not moved. The pause is explicit now, and the minute
 * heartbeat still means a reload keeps the stretch instead of losing the half hour before it.
 *
 * Beside it, **Time logged with this lesson** expands what the sittings say — the total, how many
 * sittings, and today. It is labelled by what the store can actually answer: a sitting is a run of
 * activity, and one that touched two lessons counts whole for both, so the panel says "in sittings
 * with this lesson" and names that rule instead of claiming a per-lesson stopwatch it never kept.
 */
const HEARTBEAT_MS = 60_000;

const BUTTON =
  'inline-flex items-center gap-1 rounded border border-line bg-raise px-2.5 py-1 text-[12px] font-mono font-semibold text-ink cursor-pointer hover:bg-elevate disabled:opacity-50 disabled:cursor-not-allowed';

const LINK_BUTTON =
  'inline-flex items-center gap-1 font-mono text-[12px] text-accent underline decoration-dotted cursor-pointer';

export const StudyTimerRow: React.FC<{ lessonId: string; compact?: boolean }> = ({
  lessonId,
  compact = false,
}) => {
  const [timer, setTimer] = useState<StudyTimer>(() => resumeTimer(readTimer(), Date.now()));
  /** The filed stretch's own duration, so Log & reset can say what it just kept. */
  const [logged, setLogged] = useState('');
  const [todayMs, setTodayMs] = useState(() => sittingTotals(readSittings()).todayMs);
  const [lesson, setLesson] = useState(() => lessonTotals(readSittings(), lessonId));
  const [logOpen, setLogOpen] = useState(false);
  // Two rows can be mounted at once (the phone strip's compact clock and the brief's full one);
  // the panel id has to name this row's panel, not whichever rendered first.
  const logPanelId = useId();
  /** Bumped once a second: only the digits move, the store moves on a heartbeat. */
  const [, setTick] = useState(0);
  const timerRef = useRef(timer);
  timerRef.current = timer;

  const persist = (next: StudyTimer) => {
    writeTimer(next);
    setTimer(next);
  };

  // A stored clock is only trusted to its last heartbeat; a page that was away is paused, not paid.
  useEffect(() => {
    const resumed = resumeTimer(readTimer(), Date.now());
    writeTimer(resumed);
    setTimer(resumed);
  }, []);

  // Today's hours, and this lesson's, follow the store wherever the write came from — a run, a
  // review, this clock. One listener for both, so they can never disagree about the same write.
  useEffect(() => {
    const read = () => {
      const sittings = readSittings();
      setTodayMs(sittingTotals(sittings).todayMs);
      setLesson(lessonTotals(sittings, lessonId));
    };
    read();
    window.addEventListener(SITTING_RECORDED_EVENT, read);
    return () => window.removeEventListener(SITTING_RECORDED_EVENT, read);
  }, [lessonId]);

  // While the clock runs: the digits move each second, and the sitting is extended each minute.
  // Nothing here stops the clock for a hidden tab: the learner's Pause is the only stop.
  useEffect(() => {
    if (timer.runningSince === null) return;
    const id = window.setInterval(() => {
      const now = Date.now();
      setTick((count) => count + 1);
      const current = timerRef.current;
      if (current.runningSince === null) return;
      if (now - current.lastTick < HEARTBEAT_MS) return;
      recordSittingEvent({ at: now, kind: 'study', lesson: lessonId });
      persist(heartbeat(current, now));
    }, 1000);
    return () => window.clearInterval(id);
    // `runningSince` is the whole switch: a paused clock needs no interval at all.
  }, [timer.runningSince, lessonId]);

  const elapsed = elapsedMs(timer, Date.now());
  const running = timer.runningSince !== null;
  const state = running ? 'running' : elapsed > 0 ? 'paused' : 'idle';
  const today = formatDuration(todayMs);

  const onToggle = () => {
    const now = Date.now();
    setLogged('');
    recordSittingEvent({ at: now, kind: 'study', lesson: lessonId });
    // One control for both directions: the press means what its label says.
    persist(running ? pauseTimer(timer, now) : startTimer(timer, now, lessonId));
  };

  const onReset = () => {
    const at = Date.now();
    const total = elapsedMs(timer, at);
    if (total <= 0) return;
    recordSittingEvent({ at, kind: 'study', lesson: lessonId });
    setLogged(formatDuration(total));
    persist(clearedTimer(lessonId));
  };

  return (
    <div
      data-testid="study-timer"
      data-state={state}
      // The compact row is the phone strip's clock: the same store, the same buttons, without the
      // Today line and the status sentence that a 360 px strip cannot afford.
      className={
        compact
          ? 'flex flex-wrap items-center gap-x-2 gap-y-1'
          : 'mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-line-soft pt-2.5'
      }
    >
      <span className="flex items-center gap-1.5 eyebrow">
        <Timer className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
        {compact ? 'Clock' : 'Study clock'}
      </span>
      <span
        data-testid="study-timer-elapsed"
        title={`${formatDuration(elapsed)} on this stretch`}
        className="font-mono text-[15px] font-bold tabular-nums text-ink"
      >
        {formatClock(elapsed)}
      </span>
      {!compact && (
        <span className="font-mono text-[11.5px] text-faint" data-testid="study-timer-today">
          Today {today}
        </span>
      )}
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={onToggle}
          data-testid="btn-study-timer"
          data-timer-action={running ? 'pause' : elapsed > 0 ? 'resume' : 'start'}
          title={
            running
              ? 'Pause the clock and keep what it has counted'
              : elapsed > 0
                ? 'Carry on from where the clock paused'
                : 'Start counting this session as study time'
          }
          className={BUTTON}
        >
          {running ? (
            <Pause className="h-3 w-3" aria-hidden="true" />
          ) : (
            <Play className="h-3 w-3" aria-hidden="true" />
          )}
          {running ? 'Pause' : elapsed > 0 ? 'Resume' : 'Start'}
        </button>
        <button
          type="button"
          onClick={onReset}
          disabled={elapsed === 0}
          data-testid="btn-study-timer-reset"
          title="File this stretch as study time — it lands in Today and the trail — and set the clock back to zero"
          className={BUTTON}
        >
          <TimerReset className="h-3 w-3" aria-hidden="true" />
          {compact ? 'Log' : 'Log & reset'}
        </button>
      </div>
      {!compact && (
        <span className="font-mono text-[11.5px] text-faint" data-testid="study-timer-logged">
          {logged
            ? `Logged ${logged}`
            : running
              ? 'Counting while this lesson is open'
              : elapsed > 0
                ? 'Paused — Resume keeps counting'
                : 'Press Start to time this session'}
        </span>
      )}
      <button
        type="button"
        data-testid="btn-study-logged"
        aria-expanded={logOpen}
        aria-controls={logPanelId}
        onClick={() => setLogOpen((open) => !open)}
        className={`${LINK_BUTTON} ${compact ? 'w-full' : ''}`}
      >
        Time logged with this lesson
        <ChevronDown
          className={`h-3 w-3 transition-transform ${logOpen ? 'rotate-180' : ''}`}
          aria-hidden="true"
        />
      </button>
      {logOpen && (
        <div
          id={logPanelId}
          data-testid="study-timer-logged-panel"
          className="w-full rounded-lg border border-line bg-canvas px-2.5 py-2 font-mono text-[11.5px] text-muted"
        >
          <p data-testid="study-timer-lesson-total">
            In sittings with this lesson{' '}
            <span className="font-semibold text-body">
              {lesson.count > 0 ? formatDuration(lesson.totalMs) : 'nothing logged yet'}
            </span>
            {lesson.count > 0 &&
              ` · ${lesson.count} sitting${lesson.count === 1 ? '' : 's'}${
                lesson.todayMs > 0 ? ` · today ${formatDuration(lesson.todayMs)}` : ''
              }`}
          </p>
          <p data-testid="study-timer-scope" className="mt-0.5">
            A sitting is one stretch of activity, so it counts whole for every lesson it touched.
          </p>
          <p className="mt-0.5">Today, all lessons: {todayMs > 0 ? today : 'nothing logged yet'}</p>
        </div>
      )}
    </div>
  );
};
