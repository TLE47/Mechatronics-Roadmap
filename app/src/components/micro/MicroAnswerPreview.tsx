import { Fragment, useState } from 'react';
import { AlertTriangle, ArrowRight, Check, CircleHelp, Eye, ListOrdered } from 'lucide-react';
import type { MicroQuestion } from '../../data/microLessons';
import { isCodeLikeText } from '../../micro/inlineCode.ts';
import { comparisonPreview, type ComparisonTraceStep } from '../../micro/questionComparison.ts';
import { MicroOptionText, MicroRichText, MicroCodeLine } from './MicroText.tsx';

/**
 * The learner's pick, beside the question (`components/micro/MicroAnswerPreview.tsx`).
 *
 * The card shows the same equation twice: as authored, and with the values already established by
 * earlier lines plugged in. The computed result waits behind a reveal so the learner can commit to
 * an answer first; once revealed, they can trace each Python line and the values it used. The check
 * still decides whether the answer is recorded.
 */
export function MicroAnswerPreview({
  question,
  selected,
  graded,
  correct,
}: {
  question: MicroQuestion;
  selected: string;
  graded: boolean;
  correct: boolean;
}) {
  const preview = comparisonPreview(question, selected);
  const [revealed, setRevealed] = useState(false);
  const [traceOpen, setTraceOpen] = useState(false);
  const state = graded ? (correct ? 'correct' : 'wrong') : 'pending';
  const tone =
    state === 'correct'
      ? 'border-emerald/70 bg-emerald/5'
      : state === 'wrong'
        ? 'border-rose/70 bg-rose/5'
        : 'border-amber/70 bg-amber/5';
  const label =
    state === 'correct' ? 'Correct' : state === 'wrong' ? 'Not quite' : 'Your pick · not checked yet';
  const labelTone =
    state === 'correct'
      ? 'border-emerald/40 bg-emerald/10 text-emerald'
      : state === 'wrong'
        ? 'border-rose/40 bg-rose/10 text-rose'
        : 'border-amber/45 bg-amber/10 text-amber';
  const targetLabel = preview.targets.length ? preview.targets.join(' + ') : 'answer';

  return (
    <aside
      className={`micro-reveal min-w-0 self-start rounded-xl border-2 p-2.5 transition-colors duration-300 sm:p-3.5 ${tone}`}
      data-testid="micro-answer-preview"
      data-state={state}
      aria-live="polite"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-faint">Your comparison</p>
        <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[10.5px] font-semibold ${labelTone}`}>
          {state === 'correct' ? (
            <Check className="h-3 w-3" aria-hidden="true" />
          ) : state === 'wrong' ? (
            <AlertTriangle className="h-3 w-3" aria-hidden="true" />
          ) : (
            <CircleHelp className="h-3 w-3" aria-hidden="true" />
          )}
          {label}
        </span>
      </div>

      <div className="mt-2.5 flex flex-wrap items-center gap-2 sm:mt-3">
        <span className="rounded-md border border-accent/35 bg-accent/10 px-2 py-1 font-mono text-[12px] font-bold text-accent sm:text-[13px]">
          {targetLabel}
        </span>
        <ArrowRight className="h-4 w-4 text-faint" aria-hidden="true" />
        <span
          key={`${selected}-${state}`}
          className="micro-answer-value min-w-0 max-w-full break-words rounded-md border border-line bg-panel px-2.5 py-1 text-[13px] font-bold text-ink sm:text-[14px]"
        >
          <MicroOptionText text={preview.selectedText} />
        </span>
      </div>

      {preview.lines.length ? (
        <div
          className="mt-2 overflow-hidden rounded-lg border border-line-soft bg-canvas sm:mt-2.5"
          data-testid="micro-answer-equation"
        >
          <div className="grid grid-cols-2 divide-x divide-line-soft border-b border-line-soft">
            <p className="px-2 py-1.5 font-mono text-[9px] uppercase tracking-[0.12em] text-faint">
              Question
            </p>
            <p className="px-2 py-1.5 font-mono text-[9px] uppercase tracking-[0.12em] text-faint">
              Values plugged in
            </p>
          </div>
          <div className="grid grid-cols-2 divide-x divide-line-soft">
            {preview.lines.map((line, index) => (
              <Fragment key={`${line.original}-${index}`}>
                <div className="min-w-0 p-1.5 text-[10.5px] leading-snug sm:p-2 sm:text-[11.5px]">
                  <MicroCodeLine code={line.original} />
                </div>
                <div className="min-w-0 p-1.5 text-[10.5px] leading-snug sm:p-2 sm:text-[11.5px]">
                  <MicroCodeLine code={line.plugged} tone="plugged" />
                </div>
              </Fragment>
            ))}
          </div>
        </div>
      ) : null}

      {preview.result ? (
        <div
          className="mt-2 grid gap-2 rounded-lg border border-line-soft bg-panel p-2 sm:grid-cols-2"
          data-testid="micro-answer-python"
        >
          <div className="min-w-0">
            <p className="font-mono text-[9px] uppercase tracking-[0.12em] text-faint">Your pick</p>
            <div className="mt-1 break-words text-[12px] leading-relaxed text-body sm:text-[12.5px]">
              <MicroOptionText text={preview.selectedText} />
            </div>
          </div>
          <div className="min-w-0 border-t border-line-soft pt-2 sm:border-l sm:border-t-0 sm:pl-2 sm:pt-0">
            <div className="flex flex-wrap items-center justify-between gap-1.5">
              <p className="font-mono text-[9px] uppercase tracking-[0.12em] text-faint">Python gives</p>
              {revealed ? (
                <button
                  type="button"
                  onClick={() => setTraceOpen((open) => !open)}
                  aria-expanded={traceOpen}
                  className="inline-flex items-center gap-1 rounded-md border border-line bg-canvas px-1.5 py-0.5 text-[10px] font-semibold text-muted hover:border-accent/50 hover:text-accent"
                  data-testid="micro-answer-trace"
                >
                  <ListOrdered className="h-3 w-3" aria-hidden="true" />
                  Trace
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setRevealed(true)}
                  className="inline-flex items-center gap-1 rounded-md border border-accent/40 bg-accent/10 px-1.5 py-0.5 text-[10px] font-semibold text-accent hover:bg-accent/20"
                  data-testid="micro-answer-reveal"
                >
                  <Eye className="h-3 w-3" aria-hidden="true" />
                  Reveal result
                </button>
              )}
            </div>
            {revealed ? (
              <div
                className={`micro-reveal mt-1 break-words text-[12px] leading-relaxed sm:text-[12.5px] ${
                  preview.resultKind === 'error' ? 'text-rose' : 'text-body'
                }`}
                data-result-kind={preview.resultKind ?? undefined}
                data-testid="micro-answer-result"
              >
                {isCodeLikeText(preview.result) ? (
                  <MicroCodeLine code={preview.result} />
                ) : (
                  <MicroRichText text={preview.result} />
                )}
              </div>
            ) : (
              <p
                className="mt-1 text-[11px] leading-relaxed text-muted"
                data-testid="micro-answer-result-hidden"
              >
                Hidden until you reveal it.
              </p>
            )}
          </div>
        </div>
      ) : null}

      {revealed && traceOpen && preview.trace.length ? (
        <div
          className="micro-reveal mt-2 max-h-56 overflow-y-auto rounded-lg border border-line-soft bg-canvas p-2"
          data-testid="micro-answer-trace-panel"
        >
          <p className="font-mono text-[9px] uppercase tracking-[0.12em] text-faint">
            How Python gets there
          </p>
          <ol className="mt-1.5 space-y-1.5">
            {preview.trace.map((step, index) => (
              <TraceStep key={`${step.source}-${index}`} step={step} index={index} />
            ))}
          </ol>
        </div>
      ) : null}

      {graded ? (
        <p className="mt-2 text-[12.5px] leading-relaxed text-body">
          <MicroRichText text={question.explanation} />
        </p>
      ) : (
        <p className="mt-2 text-[11.5px] leading-relaxed text-muted sm:text-[12px]">
          {preview.lines.length
            ? preview.result
              ? 'Reveal Python’s result when you are ready, then trace the values each line used. Check it to record your answer.'
              : 'The right column shows the values the code already knows. Check it to record your answer.'
            : 'Yellow means this is still your guess. Check it to see whether the value holds.'}
        </p>
      )}
    </aside>
  );
}

function TraceStep({ step, index }: { step: ComparisonTraceStep; index: number }) {
  return (
    <li className="flex gap-1.5 rounded-md border border-line-soft bg-panel/70 p-1.5">
      <span className="w-3 shrink-0 select-none text-right font-mono text-[9.5px] text-faint">
        {index + 1}
      </span>
      <div className="min-w-0 flex-1">
        <MicroCodeLine code={step.source} />
        {step.plugged !== step.source ? (
          <p className="mt-0.5 break-words text-[9.5px] leading-relaxed text-faint">
            values{' '}
            <MicroCodeLine code={step.plugged} tone="plugged" className="text-[10.5px]" />
          </p>
        ) : null}
        {step.result ? (
          <p
            className={`mt-0.5 break-words text-[10.5px] leading-relaxed ${
              step.resultKind === 'error' ? 'text-rose' : 'text-emerald'
            }`}
            data-result-kind={step.resultKind ?? undefined}
          >
            <span className="mr-1 text-faint">→</span>
            {isCodeLikeText(step.result) ? (
              <MicroCodeLine code={step.result} />
            ) : (
              <MicroRichText text={step.result} />
            )}
          </p>
        ) : null}
      </div>
    </li>
  );
}
