import { AlertTriangle, ArrowRight, Check, CircleHelp } from 'lucide-react';
import type { MicroQuestion } from '../../data/microLessons';
import {
  comparisonCode,
  questionTarget,
  selectedAnswerText,
} from '../../micro/questionComparison.ts';
import { MicroRichText } from './MicroText.tsx';

/**
 * The learner's pick, beside the question (`components/micro/MicroAnswerPreview.tsx`).
 *
 * Before a check the card is outlined amber and says the answer is not confirmed. After the
 * check it turns green or red. The value slot fades in after the variable name, so the eye can
 * follow "x becomes 15" instead of reading the option twice.
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
  const answer = selectedAnswerText(question, selected);
  const target = questionTarget(question);
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
  const codeTone =
    state === 'correct'
      ? 'border-emerald/70'
      : state === 'wrong'
        ? 'border-rose/70'
        : 'border-amber/70';

  return (
    <aside
      className={`micro-reveal self-start rounded-xl border-2 p-3.5 transition-colors duration-300 ${tone}`}
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
          {target ?? 'answer'}
        </span>
        <ArrowRight className="h-4 w-4 text-faint" aria-hidden="true" />
        <span
          key={`${selected}-${state}`}
          className="micro-answer-value max-w-full break-words rounded-md border border-line bg-panel px-2.5 py-1 font-mono text-[14px] font-bold text-ink"
        >
          {answer}
        </span>
      </div>

      <pre className={`mt-2.5 overflow-x-auto rounded-lg border bg-canvas p-2.5 font-mono text-[12.5px] leading-relaxed text-body ${codeTone}`}>
        {comparisonCode(question, selected)}
      </pre>

      {graded ? (
        <p className="mt-2 text-[12.5px] leading-relaxed text-body">
          <MicroRichText text={question.explanation} />
        </p>
      ) : (
        <p className="mt-2 text-[12px] leading-relaxed text-muted">
          Yellow means this is still your guess. Check it to see whether the value holds.
        </p>
      )}
    </aside>
  );
}
