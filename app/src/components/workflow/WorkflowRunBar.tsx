import type { WorkflowRun, WorkflowRunStatus } from '../../workflowRun.ts';

/**
 * The simulation controls (`components/workflow/WorkflowRunBar.tsx`).
 *
 * One compact group in the panel's checks row: start, step, stop, what the run is doing, and — when
 * a decision pauses it — the guards as the only buttons that can answer. It shares that row on
 * purpose: the paper's position and height must not move for a mode a learner may never enter.
 * Presentational: the run state and its engine belong to `useWorkflowRun` and `workflowRun.ts`.
 */
export interface WorkflowRunBarProps {
  run: WorkflowRun | null;
  status: WorkflowRunStatus | null;
  onStart: () => void;
  onStep: () => void;
  onChoose: (edgeId: string) => void;
  onStop: () => void;
}

export function WorkflowRunBar({ run, status, onStart, onStep, onChoose, onStop }: WorkflowRunBarProps) {
  return (
    <div
      data-testid="workflow-run-bar"
      role="group"
      aria-label="Simulate the workflow"
      className="flex flex-wrap items-center gap-1.5 rounded-lg border border-line bg-panel/95 px-2 py-1 shadow-sm backdrop-blur-sm"
    >
      <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-faint">Simulate</span>
      {run ? (
        <>
          <button
            type="button"
            data-testid="workflow-run-step"
            onClick={onStep}
            disabled={run.done || Boolean(run.choice)}
            className="min-h-8 cursor-pointer rounded border border-line bg-panel px-2 font-mono text-[11px] text-body hover:bg-raise disabled:cursor-default disabled:opacity-40"
          >
            Step
          </button>
          <button
            type="button"
            data-testid="workflow-run-stop"
            onClick={onStop}
            className="min-h-8 cursor-pointer rounded border border-line bg-panel px-2 font-mono text-[11px] text-muted hover:bg-raise"
          >
            Stop
          </button>
          <span
            role="status"
            data-testid="workflow-run-status"
            className="font-mono text-[11px] text-accent"
          >
            {status?.text ?? ''}
          </span>
          {status?.exits.map((exit, index) => (
            <button
              key={exit.id}
              type="button"
              data-testid={`workflow-run-exit-${index}`}
              onClick={() => onChoose(exit.id)}
              className="min-h-8 cursor-pointer rounded border border-accent/50 bg-accent/10 px-2 font-mono text-[11px] text-accent hover:bg-accent/20"
            >
              {exit.label}
            </button>
          ))}
        </>
      ) : (
        <>
          <button
            type="button"
            data-testid="workflow-run-start"
            onClick={onStart}
            title="Walk the diagram along its control arrows; a decision pauses for you"
            className="min-h-8 cursor-pointer rounded border border-line bg-panel px-2 font-mono text-[11px] text-body hover:bg-raise"
          >
            Start
          </button>
        </>
      )}
    </div>
  );
}
