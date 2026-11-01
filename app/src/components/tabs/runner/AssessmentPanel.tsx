import type { RefObject } from 'react';
import { ShieldCheck } from 'lucide-react';
import type { FailingCheck } from '../../../checkHints';
import type { HarnessGate } from '../../../harnessGrading';

interface AssessmentPanelProps {
  panelRef: RefObject<HTMLDivElement | null>;
  behaviorCheck: 'untested' | 'passed' | 'failed';
  outputCheck: 'untested' | 'matched' | 'differs';
  outputMatchMode: string;
  exactFormatting: boolean;
  instructorTestSummary: string[] | undefined;
  checkFailures: FailingCheck[];
  revealedHints: number;
  hintCount: number;
  onRevealHint: (rung: number) => void;
  instructorError: string;
  passStatus: string;
  harnessResult: HarnessGate | null;
}

/**
 * Instructor Behavioral Assessment (Multi-Input, Boundary & Tolerance Checks).
 *
 * The failing check, named, with the one rung that answers it. The runner reports one graded check at
 * a time - a behavioural failure outranks a presentation one - but each check owns its card and its
 * own button, so adding the third cannot turn this into a single control that guesses which failure
 * the learner meant.
 */
export function AssessmentPanel({
  panelRef,
  behaviorCheck,
  outputCheck,
  outputMatchMode,
  exactFormatting,
  instructorTestSummary,
  checkFailures,
  revealedHints,
  hintCount,
  onRevealHint,
  instructorError,
  passStatus,
  harnessResult,
}: AssessmentPanelProps) {
  return (
    <div
      ref={panelRef}
      data-testid="panel-instructor-tests"
      data-tour="checks-panel"
      className="bg-panel border border-line rounded-xl p-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-xs font-mono text-accent flex items-center gap-1.5">
          <ShieldCheck className="w-4 h-4" />
          <span>Instructor Behavioral Assessment (Multi-Input, Boundary &amp; Tolerance Checks)</span>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-xs font-mono">
          <span
            data-testid="badge-behavior-check"
            className={
              behaviorCheck === 'passed'
                ? 'text-emerald font-bold'
                : behaviorCheck === 'failed'
                  ? 'text-rose font-bold'
                  : 'text-muted'
            }
          >
            Behavior Tests:{' '}
            {behaviorCheck === 'passed' ? 'PASSED' : behaviorCheck === 'failed' ? 'FAILED' : 'UNTESTED'}
          </span>
          <span aria-hidden="true" className="text-faint">·</span>
          <span
            data-testid="badge-output-check"
            className={
              outputCheck === 'matched'
                ? 'text-emerald font-bold'
                : outputCheck === 'differs'
                  ? 'text-amber font-bold'
                  : 'text-muted'
            }
          >
            Presentation (`stdout`, {outputMatchMode} match):{' '}
            {outputCheck === 'matched' ? 'MATCHED' : outputCheck === 'differs' ? 'DIFFERS' : 'UNTESTED'}
          </span>
          <span aria-hidden="true" className="text-faint">·</span>
          <span data-testid="note-output-match-mode" className="text-[11px] text-muted">
            {exactFormatting
              ? 'This lesson grades exact formatting: its table columns are part of the answer.'
              : 'Formatting is ignored: indentation, column padding and blank lines cannot block a correct solution.'}
          </span>
        </div>
      </div>
      <ul className="mt-2.5 space-y-1 text-xs text-body font-mono">
        {(instructorTestSummary || []).map((item, idx) => (
          <li key={idx} className="flex items-start gap-2">
            <span className="text-accent">•</span>
            <span>{item}</span>
          </li>
        ))}
      </ul>
      {checkFailures.map((check) => (
        <div
          key={check.id}
          data-testid={`check-failure-${check.id}`}
          aria-live="polite"
          className="mt-2.5 p-2.5 rounded-lg bg-canvas border border-rose/40"
        >
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-xs font-mono">
            <span className="font-bold text-rose">{check.title}</span>
            <span aria-hidden="true" className="text-faint">·</span>
            <span className="text-body break-words">{check.detail}</span>
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[11px] font-mono">
            <span className="text-muted break-words">{check.why}</span>
            {check.hint > 0 && revealedHints < check.hint && (
              <button
                data-testid={`btn-check-hint-${check.id}`}
                onClick={() => onRevealHint(check.hint)}
                title={`Open Hint ${check.hint}, the rung that answers this check - and only that rung`}
                className="px-2 py-0.5 rounded bg-amber/15 hover:bg-amber/25 text-amber-strong border border-amber/40 cursor-pointer"
              >
                Show Hint {check.hint}
              </button>
            )}
            {check.hint > 0 && revealedHints >= check.hint && (
              <span data-testid={`check-hint-open-${check.id}`} className="text-amber">
                {revealedHints < hintCount
                  ? `Hint ${check.hint} is open below · Hint ${revealedHints + 1} waits for your next run`
                  : `Hint ${check.hint} is open below`}
              </span>
            )}
          </div>
        </div>
      ))}
      {instructorError && (
        <div
          data-testid="pre-instructor-error"
          className="mt-2.5 p-2.5 rounded-lg bg-canvas border border-rose/50 font-mono text-xs text-rose"
        >
          {instructorError}
        </div>
      )}
      {passStatus === 'harness_failed' && harnessResult && harnessResult.failures.length > 0 && (
        <div
          data-testid="pre-harness-error"
          className="mt-2.5 p-2.5 rounded-lg bg-canvas border border-rose/50 font-mono text-xs text-rose space-y-1"
        >
          <div className="text-[11px] text-amber">
            Harness: {harnessResult.met} / {harnessResult.total} graded metrics at target
          </div>
          {harnessResult.failures.map((line) => (
            <div key={line}>{line}</div>
          ))}
        </div>
      )}
    </div>
  );
}
