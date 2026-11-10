import type { LessonFile } from '../../../lessonFiles';
import { sourceForPark } from './parkSource';

/**
 * The line the interpreter is parked on, as the worker reports it.
 *
 * The values are the frame's own, formatted in the worker (`_trace_values`) exactly as the recorded
 * trace's are, so a paused line and the replay read the same way.
 */
export interface PausedStep {
  line: number;
  fn: string;
  depth: number;
  values: { name: string; value: string }[];
  /** Why the interpreter parked: a gutter breakpoint, a Step, or the Pause button. */
  reason?: 'breakpoint' | 'step' | 'pause';
  /** A frame edit that was refused, in the interpreter's own words; absent when it landed. */
  edit_error?: string;
  /**
   * The file the parked line is in: `<lesson_editor>` for the learner's own document, a helper tab's
   * name, or the plant's filename. Absent from an older worker, which only ever parked in one file.
   */
  file?: string;
  /**
   * Why a conditional breakpoint would not evaluate, in the interpreter's own words.
   *
   * A condition is the learner's expression, and one that raises is a mistake in it — not a reason to
   * skip the park or to end the run. The bar says what the interpreter said, on the line it stopped
   * on, so the fix is one look away.
   */
  condition_error?: string;
  /**
   * The expressions the learner pinned, answered in this frame (`app/src/editor/watches.ts`).
   *
   * Absent when nothing is pinned. Each entry is the expression the learner wrote and either the
   * value the interpreter gave it here or the sentence it raised: a watch that cannot be evaluated in
   * this frame is a question this frame cannot answer, not a reason to end the run.
   */
  watches?: { expression: string; value?: string; error?: string }[];
  /** A watch that could not be pinned (a full bar), in the interpreter's own words. */
  watch_error?: string;
}

interface PausedBarProps {
  step: PausedStep;
  /** The text that ran, so an edit made while parked cannot rewrite the quoted line. */
  runSource: string;
  helperFiles: readonly LessonFile[];
  pauseCapable: boolean;
  onAnswer: (mode: 2 | 3 | 4 | 6 | 7) => void;
  watchDraft: string;
  onWatchDraft: (value: string) => void;
  onSubmitWatch: () => void;
  watchError: string;
  onRemoveWatch: (expression: string) => void;
  frameEdit: { name: string; expression: string } | null;
  onFrameEdit: (edit: { name: string; expression: string } | null) => void;
  frameEditError: string;
  onApplyFrameEdit: () => void;
}

/**
 * Where the interpreter is, while it is there. A parked run is not a slow one, so it says what it is
 * doing rather than leaving a spinner: the line it is about to run, quoted from the text that ran, and
 * the frame's own values. Step and Continue are the two answers the worker is waiting for; Stop stays
 * where it always is, in the toolbar.
 */
export function PausedBar({
  step,
  runSource,
  helperFiles,
  pauseCapable,
  onAnswer,
  watchDraft,
  onWatchDraft,
  onSubmitWatch,
  watchError,
  onRemoveWatch,
  frameEdit,
  onFrameEdit,
  frameEditError,
  onApplyFrameEdit,
}: PausedBarProps) {
  return (
    <div
      data-testid="paused-bar"
      data-paused-reason={step.reason ?? 'pause'}
      className="rounded-lg border p-3"
      style={{ borderColor: 'var(--accent)', backgroundColor: 'var(--panel)' }}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-[11px] font-mono uppercase tracking-[0.14em] text-accent">
          {/* Why the interpreter stopped is the first word, because a park the learner placed and
              one they asked for answer different questions. */}
          {step.reason === 'breakpoint' ? 'Breakpoint' : 'Paused'} ·{' '}
          {step.fn === '<module>' ? 'top level' : `${step.fn}()`} · line {step.line}
          {/* A step can land in a file of its own: naming it is what makes the quoted line below a
              statement about this program rather than the lesson's. */}
          {step.file && step.file !== '<lesson_editor>' && (
            <>
              {' · '}
              <span data-testid="paused-file" className="normal-case tracking-normal text-muted">
                {step.file}
              </span>
            </>
          )}
        </span>
        <span className="flex items-center gap-1.5">
          <button
            onClick={() => onAnswer(6)}
            data-testid="btn-step-in"
            title="Step into the call this line is about to make: stop at its first line, in your file or a helper"
            className="px-2.5 py-1 rounded-lg text-xs font-mono bg-canvas hover:bg-raise text-body border border-line cursor-pointer"
          >
            Step in
          </button>
          <button
            onClick={() => onAnswer(3)}
            data-testid="btn-step"
            title="Run this line and stop at the next one of this file (the frame's values come with it)"
            className="px-2.5 py-1 rounded-lg text-xs font-mono bg-canvas hover:bg-raise text-body border border-line cursor-pointer"
          >
            Step
          </button>
          <button
            onClick={() => onAnswer(7)}
            data-testid="btn-step-out"
            title="Run the rest of this function and stop in its caller (at top level it runs to the end)"
            className="px-2.5 py-1 rounded-lg text-xs font-mono bg-canvas hover:bg-raise text-body border border-line cursor-pointer"
          >
            Step out
          </button>
          <button
            onClick={() => onAnswer(2)}
            data-testid="btn-continue"
            title="Run on to the end, the next breakpoint, or until you pause again"
            className="px-2.5 py-1 rounded-lg text-xs font-mono bg-canvas hover:bg-raise text-body border border-line cursor-pointer"
          >
            Continue
          </button>
        </span>
      </div>
      {/* The controls in the words a beginner would use: the titles are the short version, this is
          the one that explains what each press does to the program. */}
      <p data-testid="paused-help" className="mt-1.5 text-[11px] leading-snug text-muted">
        <strong className="text-body">Debugger:</strong> <em>Step</em> runs this line and stops at the
        next one in this file. <em>Step in</em> follows the call on this line into the function it
        calls. <em>Step out</em> finishes the current function and stops in its caller. Continue runs
        to the end, the next breakpoint, or the next Pause. Stop, in the toolbar, ends the run.
      </p>
      {/* Quoted from the text that ran, not from the editor: a park describes a program, and an edit
          made while it is parked must not rewrite what it is about to execute. A helper's line is
          quoted from that helper, which is why the payload names a file. */}
      <code
        data-testid="paused-line"
        className="mt-2 block whitespace-pre overflow-x-auto font-mono text-[11.5px] text-body"
      >
        {sourceForPark(step.file, runSource, helperFiles).split('\n')[step.line - 1]?.trim() ?? ''}
      </code>
      {/* A condition that raised is a mistake in the condition, not a reason to skip the park or end
          the run: the interpreter's sentence is shown where the breakpoint is. */}
      {step.condition_error && (
        <p
          data-testid="condition-error"
          role="status"
          className="mt-1.5 font-mono text-[11px]"
          style={{ color: 'var(--rose)' }}
        >
          {step.condition_error} — the run stopped here because the condition could not be evaluated.
          Fix it in Breakpoints.
        </p>
      )}
      {step.values?.length > 0 && (
        <div
          data-testid="paused-values"
          className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 font-mono text-[11px] text-muted"
        >
          {/* Each name is a button: a value you can read but not try is half a debugger. */}
          {step.values.map((value) => (
            <button
              key={value.name}
              type="button"
              data-testid={`paused-value-${value.name}`}
              onClick={() => onFrameEdit({ name: value.name, expression: value.value })}
              title={`Change ${value.name} for this run — your code is untouched`}
              className="cursor-pointer border-0 bg-transparent p-0 text-left font-mono text-[11px] text-muted underline decoration-dotted underline-offset-2 hover:text-body"
            >
              <span className="text-accent">{value.name}</span> = {value.value}
            </button>
          ))}
        </div>
      )}
      {/* What the learner pinned: one question asked again at every park, so the same name is
          answered wherever the run stops rather than only in a frame it happens to be a local of. A
          watch that raises says so in place - this frame cannot answer it - and the run stays exactly
          where it is. */}
      <div className="mt-1.5 space-y-1">
        {(step.watches ?? []).length > 0 && (
          <div
            data-testid="paused-watches"
            className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[11px] text-muted"
          >
            {step.watches?.map((watch, index) => (
              <span
                key={`watch-${index}`}
                data-testid={`paused-watch-${index}`}
                className="inline-flex items-center gap-1"
              >
                <span className="text-accent">{watch.expression}</span>
                <span className="text-muted">=</span>
                {watch.error ? (
                  <span style={{ color: 'var(--rose)' }} title={watch.error}>
                    {watch.error}
                  </span>
                ) : (
                  <span>{watch.value}</span>
                )}
                <button
                  type="button"
                  onClick={() => onRemoveWatch(watch.expression)}
                  data-testid={`btn-unwatch-${index}`}
                  title={`Unpin ${watch.expression}`}
                  aria-label={`Unpin ${watch.expression}`}
                  className="cursor-pointer border-0 bg-transparent px-0.5 text-muted hover:text-body"
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        )}
        <form
          data-testid="watch-form"
          onSubmit={(event) => {
            event.preventDefault();
            onSubmitWatch();
          }}
          className="flex flex-wrap items-center gap-1.5 font-mono text-[11px]"
        >
          <input
            data-testid="watch-input"
            aria-label="Pin an expression to show beside every pause, as Python"
            placeholder="pin an expression…"
            value={watchDraft}
            onChange={(event) => onWatchDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                event.preventDefault();
                onWatchDraft('');
              }
            }}
            spellCheck={false}
            className="w-44 rounded border px-1.5 py-0.5 font-mono text-[11px] text-body"
            style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg)' }}
          />
          <button
            type="submit"
            data-testid="btn-watch"
            title="Show this expression's value at every pause in this lesson"
            className="px-2 py-0.5 rounded border border-line bg-canvas text-[11px] text-body cursor-pointer hover:bg-raise"
          >
            Watch
          </button>
          {(watchError || step.watch_error) && (
            <span data-testid="watch-error" role="status" style={{ color: 'var(--rose)' }}>
              {watchError || step.watch_error}
            </span>
          )}
        </form>
      </div>
      {frameEdit && pauseCapable && (
        <form
          data-testid="frame-edit"
          onSubmit={(event) => {
            event.preventDefault();
            onApplyFrameEdit();
          }}
          className="mt-2 flex flex-wrap items-center gap-1.5 font-mono text-[11px]"
        >
          <span className="text-accent">{frameEdit.name}</span>
          <span className="text-muted">=</span>
          <input
            data-testid="frame-edit-expression"
            aria-label={`New value for ${frameEdit.name}, as a Python expression`}
            value={frameEdit.expression}
            onChange={(event) =>
              onFrameEdit({ name: frameEdit.name, expression: event.target.value })
            }
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                event.preventDefault();
                onFrameEdit(null);
              }
            }}
            autoFocus
            spellCheck={false}
            className="w-40 rounded border px-1.5 py-0.5 font-mono text-[11px] text-body"
            style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg)' }}
          />
          <button
            type="submit"
            data-testid="btn-frame-edit-apply"
            className="cursor-pointer rounded border border-line bg-canvas px-2 py-0.5 font-mono text-[11px] text-body hover:bg-raise"
          >
            Set
          </button>
          <button
            type="button"
            data-testid="btn-frame-edit-cancel"
            onClick={() => onFrameEdit(null)}
            className="cursor-pointer rounded border border-line bg-canvas px-2 py-0.5 font-mono text-[11px] text-muted hover:bg-raise"
          >
            Cancel
          </button>
          <span className="text-muted">this run only — your code is untouched</span>
        </form>
      )}
      {frameEditError && (
        <p
          data-testid="frame-edit-error"
          role="status"
          className="mt-1.5 font-mono text-[11px]"
          style={{ color: 'var(--rose)' }}
        >
          {frameEditError}
        </p>
      )}
    </div>
  );
}
