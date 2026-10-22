import React from 'react';
import { CornerDownRight, ListChecks, TriangleAlert } from 'lucide-react';
import { ERROR_INDEX, EXPLAINER_CITATION, entryHeadline, type ErrorIndexEntry } from '../errorIndex';
import type { ParsedFailure } from '../traceback';

/**
 * A failed run, read: the line that raised, and the explainer entry that answers it.
 *
 * The panel used to print Python's traceback and stop there. Two things were missing from that: *which
 * line is mine* — the traceback mixes the learner's frames with the lesson's appended self-check — and
 * *which of the fifteen failures is this*, which lives in `docs/ERROR_EXPLAINER.md` and was reachable
 * only by leaving the tab.
 *
 * The card is deliberately not a solution: it shows the exception, the frame, and the page's own
 * "check first" list, and it never opens a hint. The ladder keeps its own pacing (`checkHints.ts`),
 * and a learned habit is not something to hand over at the first red line.
 *
 * It also refuses to guess. A failure the index has no entry for says so and leaves Python's own words
 * as the diagnosis; a failure raised inside the lesson's check says that the line is the check's, not
 * the learner's, instead of offering a button that would move their cursor somewhere they cannot edit.
 */
export interface TracebackCardProps {
  failure: ParsedFailure;
  /** The explainer entry that matches, or null when the page has nothing for this failure. */
  entry: ErrorIndexEntry | null;
  /** Put the cursor on a line of the learner's own file. */
  onRevealLine: (line: number) => void;
}

export const TracebackCard: React.FC<TracebackCardProps> = ({ failure, entry, onRevealLine }) => {
  const frame = failure.frame;
  return (
    <div
      data-testid="traceback-card"
      aria-live="polite"
      className="mt-2.5 rounded-lg border p-3"
      style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg)' }}
    >
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 font-mono text-xs">
        <TriangleAlert className="h-3.5 w-3.5 shrink-0" style={{ color: 'var(--rose)' }} aria-hidden="true" />
        <code data-testid="traceback-exception" className="break-words" style={{ color: 'var(--rose)' }}>
          {failure.summary}
        </code>
        {frame && (
          <>
            <span aria-hidden="true" style={{ color: 'var(--faint)' }}>·</span>
            <span data-testid="traceback-frame" style={{ color: 'var(--text)' }}>
              line {frame.line}
              {frame.name && frame.name !== '<module>' ? ` · in ${frame.name}` : ''}
            </span>
          </>
        )}
      </div>

      {frame?.source && (
        <code
          data-testid="traceback-source"
          className="mt-1 block break-words rounded px-2 py-1 font-mono text-[11.5px]"
          style={{ backgroundColor: 'var(--panel)', color: 'var(--muted)' }}
        >
          {frame.source}
        </code>
      )}

      {failure.raisedByCheck ? (
        <p data-testid="traceback-raised-by-check" className="mt-1.5 text-[11px]" style={{ color: 'var(--muted)' }}>
          Raised inside the lesson&apos;s own check, not in your code: the assertion is the diagnosis.
          The function it called is where to look.
        </p>
      ) : (
        frame && (
          <button
            type="button"
            data-testid="btn-reveal-error-line"
            onClick={() => onRevealLine(frame.line)}
            className="mt-1.5 inline-flex cursor-pointer items-center gap-1 rounded border px-2 py-0.5 font-mono text-[11px]"
            style={{ borderColor: 'var(--border)', color: 'var(--accent)' }}
          >
            <CornerDownRight className="h-3 w-3" aria-hidden="true" />
            Show line {frame.line}
          </button>
        )
      )}

      {entry ? (
        <div className="mt-2 border-t pt-2" style={{ borderColor: 'var(--border)' }}>
          <p data-testid="error-index-entry" className="text-xs font-semibold" style={{ color: 'var(--amber)' }}>
            {entryHeadline(entry)}
          </p>
          <p data-testid="error-index-means" className="mt-1 text-[11.5px]" style={{ color: 'var(--text)' }}>
            {entry.means}
          </p>
          <p className="mt-1.5 flex items-center gap-1 text-[11px] font-mono" style={{ color: 'var(--muted)' }}>
            <ListChecks className="h-3 w-3" aria-hidden="true" /> Check first
          </p>
          <ul className="mt-0.5 space-y-0.5">
            {entry.checks.map((check) => (
              <li
                key={check}
                data-testid="error-index-check"
                className="flex items-start gap-1.5 text-[11.5px]"
                style={{ color: 'var(--text)' }}
              >
                <span aria-hidden="true" style={{ color: 'var(--accent)' }}>•</span>
                <span className="break-words">{check}</span>
              </li>
            ))}
          </ul>
          <p data-testid="error-index-source" className="mt-1.5 text-[10.5px] font-mono" style={{ color: 'var(--faint)' }}>
            Taught in {entry.source.label} ({entry.source.path}) · index entry {entry.number} of 15 in{' '}
            {EXPLAINER_CITATION}
          </p>
        </div>
      ) : (
        <p data-testid="error-index-missing" className="mt-2 text-[11.5px]" style={{ color: 'var(--muted)' }}>
          Not one of the {ERROR_INDEX.length} failures in {EXPLAINER_CITATION}: Python&apos;s own words
          above are the diagnosis. The line named is the one that raised.
        </p>
      )}
    </div>
  );
};
