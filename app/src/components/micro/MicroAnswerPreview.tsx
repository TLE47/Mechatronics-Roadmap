import { Fragment } from 'react';
import { AlertTriangle, ArrowRight, Check, CircleHelp } from 'lucide-react';
import type { MicroQuestion } from '../../data/microLessons';
import { isCodeLikeText } from '../../micro/inlineCode.ts';
import { comparisonPreview } from '../../micro/questionComparison.ts';
import { MicroOptionText, MicroRichText, MicroCodeLine } from './MicroText.tsx';

/**
 * The learner's pick, beside the question (`components/micro/MicroAnswerPreview.tsx`).
 *
 * The card shows the same equation twice: as authored, and with the values already established by
 * earlier lines plugged in. The computed result sits beside the learner's pick so a mismatch is
 * easy to spot before they check; the check still decides whether the answer is recorded.
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
      className={`micro-reveal min-w-0 self-start rounded-xl border-2 p-3.5 transition-colors duration-300 ${tone}`}
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

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="rounded-md border border-accent/35 bg-accent/10 px-2 py-1 font-mono text-[13px] font-bold text-accent">
          {targetLabel}
        </span>
        <ArrowRight className="h-4 w-4 text-faint" aria-hidden="true" />
        <span
          key={`${selected}-${state}`}
          className="micro-answer-value min-w-0 max-w-full break-words rounded-md border border-line bg-panel px-2.5 py-1 text-[14px] font-bold text-ink"
        >
          <MicroOptionText text={preview.selectedText} />
        </span>
      </div>

      {preview.lines.length ? (
        <div
          className="mt-2.5 overflow-hidden rounded-lg border border-line-soft bg-canvas"
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
                <div className="min-w-0 p-2 text-[11.5px] leading-snug">
                  <MicroCodeLine code={line.original} />
                </div>
                <div className="min-w-0 p-2 text-[11.5px] leading-snug">
                  <MicroCodeLine code={line.plugged} />
                </div>
              </Fragment>
            ))}
          </div>
        </div>
      ) : null}

      {preview.result ? (
        <div
          className="mt-2 grid gap-2 rounded-lg border border-line-soft bg-panel p-2 sm:grid-cols-2"
          data-testid="micro-answer-result"
        >
          <div className="min-w-0">
            <p className="font-mono text-[9px] uppercase tracking-[0.12em] text-faint">Your pick</p>
            <div className="mt-1 break-words text-[12.5px] leading-relaxed text-body">
              <MicroOptionText text={preview.selectedText} />
            </div>
          </div>
          <div className="min-w-0 border-t border-line-soft pt-2 sm:border-l sm:border-t-0 sm:pl-2 sm:pt-0">
            <p className="font-mono text-[9px] uppercase tracking-[0.12em] text-faint">Python gives</p>
            <div
              className={`mt-1 break-words text-[12.5px] leading-relaxed ${
                preview.resultKind === 'error' ? 'text-rose' : 'text-body'
              }`}
              data-result-kind={preview.resultKind ?? undefined}
            >
              {isCodeLikeText(preview.result) ? (
                <MicroCodeLine code={preview.result} />
              ) : (
                <MicroRichText text={preview.result} />
              )}
            </div>
          </div>
        </div>
      ) : null}

      {graded ? (
        <p className="mt-2 text-[12.5px] leading-relaxed text-body">
          <MicroRichText text={question.explanation} />
        </p>
      ) : (
        <p className="mt-2 text-[12px] leading-relaxed text-muted">
          {preview.lines.length
            ? 'The right column plugs in the values the code already knows, and Python gives the result beside your pick. Check it to record your answer.'
            : 'Yellow means this is still your guess. Check it to see whether the value holds.'}
        </p>
      )}
    </aside>
  );
}
