import { useState, type RefObject } from 'react';
import {
  Activity,
  CheckCircle2,
  ChevronDown,
  CircleDashed,
  ListChecks,
  Radar,
  ShieldCheck,
  XCircle,
} from 'lucide-react';
import type { FailingCheck } from '../../../checkHints';
import type { HarnessGate } from '../../../harnessGrading';
import { CASE_STATE_LABEL, caseSummary, lessonCases } from '../../../lessonCases';

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
 *
 * The panel is an instrument rather than a paragraph: a live radar says the checks ran in this
 * session, the two verdicts are tiles with their own icon and colour, and each check the lesson
 * names is a compact card with a hover explanation. The long formatting rule stays available, but
 * behind a disclosure, so a beginner sees the verdict before the policy.
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
  // Collapsed by default: the panel's job is the verdict, and the case list is the evidence a
  // learner opens when the verdict is red. A press remembers its choice for this visit.
  const [casesOpen, setCasesOpen] = useState(false);
  // The panel already holds the summary and the verdict, so it derives the cases itself: the tab
  // and the panel read one function, and no call site has to pass the same list twice.
  const cases = lessonCases(
    { instructorTestSummary: instructorTestSummary ?? [] },
    { passStatus, instructorError }
  );
  const behaviorTone =
    behaviorCheck === 'passed'
      ? 'text-emerald'
      : behaviorCheck === 'failed'
        ? 'text-rose'
        : 'text-muted';
  const outputTone =
    outputCheck === 'matched'
      ? 'text-emerald'
      : outputCheck === 'differs'
        ? 'text-amber'
        : 'text-muted';
  const BehaviorIcon =
    behaviorCheck === 'passed' ? CheckCircle2 : behaviorCheck === 'failed' ? XCircle : CircleDashed;
  const OutputIcon =
    outputCheck === 'matched' ? CheckCircle2 : outputCheck === 'differs' ? Activity : CircleDashed;
  const live = behaviorCheck !== 'untested' || outputCheck !== 'untested';

  return (
    <div
      ref={panelRef}
      data-testid="panel-instructor-tests"
      data-tour="checks-panel"
      className="relative overflow-hidden rounded-xl border border-line bg-panel p-4"
    >
      <div
        aria-hidden="true"                className="pointer-events-none absolute right-0 top-0 h-56 w-56 rounded-full bg-accent/10 blur-3xl"
      />
      <div className="relative">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-2.5">
            <span
              data-testid="assessment-live"
              data-live={live ? 'true' : 'false'}
              className="relative grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-accent/40 bg-accent/10 text-accent"
            >
              <Radar className="h-4.5 w-4.5" aria-hidden="true" />
              <span
                aria-hidden="true"
                className={`absolute inset-0 rounded-xl border border-accent/50 ${live ? 'animate-ping opacity-25' : 'opacity-0'}`}
              />
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-1.5 font-mono text-[12px] font-bold uppercase tracking-[0.06em] text-accent">
                <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
                Instructor Behavioral Assessment
                <span className="rounded-full border border-line-soft bg-canvas px-1.5 py-0.5 text-[11px] font-normal tracking-[0.12em] text-faint">
                  live
                </span>
              </div>
              <p className="mt-0.5 text-[11px] text-muted">
                Multi-input, boundary &amp; tolerance checks · run again to refresh
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Check verdicts">
            <span
              data-testid="badge-behavior-check"
              data-state={behaviorCheck}
              title="The instructor's own functions are called with inputs the starter never shows; this is behaviour, not a printed line."
              className={`flex items-center gap-1.5 rounded-lg border px-2 py-1 font-mono text-[11px] ${behaviorTone} ${
                behaviorCheck === 'untested'
                  ? 'border-line bg-canvas'
                  : behaviorCheck === 'passed'
                    ? 'border-emerald/40 bg-emerald/10'
                    : 'border-rose/40 bg-rose/10'
              }`}
            >
              <BehaviorIcon className="h-3.5 w-3.5" aria-hidden="true" />
              Behavior Tests:{' '}
              {behaviorCheck === 'passed' ? 'PASSED' : behaviorCheck === 'failed' ? 'FAILED' : 'UNTESTED'}
            </span>
            <span
              data-testid="badge-output-check"
              data-state={outputCheck}
              title="The last run's stdout against the lesson's expected output, under the lesson's own matching rule."
              className={`flex items-center gap-1.5 rounded-lg border px-2 py-1 font-mono text-[11px] ${outputTone} ${
                outputCheck === 'untested'
                  ? 'border-line bg-canvas'
                  : outputCheck === 'matched'
                    ? 'border-emerald/40 bg-emerald/10'
                    : 'border-amber/40 bg-amber/10'
              }`}
            >
              <OutputIcon className="h-3.5 w-3.5" aria-hidden="true" />
              Presentation (`stdout`, {outputMatchMode} match):{' '}
              {outputCheck === 'matched' ? 'MATCHED' : outputCheck === 'differs' ? 'DIFFERS' : 'UNTESTED'}
            </span>
          </div>
        </div>

        {cases.length > 0 && (
          <div className="mt-3" data-testid="assessment-cases">
            <button
              type="button"
              data-testid="assessment-cases-toggle"
              aria-expanded={casesOpen}
              aria-controls="assessment-cases-list"
              onClick={() => setCasesOpen((open) => !open)}
              className="flex w-full cursor-pointer items-center gap-2 rounded-lg border border-line-soft bg-canvas/70 px-2.5 py-1.5 text-left font-mono text-[12px] text-body hover:border-accent/40 hover:bg-canvas"
            >
              <ListChecks className="h-3.5 w-3.5 shrink-0 text-accent" aria-hidden="true" />
              <span className="shrink-0 font-semibold uppercase tracking-[0.06em] text-accent">
                Cases
              </span>
              <span data-testid="assessment-cases-summary" className="min-w-0 truncate text-muted">
                {caseSummary(cases)}
              </span>
              <ChevronDown
                className={`ml-auto h-3.5 w-3.5 shrink-0 text-faint transition-transform ${
                  casesOpen ? 'rotate-180' : ''
                }`}
                aria-hidden="true"
              />
            </button>
            {casesOpen && (
              <ul
                id="assessment-cases-list"
                data-testid="assessment-checks"
                className="mt-1.5 grid gap-1.5 sm:grid-cols-2"
              >
                {cases.map((entry, idx) => (
                  <li
                    key={entry.id}
                    data-testid={`assessment-check-${idx}`}
                    data-state={entry.state}
                    title={entry.label}
                    className={`flex items-start gap-2 rounded-lg border px-2.5 py-2 text-[11.5px] leading-snug ${
                      entry.state === 'failed'
                        ? 'border-rose/40 bg-rose/[0.06] text-body'
                        : 'border-line-soft bg-canvas/70 text-body'
                    }`}
                  >
                    {entry.state === 'passed' ? (
                      <CheckCircle2 className="mt-0.5 h-3 w-3 shrink-0 text-emerald" aria-hidden="true" />
                    ) : entry.state === 'failed' ? (
                      <XCircle className="mt-0.5 h-3 w-3 shrink-0 text-rose" aria-hidden="true" />
                    ) : (
                      <CircleDashed className="mt-0.5 h-3 w-3 shrink-0 text-faint" aria-hidden="true" />
                    )}
                    <span className="min-w-0 flex-1">{entry.label}</span>
                    <span
                      className={`shrink-0 font-mono text-[11px] uppercase tracking-[0.06em] ${
                        entry.state === 'passed'
                          ? 'text-emerald'
                          : entry.state === 'failed'
                            ? 'text-rose'
                            : 'text-faint'
                      }`}
                    >
                      {CASE_STATE_LABEL[entry.state]}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        <details
          data-testid="assessment-formatting-rule"
          className="group mt-2.5 rounded-lg border border-line-soft bg-canvas/60 px-2.5 py-1.5"
        >
          <summary className="flex cursor-pointer list-none items-center gap-1.5 text-[12px] font-mono uppercase tracking-[0.08em] text-faint hover:text-body [&::-webkit-details-marker]:hidden">
            <Activity className="h-3 w-3" aria-hidden="true" />
            How presentation is read
            <span className="ml-auto text-[11px] normal-case tracking-normal text-dim group-open:hidden">
              open
            </span>
          </summary>
          <p data-testid="note-output-match-mode" className="mt-1.5 text-[11px] leading-snug text-muted">
            {exactFormatting
              ? 'This lesson grades exact formatting: its table columns are part of the answer.'
              : 'Formatting is ignored: indentation, column padding and blank lines cannot block a correct solution.'}
          </p>
        </details>

        {checkFailures.map((check) => (
          <div
            key={check.id}
            data-testid={`check-failure-${check.id}`}
            aria-live="polite"
            className="mt-2.5 rounded-lg border border-rose/40 bg-canvas p-2.5"
          >
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-xs font-mono">
              <span className="flex items-center gap-1.5 font-bold text-rose">
                <XCircle className="h-3.5 w-3.5" aria-hidden="true" />
                {check.title}
              </span>
              <span aria-hidden="true" className="text-faint">·</span>
              <span className="break-words text-body">{check.detail}</span>
            </div>
            <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[11px] font-mono">
              <span className="break-words text-muted">{check.why}</span>
              {check.hint > 0 && revealedHints < check.hint && (
                <button
                  data-testid={`btn-check-hint-${check.id}`}
                  onClick={() => onRevealHint(check.hint)}
                  title={`Open Hint ${check.hint}, the rung that answers this check - and only that rung`}
                  className="cursor-pointer rounded border border-amber/40 bg-amber/15 px-2 py-0.5 text-amber-strong hover:bg-amber/25"
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
            className="mt-2.5 rounded-lg border border-rose/50 bg-canvas p-2.5 font-mono text-xs text-rose"
          >
            {instructorError}
          </div>
        )}
        {passStatus === 'harness_failed' && harnessResult && harnessResult.failures.length > 0 && (
          <div
            data-testid="pre-harness-error"
            className="mt-2.5 space-y-1 rounded-lg border border-rose/50 bg-canvas p-2.5 font-mono text-xs text-rose"
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
    </div>
  );
}
