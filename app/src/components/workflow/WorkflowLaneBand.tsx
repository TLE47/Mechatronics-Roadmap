import { MAX_LANE_TITLE_CHARS, type WorkflowLane } from '../../workflowProcesses.ts';
import type { CanvasRect } from './canvasGeometry.ts';

/**
 * One activity partition (`components/workflow/WorkflowLaneBand.tsx`).
 *
 * The band is derived from the cards it owns (`laneRect`), so it stretches with them and disappears
 * when the last one is deleted; the name lives on a small tab above the cards so no field is covered.
 * A lane is not a drag handle: moving its cards moves the band, and a lane drawn as one unit would
 * make a partition behave like a second frame. The tab is the one control — rename it, or remove the
 * partition and keep every card.
 */

export interface WorkflowLaneBandProps {
  lane: WorkflowLane;
  index: number;
  rect: CanvasRect;
  onRename: (index: number, title: string) => void;
  onRemove: (index: number) => void;
}

export function WorkflowLaneBand({ lane, index, rect, onRename, onRemove }: WorkflowLaneBandProps) {
  return (
    <>
      <div
        data-testid={`workflow-lane-${index}`}
        aria-hidden="true"
        className="pointer-events-none absolute z-[9] rounded-lg border border-accent/25 bg-accent/[0.035]"
        style={{ left: rect.x, top: rect.y, width: rect.width, height: rect.height }}
      />
      <div
        data-lane-chip=""
        className="absolute z-30 flex items-center rounded border border-accent/40 bg-panel shadow-sm"
        style={{ left: rect.x + 6, top: rect.y + 2 }}
        onPointerDown={(event) => event.stopPropagation()}
      >
        <span className="pl-1 font-mono text-[9px] uppercase tracking-[0.12em] text-accent/70">
          Lane
        </span>
        <input
          data-testid={`workflow-lane-title-${index}`}
          aria-label={`Name of lane ${index + 1}`}
          value={lane.title}
          maxLength={MAX_LANE_TITLE_CHARS}
          placeholder={`Lane ${index + 1}`}
          onChange={(event) => onRename(index, event.target.value)}
          className="h-5 w-24 bg-transparent px-1 font-mono text-[10.5px] text-accent outline-none placeholder:text-faint"
        />
        <button
          type="button"
          data-testid={`workflow-lane-remove-${index}`}
          aria-label={`Remove lane ${index + 1}, keeping its cards`}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={() => onRemove(index)}
          className="flex h-5 w-5 shrink-0 cursor-pointer items-center justify-center rounded font-mono text-[11px] text-faint hover:text-rose"
        >
          ×
        </button>
      </div>
    </>
  );
}
