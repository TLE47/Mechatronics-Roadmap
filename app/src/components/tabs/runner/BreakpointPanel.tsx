import { MAX_CONDITION_CHARS, type Breakpoint } from '../../../editor/breakpoints';

interface BreakpointPanelProps {
  open: boolean;
  breakpoints: Breakpoint[];
  onSetCondition: (line: number, condition: string) => void;
  onToggle: (line: number) => void;
}

/**
 * Every dot and the sentence it waits for. The gutter can arm a line but cannot say why a park should
 * let a loop pass; this is the one place a condition is written, and the input is the stored value
 * rather than a copy of it.
 */
export function BreakpointPanel({ open, breakpoints, onSetCondition, onToggle }: BreakpointPanelProps) {
  if (!open) return null;
  return (
    <div
      id="breakpoint-panel"
      data-testid="breakpoint-panel"
      className="mt-3 rounded-lg border border-line-soft bg-canvas p-3"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-[11px] font-mono text-accent">BREAKPOINTS · this file</span>
        <span className="text-[11px] font-mono text-faint">
          {breakpoints.length
            ? `${breakpoints.length} armed · read when a run starts`
            : 'nothing armed'}
        </span>
      </div>
      {breakpoints.length === 0 ? (
        <p className="text-xs text-muted mt-2" data-testid="breakpoint-panel-empty">
          Click the column left of a line number to break there (or press F9 with the cursor on it).
          A condition narrows the dot to the pass that matters —{' '}
          <code className="font-mono text-body">n == 3</code> — so a loop is not a stop per turn.
        </p>
      ) : (
        <ul className="mt-2 space-y-1.5">
          {breakpoints.map((entry) => (
            <li
              key={entry.line}
              data-testid={`breakpoint-row-${entry.line}`}
              className="flex flex-wrap items-center gap-2 text-xs"
            >
              <span className="w-14 shrink-0 font-mono text-muted">line {entry.line}</span>
              <input
                data-testid={`breakpoint-condition-${entry.line}`}
                aria-label={`Condition for the breakpoint on line ${entry.line}, as a Python expression`}
                placeholder="stop only when… (Python expression)"
                value={entry.condition}
                onChange={(event) => onSetCondition(entry.line, event.target.value)}
                maxLength={MAX_CONDITION_CHARS}
                spellCheck={false}
                className="min-w-0 flex-1 rounded border px-1.5 py-0.5 font-mono text-[11px] text-body"
                style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg)' }}
              />
              <button
                onClick={() => onToggle(entry.line)}
                data-testid={`btn-clear-breakpoint-${entry.line}`}
                title={`Remove the breakpoint on line ${entry.line}`}
                aria-label={`Remove the breakpoint on line ${entry.line}`}
                className="px-2 py-0.5 rounded text-[11px] font-mono text-muted hover:text-rose border border-line cursor-pointer"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className="text-[11px] text-faint mt-2">
        A condition is a Python expression the interpreter evaluates with the names that line can
        see: the run stops only when it is true. A dot that waits is drawn hollow, and one whose
        expression raises stops anyway — with the interpreter's own words in the bar above.
        Conditions reach the interpreter with the next run.
      </p>
    </div>
  );
}
