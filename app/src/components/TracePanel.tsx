import React from 'react';
import { ChevronLeft, ChevronRight, CornerUpLeft } from 'lucide-react';
import {
  moveStep,
  sourceLine,
  stepLabel,
  traceSummary,
  type TraceSnapshot,
} from '../runTrace';

/**
 * The run trace: every line the last run executed, walked back one step at a time.
 *
 * The plan's debugger row is the reason this exists (`docs/PLAN-2.0-GAP.md`): *"why did this loop do
 * that?"* is the question a beginner actually asks, and it is answerable after the fact from what the
 * worker recorded. What this is **not** is a live debugger — nothing is paused, no breakpoint is set,
 * and the panel says so once rather than letting a learner discover it — because Pyodide runs the
 * program inside one call and the page's only lever is the interrupt word.
 *
 * Three constraints, each of them the honest half of a shortcut:
 *
 * - **The code line is quoted from the text that ran**, not coloured inside the editor. A decoration
 *   would be wrong the moment the learner edits, and this panel describes a run, not a document; the
 *   **Show line** button moves the caret for the learner who wants to work there.
 * - **The frame's own values are shown, and only six of them.** A step is one line with what it could
 *   see; a full frame dump would be a wall a beginner cannot read, and the worker already cut the
 *   reprs to a width (`runTrace.ts`).
 * - **The cap is printed when it was hit.** `300 of 12,431 steps · capped` is a different sentence
 *   from `300 steps`, and a panel that showed the second while meaning the first would be lying about
 *   the program's shape.
 */
export const TracePanel: React.FC<{
  trace: TraceSnapshot | null;
  /** The step on screen, 0-based into `trace.steps`. */
  step: number;
  onStep: (index: number) => void;
  /** The program text the trace was recorded from: the line is quoted from it, never from the editor. */
  source: string;
  onReveal?: (line: number) => void;
  className?: string;
}> = ({ trace, step, onStep, source, onReveal, className }) => {
  if (!trace || trace.steps.length === 0) return null;
  const at = trace.steps[Math.max(0, Math.min(step, trace.steps.length - 1))];
  const code = sourceLine(source, at.line);
  const first = step <= 0;
  const last = step >= trace.steps.length - 1;

  return (
    <section
      data-testid="trace-panel"
      data-trace-steps={trace.steps.length}
      data-trace-total={trace.total}
      aria-label="Run trace"
      className={`bg-panel border border-line rounded-xl p-4 ${className ?? ''}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
        <span className="text-xs font-mono text-muted">TRACE · what your last run executed</span>
        <span data-testid="trace-summary" className="text-[11px] font-mono text-faint tabular-nums">
          {traceSummary(trace)}
        </span>
      </div>

      <p className="text-[11.5px] mb-3" style={{ color: 'var(--muted)' }}>
        A recording, replayed — nothing is paused. Step through it to see what each line held when it
        ran; the values are that run&apos;s, so an edit since then is a different program.
      </p>

      <div className="flex flex-wrap items-center gap-2 mb-2">
        <button
          onClick={() => onStep(moveStep(trace, step, -1))}
          disabled={first}
          data-testid="trace-prev"
          aria-label="Previous step"
          title="Previous step (←)"
          className="px-2 py-1 rounded-lg text-xs font-mono bg-canvas hover:bg-raise text-body border border-line flex items-center gap-1 cursor-pointer disabled:opacity-40 disabled:cursor-default"
        >
          <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
        <input
          type="range"
          min={0}
          max={trace.steps.length - 1}
          step={1}
          value={Math.max(0, Math.min(step, trace.steps.length - 1))}
          onChange={(event) => onStep(Number(event.target.value))}
          data-testid="trace-range"
          aria-label="Trace step"
          aria-valuetext={stepLabel(trace, step)}
          className="min-w-[8rem] flex-1 accent-[var(--accent)]"
        />
        <button
          onClick={() => onStep(moveStep(trace, step, 1))}
          disabled={last}
          data-testid="trace-next"
          aria-label="Next step"
          title="Next step (→)"
          className="px-2 py-1 rounded-lg text-xs font-mono bg-canvas hover:bg-raise text-body border border-line flex items-center gap-1 cursor-pointer disabled:opacity-40 disabled:cursor-default"
        >
          <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
        <span
          data-testid="trace-step-label"
          className="text-[11px] font-mono tabular-nums"
          style={{ color: 'var(--body)' }}
        >
          {stepLabel(trace, step)}
        </span>
        {onReveal && (
          <button
            onClick={() => onReveal(at.line)}
            data-testid="trace-show-line"
            title={`Put the cursor on line ${at.line}`}
            className="ml-auto px-2 py-1 rounded-lg text-[11px] font-mono bg-canvas hover:bg-raise text-body border border-line flex items-center gap-1 cursor-pointer"
          >
            <CornerUpLeft className="h-3 w-3" aria-hidden="true" />
            Show line
          </button>
        )}
      </div>

      <pre
        data-testid="trace-code"
        className="mb-2 overflow-x-auto rounded-lg px-3 py-2 text-[12px] font-mono"
        style={{ backgroundColor: 'var(--bg)', color: 'var(--text)', border: '1px solid var(--border-soft)' }}
      >
        {code || ' '}
      </pre>

      {at.values.length > 0 ? (
        <dl
          data-testid="trace-values"
          className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-1 text-[11.5px] font-mono"
        >
          {at.values.map((entry) => (
            <div key={entry.name} className="flex min-w-0 gap-1.5">
              <dt className="shrink-0" style={{ color: 'var(--accent)' }}>
                {entry.name}
              </dt>
              <dd className="truncate" style={{ color: 'var(--body)' }}>
                {entry.value}
              </dd>
            </div>
          ))}
        </dl>
      ) : (
        <p data-testid="trace-empty-values" className="text-[11.5px] font-mono" style={{ color: 'var(--faint)' }}>
          nothing in this line&apos;s frame yet
        </p>
      )}
    </section>
  );
};
