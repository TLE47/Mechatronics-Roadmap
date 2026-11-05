import { ArrowRight, Check, Sparkles } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { MicroConcept } from '../../data/microLessons';
import { MicroRichText } from './MicroText.tsx';

/**
 * One line at a time (`components/micro/MicroWalkthrough.tsx`).
 *
 * The authored concept carries a short walkthrough. Only the first line is visible; every click
 * appends the next one and fades in the value it changes. The rest of the lesson stays locked
 * until the learner has met the whole trace, so the screen never becomes a wall of text first.
 */
export function MicroWalkthrough({
  concept,
  onComplete,
}: {
  concept: MicroConcept;
  onComplete: () => void;
}) {
  const steps = concept.walkthrough;
  const [visible, setVisible] = useState(1);
  const completed = useRef(false);

  useEffect(() => {
    if (visible < steps.length || completed.current) return;
    completed.current = true;
    onComplete();
  }, [onComplete, steps.length, visible]);

  if (!steps.length) return null;
  const current = steps[Math.min(visible, steps.length) - 1];
  const value = current.after ?? current.output ?? 'ready';

  return (
    <section
      className="overflow-hidden rounded-2xl border border-accent/30 bg-canvas/75 shadow-sm"
      data-testid="micro-walkthrough"
    >
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-line-soft bg-accent/5 px-3.5 py-3">
        <div className="min-w-0">
          <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-accent">
            Trace it, one line at a time
          </p>
          <p className="mt-0.5 text-[13px] leading-relaxed text-muted">
            Read the code first. Click when you want the next piece.
          </p>
        </div>
        <span className="rounded-full border border-accent/35 bg-panel px-2.5 py-1 font-mono text-[11px] tabular-nums text-accent">
          {visible} / {steps.length}
        </span>
      </header>

      <div className="grid gap-0 xl:grid-cols-[minmax(0,1.12fr)_minmax(0,0.88fr)]">
        <div className="min-w-0 p-3.5">
          <div className="space-y-1.5 rounded-xl border border-line-soft bg-panel p-2.5 font-mono text-[13px] leading-relaxed">
            {steps.slice(0, visible).map((step, index) => (
              <div
                key={`${step.code}-${index}`}
                className={`micro-walkthrough-line flex items-start gap-2 rounded-lg px-2 py-1.5 ${
                  index === visible - 1 ? 'bg-accent/10 text-ink' : 'text-muted'
                }`}
              >
                <span className="w-4 shrink-0 select-none text-right text-[10.5px] text-faint">
                  {index + 1}
                </span>
                <code className="min-w-0 whitespace-pre-wrap break-words">{step.code}</code>
              </div>
            ))}
          </div>

          {visible < steps.length ? (
            <button
              type="button"
              onClick={() => setVisible((count) => Math.min(steps.length, count + 1))}
              className="mt-3 inline-flex items-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-[14px] font-bold text-inverse shadow-sm hover:bg-accent/80"
              data-testid="micro-reveal-next"
            >
              Reveal next line
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </button>
          ) : (
            <p
              className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-emerald/35 bg-emerald/10 px-3 py-1.5 text-[12.5px] font-semibold text-emerald"
              data-testid="micro-walkthrough-done"
            >
              <Check className="h-3.5 w-3.5" aria-hidden="true" />
              All lines revealed
            </p>
          )}
        </div>

        <div className="border-t border-line-soft bg-panel/65 p-3.5 xl:border-l xl:border-t-0">
          <div
            key={`${visible}-${current.code}`}
            className="micro-reveal"
            aria-live="polite"
            data-testid={`micro-walkthrough-step-${visible}`}
          >
            <p className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.12em] text-faint">
              <Sparkles className="h-3 w-3 text-accent" aria-hidden="true" />
              What changes
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className="rounded-md border border-accent/35 bg-accent/10 px-2 py-1 font-mono text-[13px] font-bold text-accent">
                {current.variable ?? 'result'}
              </span>
              {current.before ? (
                <>
                  <span className="rounded-md border border-line bg-canvas px-2 py-1 font-mono text-[12px] text-muted line-through decoration-rose/60">
                    {current.before}
                  </span>
                  <ArrowRight className="h-3.5 w-3.5 text-faint" aria-hidden="true" />
                </>
              ) : null}
              <span
                key={`${visible}-${value}`}
                className="micro-answer-value rounded-md border border-emerald/40 bg-emerald/10 px-2.5 py-1 font-mono text-[15px] font-bold text-emerald"
              >
                {value}
              </span>
            </div>
            {current.expression ? (
              <p className="mt-2 font-mono text-[12px] text-muted">reads {current.expression}</p>
            ) : null}
            <p className="mt-2 text-[13.5px] leading-relaxed text-body">
              <MicroRichText text={current.note} />
            </p>
            {current.output ? (
              <div className="mt-2.5 rounded-lg border border-line-soft bg-canvas p-2.5">
                <p className="font-mono text-[9.5px] uppercase tracking-[0.12em] text-faint">output</p>
                <pre className="mt-0.5 whitespace-pre-wrap font-mono text-[12.5px] leading-relaxed text-emerald">
                  {current.output}
                </pre>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}
