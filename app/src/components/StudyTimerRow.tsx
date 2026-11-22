import React, { useEffect, useId, useRef, useState } from 'react';
import { ChevronDown, Pause, Play, Timer, TimerReset, Trash2 } from 'lucide-react';
import {
  clearedTimer,
  elapsedMs,
  formatClock,
  formatTimeOfDay,
  heartbeat,
  newerClock,
  pauseTimer,
  clearedClockLog,
  readTimer,
  TIMER_STORAGE_KEY,
  resumeTimer,
  startTimer,
  STUDY_CLOCK_EVENT,
  writeTimer,
  type ClockAction,
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
 *
 * The clock also writes its session down. Every press adds a line under the digits: the time of day,
 * what the digits read at that moment, and — for a pause — how long the stretch it ended had run.
 * The log's first line states the session's own time, so the card answers "when did this start, when
 * did it pause, when did it carry on" and not only "how much is on the clock". Log & reset starts a
 * new session, which is why the log empties with it.
 */
const HEARTBEAT_MS = 60_000;

/** How the three presses are named in the log. */
const PRESS_LABEL: Record<ClockAction, string> = {
  start: 'Started',
  pause: 'Paused',
  resume: 'Resumed',
  complete: 'Lesson completed',
};


const BUTTON =
  'inline-flex items-center gap-1 rounded border border-line bg-raise px-2.5 py-1 text-[12px] font-mono font-semibold text-ink cursor-pointer hover:bg-elevate disabled:opacity-50 disabled:cursor-not-allowed';

const LINK_BUTTON =
  'inline-flex items-center gap-1 font-mono text-[12px] text-accent underline decoration-dotted cursor-pointer';

export const StudyTimerRow: React.FC<{
  lessonId: string;
  compact?: boolean;
  /** The lesson's own name, so the digits say which lesson is being counted. */
  label?: string;
  /** Whether this lesson is verified — the clock row can then say the lesson it counted was finished. */
  verified?: boolean;
  /** Whether the lesson is marked done by the learner rather than passed; shown when not verified. */
  selfMarked?: boolean;
}> = ({ lessonId, compact = false, label, verified = false, selfMarked = false }) => {
  const [timer, setTimer] = useState<StudyTimer>(() => resumeTimer(readTimer(), Date.now()));
  /** The filed stretch's own duration, so Log & reset can say what it just kept. */
  const [logged, setLogged] = useState('');
  const [todayMs, setTodayMs] = useState(() => sittingTotals(readSittings()).todayMs);
  const [lesson, setLesson] = useState(() => lessonTotals(readSittings(), lessonId));
  const [logOpen, setLogOpen] = useState(false);
  /** The session log's own fold. The session total and its controls stay in sight. */
  const [logFolded, setLogFolded] = useState(false);
  // Two rows can be mounted at once (the phone strip's compact clock and the brief's full one);
  // the panel ids have to name this row's panels, not whichever rendered first.
  const logPanelId = useId();
  const logListId = useId();
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

  // The lesson's reminder starts the same clock, so this row follows a write it did not make.
  // A completion is written by a passing run rather than by this row, and it is the one write the
  // learner should not have to go looking for: the log opens itself so the `Lesson completed` line
  // and the stopped clock are in front of them the moment the pass lands.
  useEffect(() => {
    const refresh = () => {
      const stored = resumeTimer(readTimer(), Date.now());
      if (stored.log[stored.log.length - 1]?.action === 'complete') setLogOpen(true);
      setTimer(stored);
    };
    window.addEventListener(STUDY_CLOCK_EVENT, refresh);
    return () => window.removeEventListener(STUDY_CLOCK_EVENT, refresh);
  }, []);

  // Another tab writes the same record, and `STUDY_CLOCK_EVENT` does not cross documents. Without
  // this, a second tab that held the running stretch never learned about a Log & reset: its next
  // press — or its next heartbeat, a minute later — wrote the old time over the cleared record, and
  // the learner's refresh brought it back. A storage event is the browser telling this document the
  // record moved; adopt it, then announce it so the app's upload sees the newer clock too.
  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key !== null && event.key !== TIMER_STORAGE_KEY) return;
      const stored = resumeTimer(readTimer(), Date.now());
      setTimer(stored);
      try {
        window.dispatchEvent(new Event(STUDY_CLOCK_EVENT));
      } catch {
        // The announcement is a nicety; adopting the record is the point.
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
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
      // A heartbeat is a write, so it has to be the newest fact: if the store moved on while this
      // tab was busy (another tab cleared the clock, or paused it), adopt that instead of writing
      // the stretch this tab still remembers over it.
      const chosen = newerClock(current, readTimer());
      if (chosen !== current) {
        setTimer(resumeTimer(chosen, now));
        window.dispatchEvent(new Event(STUDY_CLOCK_EVENT));
        return;
      }
      if (now - current.lastTick < HEARTBEAT_MS) return;
      recordSittingEvent({ at: now, kind: 'study', lesson: lessonId });
      persist(heartbeat(current, now));
      // The minute heartbeat is a write to the clock, so it is a change to sync: announcing it is what
      // carries a running clock to the other device without anyone pressing anything.
      window.dispatchEvent(new Event(STUDY_CLOCK_EVENT));
    }, 1000);
    return () => window.clearInterval(id);
    // `runningSince` is the whole switch: a paused clock needs no interval at all.
  }, [timer.runningSince, lessonId]);

  const elapsed = elapsedMs(timer, Date.now());
  const running = timer.runningSince !== null;
  const state = running ? 'running' : elapsed > 0 ? 'paused' : 'idle';
  // The last thing the session recorded being the lesson's completion is what the row says in its
  // status line: the digits are stopped, and the reason is the pass, not a stray pause.
  const lastAction = timer.log[timer.log.length - 1]?.action ?? null;
  // Finished here, whether or not the pass that finished it was on this visit: the clock's own
  // record of completions is what survives Log & reset and a reload.
  const completed = Array.isArray(timer.completed) ? timer.completed : [];
  const clockComplete = completed.includes(lessonId);
  const complete = verified || clockComplete;
  const today = formatDuration(todayMs);

  /** The record this press acts on: this row's, unless the store has moved on to a newer one. */
  const currentRecord = () => {
    const stored = readTimer();
    const chosen = newerClock(timer, stored);
    if (chosen !== timer) setTimer(resumeTimer(chosen, Date.now()));
    return chosen;
  };

  const onToggle = () => {
    const now = Date.now();
    const base = currentRecord();
    setLogged('');
    recordSittingEvent({ at: now, kind: 'study', lesson: lessonId });
    // One control for both directions: the press means what its label says. A resume after a pause
    // is its own press in the log, not a second start.
    const at = elapsedMs(base, now);
    persist(
      base.runningSince !== null
        ? pauseTimer(base, now)
        : startTimer(base, now, lessonId, at > 0 ? 'resume' : 'start')
    );
  };

  /** Empty the presses and keep the digits: clearing a log is not a reset. */
  const onClearLog = () => {
    const base = currentRecord();
    persist(clearedClockLog(base, Date.now()));
    // The reminder and the phone strip hold the same record; without the announcement they would
    // keep the log they read at mount and write it back on their next press.
    try {
      window.dispatchEvent(new Event(STUDY_CLOCK_EVENT));
    } catch {
      // A blocked window costs the announcement, not the clear.
    }
  };

  const onReset = () => {
    const at = Date.now();
    const base = currentRecord();
    const total = elapsedMs(base, at);
    if (total <= 0) return;
    recordSittingEvent({ at, kind: 'study', lesson: lessonId });
    setLogged(formatDuration(total));
    // The digits and the presses are the session's; the lessons this clock has seen finished are
    // not, so Log & reset carries them across instead of unlearning them. The press's own time is
    // written into the record, so a stale copy of the old clock cannot win the next merge and put
    // the logged time back after a refresh.
    persist(clearedTimer(lessonId, base.completed, at));
    // The reminder at the top of the lesson and the phone strip's compact clock are two more views
    // of this one store. Without the announcement they keep the timer they read at mount — and a
    // running one among them would heartbeat the old record back a minute later.
    try {
      window.dispatchEvent(new Event(STUDY_CLOCK_EVENT));
    } catch {
      // A blocked window costs the announcement, not the reset.
    }
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
        {label && (
          <span
            data-testid="study-timer-lesson"
            title={`Counting study time on ${label}`}
            className="max-w-[22ch] truncate normal-case tracking-normal text-[11.5px] font-normal text-muted"
          >
            · {label}
          </span>
        )}
      </span>
      {label && (
        // What became of the lesson the digits are counting: a clock that reads 12 minutes next to
        // "complete" says the learner finished; next to nothing it says they are still working.
        <span
          data-testid="study-timer-lesson-state"
          data-state={complete ? 'verified' : selfMarked ? 'self-marked' : 'open'}
          title={
            verified
              ? `${label} is verified: a run passed it`
              : clockComplete
                ? `${label} was completed — this study clock remembers it across visits`
                : selfMarked
                ? `${label} is marked done by you, without help`
                : `${label} is not finished yet`
          }
          className={
            complete
              ? 'rounded border border-accent/40 bg-accent/10 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-accent'
              : selfMarked
                ? 'rounded border border-line bg-canvas px-1.5 py-0.5 font-mono text-[11px] text-body'
                : 'rounded border border-line-soft bg-canvas px-1.5 py-0.5 font-mono text-[11px] text-faint'
          }
        >
          {complete ? '✓ complete' : selfMarked ? 'self-done' : 'in progress'}
        </span>
      )}
      <span
        data-testid="study-timer-elapsed"
        title={`${formatDuration(elapsed)} counted this session`}
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
              ? 'Counting this lesson'
              : lastAction === 'complete' && elapsed > 0
                ? `Lesson completed — clock stopped at ${formatClock(elapsed)}`
                : elapsed > 0
                  ? 'Paused — press Resume'
                  : clockComplete
                    ? 'Lesson completed — press Start for more time'
                    : 'Press Start'}
        </span>
      )}
      {!compact && timer.log.length > 0 && (
        <div
          data-testid="study-clock-log"
          className="w-full overflow-hidden rounded-xl border border-line bg-canvas shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
        >
          {/* The session's own line: a small label, the total, and how many presses are under it. */}
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 border-b border-line bg-raise/60 px-3 py-1.5">
            <span className="flex items-center gap-1 font-mono text-[9.5px] uppercase tracking-[0.14em] text-faint">
              <span
                className={`inline-block h-1.5 w-1.5 rounded-full bg-accent ${running ? 'animate-pulse' : ''}`}
                aria-hidden="true"
              />
              Session
            </span>
            <span
              data-testid="study-clock-session"
              className="font-mono text-[15px] font-semibold leading-none tabular-nums text-ink"
            >
              {formatClock(elapsed)}
            </span>
            {/* The two things a learner wants from a session log: less of it on screen, or gone.
                Both stay in the header, so a folded log still shows its total and its buttons. */}
            <div className="ml-auto flex items-center gap-0.5">
              <button
                type="button"
                data-testid="study-clock-log-toggle"
                aria-expanded={!logFolded}
                aria-controls={logListId}
                aria-label={logFolded ? 'Show the session log' : 'Hide the session log'}
                title={logFolded ? 'Show every press' : 'Fold the presses away; the digits stay'}
                onClick={() => setLogFolded((folded) => !folded)}
                className="flex h-6 w-6 cursor-pointer items-center justify-center rounded border border-transparent text-faint transition-colors hover:border-line-soft hover:bg-canvas hover:text-body"
              >
                <ChevronDown
                  className={`h-3.5 w-3.5 transition-transform ${logFolded ? '' : 'rotate-180'}`}
                  aria-hidden="true"
                />
              </button>
              <button
                type="button"
                data-testid="study-clock-log-clear"
                aria-label="Clear the session log"
                title="Clear the session log — the digits keep counting"
                onClick={onClearLog}
                className="flex h-6 w-6 cursor-pointer items-center justify-center rounded border border-transparent text-faint transition-colors hover:border-line-soft hover:bg-canvas hover:text-rose"
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </div>
          </div>
          {/* One line per press, in the clock's own monospace: the time of day, what was pressed,
              the digits at that moment, and the stretch a pause closed. The dot and the coloured
              word carry the action, so a paused session reads down the left edge at a glance. */}
          <ol id={logListId} hidden={logFolded} className="px-3 py-1.5">
            {timer.log.map((press, index) => (
              <li
                key={`${press.at}-${index}`}
                data-testid="study-clock-entry"
                className="truncate font-mono text-[11px] leading-[1.65] text-muted"
              >
                <span
                  className={`mr-1.5 inline-block h-1.5 w-1.5 rounded-full align-middle ${
                    press.action === 'pause' ? 'bg-line' : 'bg-accent'
                  }`}
                  aria-hidden="true"
                />
                <span className="tabular-nums text-faint">{formatTimeOfDay(press.at)}</span>{' '}
                <span
                  className={`font-semibold ${
                    press.action === 'pause' ? 'text-muted' : 'text-accent'
                  }`}
                >
                  {PRESS_LABEL[press.action]}
                </span>
                {' · study clock '}
                <span className="tabular-nums text-ink">{formatClock(press.clockMs)}</span>
                {press.stretchMs === null ? '' : ` · stretch ${formatClock(press.stretchMs)}`}
              </li>
            ))}
          </ol>
        </div>
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
            A sitting is one stretch, counted whole for every lesson it touched.
          </p>
          <p className="mt-0.5">Today, all lessons: {todayMs > 0 ? today : 'nothing logged yet'}</p>
          <p className="mt-0.5" data-testid="study-timer-completed">
            Completed on this clock:{' '}
            {completed.length ? completed.join(' · ') : 'nothing yet'}
          </p>
        </div>
      )}
    </div>
  );
};
