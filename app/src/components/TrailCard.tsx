import React, { useEffect, useMemo, useState } from 'react';
import { CalendarClock, CheckCircle2, ChevronDown, ChevronRight, FlaskConical, Lightbulb } from 'lucide-react';
import { readLearningLog } from '../learningLog';
import { formatDuration, readSittings } from '../sittingClock';
import { STORE_RESTORED_EVENT } from '../backupBundle';
import { buildTrail, entryLabel, hasWork, timeLabel, type Trail, type TrailEntry } from '../timeline';
import { readTrail } from '../trailReading';

interface TrailCardProps {
  /** Opens the lesson a row is about, in the runner. Rows stay text when there is no runner. */
  onOpenLesson?: (lessonId: string) => void;
  /** The trail is read as of this moment; a test pins it, the app uses `Date.now()`. */
  now?: number;
}

/** The colour a row's words carry: a pass is green, a miss is rose, help is amber, context is dim. */
function toneFor(entry: TrailEntry): string {
  switch (entry.kind) {
    case 'verified':
      return 'text-emerald';
    case 'run':
      return entry.outcome === 'passed' ? 'text-emerald' : 'text-rose';
    case 'hint':
      return 'text-amber';
    case 'solution':
      return 'text-amber';
    case 'export':
      return 'text-accent';
    default:
      return 'text-dim';
  }
}

function Icon({ entry }: { entry: TrailEntry }) {
  if (entry.kind === 'verified') return <CheckCircle2 className="w-3 h-3 shrink-0" />;
  if (entry.kind === 'run') return <FlaskConical className="w-3 h-3 shrink-0" />;
  if (entry.kind === 'hint' || entry.kind === 'solution') return <Lightbulb className="w-3 h-3 shrink-0" />;
  return null;
}

function plural(count: number, one: string, many = `${one}s`): string {
  return `${count} ${count === 1 ? one : many}`;
}

/** The one line under the heading: how much was worked, how much of it was measured, how much passed. */
export function trailSummary(trail: Trail): string {
  if (!trail.totals.entries) return 'Nothing recorded yet';
  const parts = [plural(trail.totals.days, 'day')];
  if (trail.totals.measuredMs > 0) parts.push(`${formatDuration(trail.totals.measuredMs)} measured`);
  if (trail.totals.runs > 0) parts.push(plural(trail.totals.runs, 'run'));
  if (trail.totals.verified > 0) parts.push(`${trail.totals.verified} verified`);
  if (trail.totals.reviews > 0) parts.push(plural(trail.totals.reviews, 'card review'));
  return parts.join(' · ');
}

/**
 * Where the fold is remembered (`app/src/trailReading.ts` owns the reading, not the preference).
 *
 * A preference, like the layout or the palette, so it is not part of a backup: a learner who folds the
 * trail on a phone wants it folded here too, and a restored archive has no business deciding that.
 */
export const STORAGE_KEY_TRAIL_COLLAPSED = 'mechalab_trail_collapsed_v1';

/** The stored fold, or open. A blocked store reads as open, which is where a first visit starts. */
export function readTrailCollapsed(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY_TRAIL_COLLAPSED) === '1';
  } catch {
    return false;
  }
}

/** One day's own line: its time and work, which is what makes a gap in the trail visible. */
function daySummary(day: Trail['days'][number]): string {
  const parts: string[] = [];
  if (day.measuredMs > 0) parts.push(formatDuration(day.measuredMs));
  if (day.sittings > 1) parts.push(plural(day.sittings, 'sitting'));
  if (day.runs > 0) parts.push(plural(day.runs, 'run'));
  if (day.reviews > 0) parts.push(plural(day.reviews, 'review'));
  return parts.join(' · ');
}

/**
 * The cross-lesson trail (`app/src/components/TrailCard.tsx`).
 *
 * Every other surface answers a question about *one* lesson: the runner's attempts, the resume card,
 * the study panel's notes. None answered "what did I do last Tuesday", which is the question a
 * self-paced course is asked by the person sitting it — and the log has held the answer all along.
 *
 * The card is a reading, not a store: it re-reads the log and the sittings when the roadmap opens and
 * when a restore writes them, and renders nothing when there is nothing to say. A first visit is
 * quiet even though the app opens on the runner and therefore logs one `lesson_open` at load: a trail
 * of opens is not work (`hasWork`), and the Start here block already names the first lesson.
 */
export const TrailCard: React.FC<TrailCardProps> = ({ onOpenLesson, now }) => {
  const [nonce, setNonce] = useState(0);
  // Folded to its summary line, or open. The card is the tallest thing on the roadmap once a few
  // days have been worked, and a returning learner may want the numbers without the transcript.
  const [collapsed, setCollapsed] = useState<boolean>(readTrailCollapsed);
  const toggle = () => {
    const next = !collapsed;
    setCollapsed(next);
    try {
      localStorage.setItem(STORAGE_KEY_TRAIL_COLLAPSED, next ? '1' : '0');
    } catch {
      // A blocked store folds it for this visit only; the reading itself is untouched.
    }
  };
  useEffect(() => {
    const reread = () => setNonce((value) => value + 1);
    window.addEventListener(STORE_RESTORED_EVENT, reread);
    return () => window.removeEventListener(STORE_RESTORED_EVENT, reread);
  }, []);

  // Pinned at mount: the roadmap re-renders on every keystroke in its search box, and "today" does
  // not change under a reader mid-sitting.
  const [readAt] = useState(() => now ?? Date.now());
  const trail = useMemo(
    () => buildTrail(readLearningLog(), readSittings(), { now: readAt }),
    // The stores are read on a tab switch (this mounts) and after a restore writes them.
    [readAt, nonce]
  );
  // The same data, read for what it implies rather than for what happened. Pure, and given the same
  // `now` the days were grouped with, so "three days ago" cannot disagree with the row it points at.
  const readings = useMemo(() => readTrail(trail, { now: readAt }), [trail, readAt]);

  if (!hasWork(trail)) return null;

  return (
    <div
      data-testid="trail-card"
      data-trail-days={trail.days.length}
      data-trail-entries={trail.totals.entries}
      data-trail-measured={trail.totals.measuredMs}
      data-collapsed={collapsed ? 'true' : 'false'}
      className="bg-panel border border-line rounded-xl p-4"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <div className="flex items-center gap-2">
          <CalendarClock className="w-3.5 h-3.5 text-accent" />
          <span className="text-xs font-mono uppercase tracking-wider text-accent">Your trail</span>
        </div>
        <div className="ml-auto flex flex-wrap items-baseline gap-x-3 gap-y-1">
          {/* One day would be said twice while its own line is on screen. Folded, that line is gone,
              so the summary becomes the only place the numbers still are. */}
          {(collapsed || trail.days.length > 1) && (
            <div data-testid="trail-summary" className="text-xs text-muted">
              {trailSummary(trail)}
            </div>
          )}
          <button
            type="button"
            onClick={toggle}
            data-testid="btn-trail-toggle"
            aria-expanded={!collapsed}
            aria-label={collapsed ? 'Show the trail' : 'Hide the trail'}
            title={
              collapsed
                ? 'Unfold the trail: its days, rows and readings'
                : 'Fold the trail to one line, keeping the totals'
            }
            className="shrink-0 cursor-pointer rounded-[var(--r-sm)] border border-line-soft px-2 py-1 inline-flex items-center gap-1 text-[11px] font-mono uppercase tracking-wider text-muted hover:text-ink hover:border-line transition-colors"
          >
            {collapsed ? (
              <ChevronRight className="w-3 h-3" aria-hidden="true" />
            ) : (
              <ChevronDown className="w-3 h-3" aria-hidden="true" />
            )}
            {collapsed ? 'Show' : 'Hide'}
          </button>
        </div>
      </div>

      {!collapsed && (
        <p className="mt-1 text-xs text-muted">
          What you actually did, newest first — the log the runner writes, across every lesson. Time is
          measured in sittings, and filed on the day a sitting started.
        </p>
      )}

      {!collapsed && readings.length > 0 && (
        <div
          data-testid="trail-readings"
          data-reading-count={readings.length}
          className="mt-3 rounded-[var(--r-sm)] border border-line-soft px-3 py-2"
        >
          <div className="text-[11px] font-mono uppercase tracking-wider text-accent">What this says</div>
          <ul className="mt-1 space-y-1">
            {readings.map((reading) => (
              <li
                key={reading.kind}
                data-testid="trail-reading"
                data-reading={reading.kind}
                data-lesson={reading.lesson ?? ''}
                className="text-xs text-muted"
              >
                {reading.text}
                {reading.lesson && onOpenLesson && (
                  <button
                    onClick={() => reading.lesson && onOpenLesson(reading.lesson)}
                    className="ml-1.5 font-mono text-[11px] text-accent hover:underline cursor-pointer"
                    title={`Open ${reading.lesson}`}
                  >
                    open
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {!collapsed && (
        <div className="mt-3 space-y-3">
          {trail.days.map((day) => (
            <div key={day.day} data-testid="trail-day" data-day={day.day} data-day-label={day.label}>
              <div className="flex flex-wrap items-baseline justify-between gap-x-2 border-b border-line-soft pb-1">
                <span className="text-xs font-semibold text-ink">{day.label}</span>
                <span data-testid="trail-day-summary" className="text-[11px] font-mono text-dim">
                  {daySummary(day)}
                </span>
              </div>
              <ul className="mt-1 space-y-0.5">
                {day.entries.map((entry) => (
                  <li
                    key={`${entry.at}-${entry.kind}-${entry.lesson ?? ''}`}
                    data-testid="trail-entry"
                    data-kind={entry.kind}
                    data-lesson={entry.lesson ?? ''}
                    className="flex items-baseline gap-2 text-xs py-0.5"
                  >
                    <span className="font-mono text-dim tabular-nums shrink-0">{timeLabel(entry.at)}</span>
                    {entry.lesson && onOpenLesson ? (
                      <button
                        onClick={() => entry.lesson && onOpenLesson(entry.lesson)}
                        className="font-mono font-semibold text-ink hover:text-accent cursor-pointer shrink-0 w-16 text-left"
                        title={`Open ${entry.lesson}`}
                      >
                        {entry.lesson}
                      </button>
                    ) : (
                      <span className="font-mono font-semibold text-ink shrink-0 w-16">
                        {entry.lesson ?? 'log'}
                      </span>
                    )}
                    <span className={`inline-flex items-center gap-1 shrink-0 ${toneFor(entry)}`}>
                      <Icon entry={entry} />
                      {entryLabel(entry)}
                    </span>
                    {entry.fail && (
                      <span className="font-mono text-[11px] text-dim truncate" title={entry.fail}>
                        {entry.fail}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
              {day.omitted > 0 && (
                <div className="mt-0.5 text-[11px] text-dim">
                  …and {plural(day.omitted, 'more entry', 'more entries')} this day
                </div>
              )}
            </div>
          ))}
        </div>

      )}

      {!collapsed && trail.omitted.days > 0 && (
        <div data-testid="trail-omitted-days" className="mt-2 text-[11px] text-dim">
          {plural(trail.omitted.days, 'older day')} not shown. The whole log is in the export.
        </div>
      )}
    </div>
  );
};
