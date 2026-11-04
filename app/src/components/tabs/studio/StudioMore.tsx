import React from 'react';
import {
  CircleDot,
  Copy,
  Download,
  GitBranch,
  History,
  MoreHorizontal,
  RefreshCw,
  Wand2,
  RotateCcw,
  Trash2,
} from 'lucide-react';

/** One filed studio run: the code that ran, what it printed, and when. */
export interface StudioRunSnapshot {
  code: string;
  output: string;
  ok: boolean;
  at: number;
}

interface StudioMoreProps {
  open: boolean;
  onToggle: () => void;
  onClose: () => void;
  onResetCode: () => void;
  onResetRuntime: () => void;
  onFormat: () => void;
  onCopyCode: () => void;
  onDownloadCode: () => void;
  onOpenWorkflow: () => void;
  /** Opens the breakpoint panel; armed lines also appear in the editor's gutter. */
  onToggleBreakpoints: () => void;
  breakpointsOpen: boolean;
  breakpointCount: number;
  history: readonly StudioRunSnapshot[];
  onRestore: (entry: StudioRunSnapshot) => void;
  onClearHistory: () => void;
}

const action =
  'px-2.5 py-1.5 rounded-lg text-[12.5px] font-mono bg-canvas hover:bg-raise text-body border border-line flex items-center gap-1.5 cursor-pointer';

/** The free-study counterpart of the lesson runner's More tray. */
export const StudioMore: React.FC<StudioMoreProps> = ({
  open,
  onToggle,
  onClose,
  onResetCode,
  onResetRuntime,
  onFormat,
  onCopyCode,
  onDownloadCode,
  onOpenWorkflow,
  onToggleBreakpoints,
  breakpointsOpen,
  breakpointCount,
  history,
  onRestore,
  onClearHistory,
}) => (
  <div className="flex min-w-0 flex-wrap items-center gap-1.5">
    <button
      type="button"
      data-testid="studio-more"
      aria-expanded={open}
      aria-controls="studio-more-panel"
      onClick={onToggle}
      title="Reset, history, copy, download and the workflow"
      className={`px-2.5 py-1.5 rounded-lg text-[12.5px] font-mono border flex items-center gap-1.5 cursor-pointer transition-colors ${
        open ? 'text-accent border-accent/60 bg-canvas' : 'text-body border-line bg-canvas hover:bg-raise'
      }`}
    >
      <MoreHorizontal className="h-3.5 w-3.5" aria-hidden="true" />
      More
    </button>
    <div
      id="studio-more-panel"
      role="group"
      aria-label="Studio actions"
      data-testid="studio-more-panel"
      hidden={!open}
      onKeyDown={(event) => {
        if (event.key === 'Escape') onClose();
      }}
      className="order-last w-full rounded-xl border border-line bg-panel p-2.5"
    >
      <p className="px-1 pb-2 text-[11px] font-mono uppercase tracking-[0.08em] text-faint">
        Studio actions
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" data-testid="studio-reset-code" onClick={onResetCode} className={action}>
          <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" /> Reset code
        </button>
        <button type="button" data-testid="studio-reset-runtime" onClick={onResetRuntime} className={action}>
          <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" /> Reset runtime
        </button>
        <button type="button" data-testid="studio-format" onClick={onFormat} className={action}>
          <Wand2 className="h-3.5 w-3.5" aria-hidden="true" /> Format
        </button>
        <button
          type="button"
          data-testid="studio-breakpoints"
          aria-pressed={breakpointsOpen}
          onClick={onToggleBreakpoints}
          className={action}
        >
          <CircleDot className="h-3.5 w-3.5" aria-hidden="true" /> Breakpoints
          {breakpointCount > 0 && (
            <span className="rounded-full bg-accent/15 px-1.5 font-bold text-accent">
              {breakpointCount}
            </span>
          )}
        </button>
        <button type="button" data-testid="studio-copy-code" onClick={onCopyCode} className={action}>
          <Copy className="h-3.5 w-3.5" aria-hidden="true" /> Copy code
        </button>
        <button type="button" data-testid="studio-download-code" onClick={onDownloadCode} className={action}>
          <Download className="h-3.5 w-3.5" aria-hidden="true" /> Download .py
        </button>
        <button type="button" data-testid="studio-open-workflow" onClick={onOpenWorkflow} className={action}>
          <GitBranch className="h-3.5 w-3.5" aria-hidden="true" /> Workflow
        </button>
      </div>

      <div className="mt-2.5 border-t border-line-soft pt-2.5" data-testid="studio-history">
        <div className="flex flex-wrap items-center gap-2">
          <span className="flex items-center gap-1.5 text-[11px] font-mono uppercase tracking-[0.08em] text-faint">
            <History className="h-3 w-3" aria-hidden="true" /> Run history
          </span>
          <span className="text-[10.5px] font-mono text-faint">
            {history.length ? `${history.length} filed` : 'a run files the code it started from'}
          </span>
          {history.length > 0 && (
            <button
              type="button"
              data-testid="studio-clear-history"
              onClick={onClearHistory}
              className="ml-auto flex items-center gap-1 rounded px-1.5 py-0.5 text-[10.5px] font-mono text-faint hover:text-rose"
            >
              <Trash2 className="h-3 w-3" aria-hidden="true" /> Clear
            </button>
          )}
        </div>
        {history.length > 0 ? (
          <ul className="mt-1.5 max-h-40 space-y-1 overflow-y-auto">
            {history.map((entry, index) => (
              <li key={`${entry.at}-${index}`}>
                <button
                  type="button"
                  data-testid={`studio-history-${index}`}
                  onClick={() => onRestore(entry)}
                  title={`Restore the code from ${new Date(entry.at).toLocaleTimeString()}`}
                  className="flex w-full items-start gap-2 rounded border border-line-soft bg-canvas px-2 py-1.5 text-left hover:border-accent/50"
                >
                  <span className={`mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full ${entry.ok ? 'bg-emerald' : 'bg-amber'}`} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-mono text-[11.5px] text-body">
                      {entry.code.split('\n').find((line) => line.trim()) || '(empty)'}
                    </span>
                    <span className="block truncate font-mono text-[10.5px] text-faint">
                      {new Date(entry.at).toLocaleTimeString()} · {entry.output || '(no output)'}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </div>
  </div>
);
