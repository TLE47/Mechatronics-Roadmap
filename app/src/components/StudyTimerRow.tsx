import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Play, Timer, TimerReset } from 'lucide-react';
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
  readSittings,
  recordSittingEvent,
  sittingTotals,
} from '../sittingClock';

/**
 * The study clock, in the lesson brief (`components/StudyTimerRow.tsx`).
 *
 * Two buttons and a reading: **Start / Resume** opens or reopens a stretch, **Log & reset** files
 * what the clock holds as study time and puts it back to `0:00:00`. The time goes nowhere new — it
 * is a `study` heartbeat into `sittingClock.ts`, the same store Today, the trail and the portfolio
 * already read — so the hours the learner logs and the hours the site reports are one number.
 *
 * The clock counts only while the tab is visible, and writes a heartbeat each minute so a reload
 * does not throw the stretch away (`studyTimer.ts` has the arithmetic). The buttons are deliberately
 * exactly two: a pause button would be a third way to leave a stretch, and Reset is already the one
 * that files it.
 */
const HEARTBEAT_MS = 60_000;

const BUTTON =
  'inline-flex items-center gap-1 rounded border border-line bg-raise px-2.5 py-1 text-[12px] font-mono font-semibold text-ink cursor-pointer hover:bg-elevate disabled:opacity-50 disabled:cursor-not-allowed';

export const StudyTimerRow: React.FC<{ lessonId: string; compact?: boolean }> = ({
  lessonId,
  compact = false,
}) => {
  const [timer, setTimer] = useState<StudyTimer>(() => resumeTimer(readTimer(), Date.now()));
  /** The filed stretch's own duration, so Log & reset can say what it just kept. */
  const [logged, setLogged] = useState('');
  const [todayMs, setTodayMs] = useState(() => sittingTotals(readSittings()).todayMs);
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

  // Today's hours follow the store wherever the write came from — a run, a review, this clock.
  useEffect(() => {
    const read = () => setTodayMs(sittingTotals(readSittings()).todayMs);
    read();
    window.addEventListener(SITTING_RECORDED_EVENT, read);
    return () => window.removeEventListener(SITTING_RECORDED_EVENT, read);
  }, []);

  /**
   * Stop counting because the page is not on screen.
   *
   * Called by the visibility event, and again by each tick — a tab that was already hidden when the
   * clock started never fires a change event, and the interval that keeps the digits moving is the
   * last place that can notice. Waiting for Resume is deliberate: coming back to a tab is not the
   * same as saying the break is over.
   */
  const pauseWhileHidden = useCallback(() => {
    const current = timerRef.current;
    if (current.runningSince === null) return;
    const now = Date.now();
    recordSittingEvent({ at: now, kind: 'study', lesson: lessonId });
    const paused = pauseTimer(current, now);
    writeTimer(paused);
    setTimer(paused);
  }, [lessonId]);

  // A hidden tab is not study time: file what it earned and wait for Resume.
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState !== 'hidden') return;
      pauseWhileHidden();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [pauseWhileHidden]);

  // While the clock runs: the digits move each second, and the sitting is extended each minute.
  useEffect(() => {
    if (timer.runningSince === null) return;
    const id = window.setInterval(() => {
      const now = Date.now();
      setTick((count) => count + 1);
      const current = timerRef.current;
      if (current.runningSince === null) return;
      if (document.visibilityState === 'hidden') {
        pauseWhileHidden();
        return;
      }
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

  const onStart = () => {
    const now = Date.now();
    setLogged('');
    recordSittingEvent({ at: now, kind: 'study', lesson: lessonId });
    persist(startTimer(timer, now, lessonId));
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
      // The compact row is the phone strip's clock: the same store, the same two buttons, without
      // the Today line and the status sentence that a 360 px strip cannot afford.
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
          onClick={onStart}
          disabled={running}
          data-testid="btn-study-timer"
          data-timer-action={running ? 'counting' : elapsed > 0 ? 'resume' : 'start'}
          title={
            running
              ? 'The clock is running. Log & reset files this stretch and starts again from zero.'
              : 'Start counting this session as study time, or resume where the clock paused'
          }
          className={BUTTON}
        >
          <Play className="h-3 w-3" aria-hidden="true" />
          {running ? 'Counting' : elapsed > 0 ? 'Resume' : 'Start'}
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
              ? 'Counting while this tab is open'
              : elapsed > 0
                ? 'Paused — Resume keeps counting'
                : 'Press Start to time this session'}
        </span>
      )}
    </div>
  );
};
