import {
  snapshotAgeLabel,
  verdictLabel,
  type DraftSnapshot,
} from '../../../draftHistory';

interface DraftHistoryPanelProps {
  open: boolean;
  history: DraftSnapshot[];
  onClear: () => void;
  onRestore: (code: string) => void;
}

/**
 * The versions behind the draft. A draft is one latest text; this is the run that worked before the
 * last edit, which is the thing a learner actually wants back.
 */
export function DraftHistoryPanel({ open, history, onClear, onRestore }: DraftHistoryPanelProps) {
  if (!open) return null;
  return (
    <div
      id="draft-history"
      data-testid="draft-history"
      className="mt-3 rounded-lg border border-line-soft bg-canvas p-3"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-mono text-accent">RUN HISTORY · this lesson</span>
        {history.length > 0 && (
          <button
            onClick={onClear}
            data-testid="btn-clear-history"
            className="px-2 py-0.5 rounded text-[11px] font-mono text-muted hover:text-rose border border-line cursor-pointer"
          >
            Forget these
          </button>
        )}
      </div>
      {history.length === 0 ? (
        <p className="text-xs text-muted mt-2" data-testid="draft-history-empty">
          Every run files the code it started from, so a version that worked is one click away.
          Nothing filed yet — press Run.
        </p>
      ) : (
        <ol className="mt-2 space-y-1.5">
          {history.map((snapshot, index) => (
            <li
              key={`${snapshot.at}-${index}`}
              data-testid={`history-entry-${index}`}
              className="flex flex-wrap items-center justify-between gap-2 text-xs border border-line-soft rounded px-2 py-1"
            >
              <span className="font-mono text-muted">{snapshotAgeLabel(snapshot.at)}</span>
              <span
                data-testid={`history-entry-${index}-verdict`}
                className={`font-mono ${
                  snapshot.outcome === 'verified' || snapshot.outcome === 'passed'
                    ? 'text-emerald'
                    : 'text-amber'
                }`}
              >
                {verdictLabel(snapshot.outcome)}
              </span>
              <button
                onClick={() => onRestore(snapshot.code)}
                data-testid={`btn-restore-history-${index}`}
                className="px-2 py-0.5 rounded text-[11px] font-mono bg-accent/15 hover:bg-accent/25 text-accent border border-accent/40 cursor-pointer"
              >
                Restore
              </button>
            </li>
          ))}
        </ol>
      )}
      <p className="text-[11px] text-faint mt-2">
        Five attempts per lesson, kept locally. Restoring puts that code back in the editor — press
        Run to grade it again.
      </p>
    </div>
  );
}
