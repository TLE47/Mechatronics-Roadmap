/**
 * The learner's own change, line by line (`runner/DiffPanel.tsx`).
 *
 * The roadmap card could say how many lines moved; this says which ones, and where. It is a view of
 * `runner/useDraftComparison.ts` and holds no state of its own: which reference is chosen, whether
 * the solution is earned and whether the panel is open are all the hook's, so this file is the
 * drawing and nothing else.
 */
import { snapshotAgeLabel, verdictLabel } from '../../../draftHistory';
import { diffSummary } from '../../../codeDiff';
import { diffSameMessage, runTarget } from '../../../diffReference';
import type { DraftComparison } from './useDraftComparison';

export function DiffPanel({ comparison }: { comparison: DraftComparison }) {
  const diff = comparison.diff;
  if (!comparison.diffOpen || !diff) return null;
  const reference = comparison.reference;
  const target = comparison.target;

  return (
    <div
      id="code-diff"
      data-testid="code-diff"
      data-diff-added={diff.added}
      data-diff-removed={diff.removed}
      data-diff-target={target}
      className="mt-3 rounded-lg border border-line-soft bg-canvas p-3"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-[11px] font-mono text-accent">DIFF · your code</span>
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            onClick={() => comparison.chooseTarget('starter')}
            aria-pressed={target === 'starter'}
            data-testid="diff-target-starter"
            className={`px-2 py-0.5 rounded text-[11px] font-mono border cursor-pointer ${
              target === 'starter'
                ? 'text-accent border-accent/60 bg-accent/10'
                : 'text-muted border-line'
            }`}
          >
            vs starter
          </button>
          <button
            onClick={() => comparison.chooseTarget('solution')}
            aria-pressed={target === 'solution'}
            disabled={!comparison.solutionUnlocked}
            data-testid="diff-target-solution"
            title={
              comparison.solutionUnlocked
                ? 'Your code against the lesson solution'
                : 'Open the solution, or pass the lesson, to compare against it'
            }
            className={`px-2 py-0.5 rounded text-[11px] font-mono border ${
              target === 'solution'
                ? 'text-accent border-accent/60 bg-accent/10 cursor-pointer'
                : comparison.solutionUnlocked
                  ? 'text-muted border-line cursor-pointer'
                  : 'text-faint border-line-soft cursor-not-allowed'
            }`}
          >
            vs solution
          </button>
          {/* The third reference: the code a filed run started from. Newest first, so the run a
              learner just made is the first button; the list is the same one the History panel
              restores from, capped at five. */}
          {comparison.history.map((version, index) => {
            const runReference = runTarget(index);
            const active = target === runReference;
            return (
              <button
                key={runReference}
                onClick={() => comparison.chooseTarget(runReference)}
                aria-pressed={active}
                data-testid={`diff-target-run-${index}`}
                title={`Your code against the code that ran ${snapshotAgeLabel(
                  version.at
                )} (${verdictLabel(version.outcome)})`}
                className={`px-2 py-0.5 rounded text-[11px] font-mono border cursor-pointer ${
                  active
                    ? 'text-accent border-accent/60 bg-accent/10'
                    : 'text-muted border-line'
                }`}
              >
                vs run {index + 1} · {verdictLabel(version.outcome)}
              </button>
            );
          })}
          <span data-testid="diff-summary" className="text-[11px] font-mono text-muted">
            {diffSummary(diff)}
          </span>
        </div>
      </div>

      {/* The version a restore or the five-version cap removed: the panel says which reference it
          used rather than drawing an empty diff. */}
      {reference.fellBack && target !== 'starter' && (
        <p data-testid="diff-fell-back" className="mt-2 text-xs text-muted">
          That version is gone — the panel is comparing against your starter.
        </p>
      )}
      {diff.added === 0 && diff.removed === 0 ? (
        <p data-testid="diff-same" className="mt-2 text-xs text-muted">
          {diffSameMessage(target, reference)}
        </p>
      ) : (
        <div
          data-testid="diff-body"
          className="mt-2 max-h-72 overflow-auto rounded border border-line-soft"
        >
          {diff.blocks.map((block, blockIndex) => (
            <div key={`block-${blockIndex}`}>
              {block.gap > 0 && (
                <div data-testid="diff-gap" className="px-2 py-0.5 font-mono text-[11px] text-faint">
                  … {block.gap} unchanged
                </div>
              )}
              {block.rows.map((row, rowIndex) => (
                <div
                  key={`row-${blockIndex}-${rowIndex}`}
                  data-testid="diff-row"
                  data-kind={row.kind}
                  className={`flex gap-2 px-2 font-mono text-[11.5px] leading-[1.55] ${
                    row.kind === 'added'
                      ? 'text-emerald bg-emerald/10'
                      : row.kind === 'removed'
                        ? 'text-rose bg-rose/10'
                        : 'text-muted'
                  }`}
                >
                  <span className="w-7 shrink-0 text-right tabular-nums text-faint">
                    {row.left ?? ''}
                  </span>
                  <span className="w-7 shrink-0 text-right tabular-nums text-faint">
                    {row.right ?? ''}
                  </span>
                  <span className="w-3 shrink-0">
                    {row.kind === 'added' ? '+' : row.kind === 'removed' ? '−' : ' '}
                  </span>
                  <span className="whitespace-pre">{row.text || ' '}</span>
                </div>
              ))}
            </div>
          ))}
          {diff.truncated && (
            <div data-testid="diff-truncated" className="px-2 py-1 font-mono text-[11px] text-faint">
              … the rest of this change is not drawn here.
            </div>
          )}
        </div>
      )}
      <p className="mt-1.5 text-[11px] text-faint">
        Whitespace counts: this is your file against the reference, not the lenient output
        comparison the checks use.
        {diff.coarse ? ' The file is large, so only its unchanged head and tail are matched.' : ''}
      </p>
    </div>
  );
}
