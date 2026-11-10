import React from 'react';
import { describeCheck, type PredictionRecord } from '../../../predictGate';

/**
 * The prediction gate, as an editor pane (`runner/PredictPane.tsx`).
 *
 * It is a view rather than a block above the code because a guess is read against the code that has
 * to print it: side by side or stacked, like the run output and the expected text. The rules that
 * grade a guess stay in `predictGate.ts`; this draws the question and the verdict.
 */
export function PredictPane({
  record,
  text,
  onText,
  onCommit,
  onSkip,
  onAgain,
  onClose,
  asksForFinish,
  held,
  running,
}: {
  record: PredictionRecord | null;
  text: string;
  onText: (text: string) => void;
  onCommit: () => void;
  onSkip: () => void;
  onAgain: () => void;
  /** `keyboard` is the press that closed it: the offer takes the focus that press loses. */
  onClose: (keyboard: boolean) => void;
  asksForFinish: boolean;
  held: boolean;
  running: boolean;
}) {
  return (
    <div className="flex h-full min-h-0 flex-col bg-panel border border-line rounded-xl p-4">
      <div
        id="predict-gate"
        data-testid="predict-gate"
        data-predict-state={record ? (record.skipped ? 'skipped' : 'judged') : 'asking'}
        className="rounded-lg border border-amber/40 bg-canvas p-3"
      >
        {record ? (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-[11px] font-mono text-amber">
                PREDICT · {record.skipped ? 'skipped' : describeCheck(record)}
              </span>
              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  onClick={onAgain}
                  data-testid="btn-predict-again"
                  title="Change your saved prediction: the box comes back with your words in it and the new call is judged again"
                  className="px-2 py-0.5 rounded text-[11px] font-mono text-muted hover:text-accent border border-line cursor-pointer"
                >
                  {record.skipped ? 'Predict again' : 'Edit prediction'}
                </button>
                <button
                  onClick={(event) => onClose(event.detail === 0)}
                  data-testid="btn-predict-close"
                  className="px-2 py-0.5 rounded text-[11px] font-mono text-muted hover:text-body border border-line cursor-pointer"
                >
                  Close
                </button>
              </div>
            </div>
            {record.skipped ? (
              <p data-testid="predict-skipped-text" className="mt-2 text-xs text-muted">
                You ran this one without predicting. The run went through; nothing was blocked.
              </p>
            ) : (
              <>
                <p className="mt-2 text-[11px] font-mono text-faint">You wrote</p>
                <pre
                  data-testid="predict-recorded"
                  className="mt-1 overflow-auto rounded border border-line-soft bg-panel p-2 font-mono text-[11.5px] text-body whitespace-pre-wrap"
                >
                  {record.text}
                </pre>
                <p
                  data-testid="predict-verdict-text"
                  className={`mt-1.5 text-xs ${
                    record.verdict === 'match'
                      ? 'text-emerald'
                      : record.verdict === 'miss'
                        ? 'text-rose'
                        : 'text-amber'
                  }`}
                >
                  {record.verdict === 'match'
                    ? 'You called it: the output matched, line for line.'
                    : record.verdict === 'reordered'
                      ? 'The right lines, in a different order: the program prints them in its own sequence, and that sequence is the lesson.'
                      : record.verdict === 'partial'
                        ? `Your guess and the output share ${record.matchedLines} of ${record.predictedLines} lines. The rest are the ones worth reading twice.`
                        : 'None of your lines are in the output. That is the useful part: the screen just told you something you did not expect.'}
                </p>
              </>
            )}
          </>
        ) : (
          <>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="text-[11px] font-mono text-amber">
                {asksForFinish
                  ? 'PREDICT FIRST · what will a finished run print?'
                  : 'PREDICT FIRST · what will this print?'}
              </span>
              <span className="text-[11px] font-mono text-faint">
                {held ? 'before the run' : 'before you press Run'}
              </span>
            </div>
            <label htmlFor="predict-input" className="mt-2 block text-xs text-body">
              Type the output you expect, one line per line of output. It is checked against the
              lesson&apos;s own expected output when you commit, and the run goes then.
              {asksForFinish && (
                <>
                  {' '}
                  This starter stops at its first NotImplementedError, so predict the line a finished
                  file prints — not the traceback.
                </>
              )}
            </label>
            <textarea
              id="predict-input"
              value={text}
              onChange={(event) => onText(event.target.value)}
              rows={3}
              spellCheck={false}
              data-testid="predict-input"
              // Shape, never content: the old example was P.1's own expected line repeated on
              // every lesson, which was half the answer to P.1's gate and another lesson's output
              // everywhere else.
              placeholder={'one line per line the program prints, e.g.\nLabel: value | Label: value'}
              className="mt-1.5 w-full rounded border border-line bg-panel p-2 font-mono text-[12px] text-body resize-y"
            />
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <button
                onClick={onCommit}
                disabled={!text.trim() || running}
                data-testid="btn-predict-run"
                className="btn btn-primary px-3 py-1.5 text-[12px] font-bold disabled:opacity-50"
              >
                {held ? 'Predict & Run' : 'Save prediction'}
              </button>
              <button
                onClick={onSkip}
                disabled={running}
                data-testid="btn-predict-skip"
                title="Run without predicting. The skip is recorded, so it is not counted as a prediction."
                className="px-2.5 py-1.5 rounded-lg text-xs font-mono text-muted hover:text-body border border-line cursor-pointer disabled:opacity-50"
              >
                Skip and run
              </button>
              <span className="text-[11px] text-faint">
                A missed guess is what makes the result stick.
              </span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
