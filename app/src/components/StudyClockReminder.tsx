import React, { useEffect, useState } from 'react';
import { Play, Timer } from 'lucide-react';
import {
  STUDY_CLOCK_EVENT,
  elapsedMs,
  formatClock,
  readTimer,
  resumeTimer,
  startClockFromReminder,
} from '../studyTimer';

/**
 * The reminder at the top of a lesson (`components/StudyClockReminder.tsx`).
 *
 * The clock row sits beside the brief, where a learner meets it after they have already started
 * reading. This says the one thing the row cannot say from below: start it now, so the hour counts.
 * It is the same store and the same press — `startClockFromReminder` writes the record the row's own
 * Start button writes and announces it — so the reminder disappears the moment the clock is running
 * and never becomes a second clock.
 */
export const StudyClockReminder: React.FC<{ lessonId: string }> = ({ lessonId }) => {
  const [timer, setTimer] = useState(() => resumeTimer(readTimer(), Date.now()));

  useEffect(() => {
    const refresh = () => setTimer(resumeTimer(readTimer(), Date.now()));
    window.addEventListener(STUDY_CLOCK_EVENT, refresh);
    return () => window.removeEventListener(STUDY_CLOCK_EVENT, refresh);
  }, []);

  const elapsed = elapsedMs(timer, Date.now());
  if (timer.runningSince !== null) return null;

  return (
    <div
      data-testid="study-clock-reminder"
      className="mt-2.5 flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2"
      style={{ borderColor: 'var(--amber)', backgroundColor: 'var(--panel)' }}
    >
      <Timer className="h-4 w-4 shrink-0" style={{ color: 'var(--amber)' }} aria-hidden="true" />
      <p className="min-w-0 flex-1 text-[12px] leading-snug text-body">
        <strong className="text-ink">Start the study clock before you read.</strong>{' '}
        {elapsed > 0
          ? `It is paused at ${formatClock(elapsed)} — Resume keeps that time.`
          : 'What you log lands in Today and the trail, so the hours you study are the hours the site reports.'}
      </p>
      <button
        type="button"
        data-testid="btn-start-study-clock"
        onClick={() => setTimer(startClockFromReminder(lessonId, Date.now()))}
        className="btn btn-primary px-2.5 py-1 text-[12px] font-bold"
      >
        <Play className="h-3 w-3 fill-current" aria-hidden="true" />
        {elapsed > 0 ? 'Resume clock' : 'Start clock'}
      </button>
    </div>
  );
};
