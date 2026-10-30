import type { PointerEvent as ReactPointerEvent } from 'react';
import { GripVertical } from 'lucide-react';
import { MAX_GROUP_TITLE_CHARS, type WorkflowGroup, type WorkflowNode } from '../../workflow.ts';
import type { CanvasRect } from './canvasGeometry.ts';

/**
 * One named frame (`components/workflow/WorkflowGroupFrame.tsx`).
 *
 * The box is derived from its cards, so it cannot frame the wrong ones. The chip is a sibling drawn
 * above the cards rather than a child of the box: a frame's name and `×` must stay pressable even
 * when the next card starts right under it, and a child of the dashed box would be painted beneath
 * that card. Its grip is the drag handle — a press there, or on the chip's own border, moves every
 * card inside as one unit — while the `<input>` types and the `×` removes the frame and leaves the
 * cards. The chip hangs half below the box, where the opening column always has room, so it is never
 * clipped by the paper's top edge.
 */

/** The chip is one control-row tall and hangs half in, half out of the box's bottom edge. */
const CHIP_HEIGHT = 24;

export interface WorkflowGroupFrameProps {
  group: WorkflowGroup;
  /** Its place among the document's frames: the testid and the default name both use it. */
  index: number;
  rect: CanvasRect;
  members: readonly WorkflowNode[];
  onRename: (index: number, title: string) => void;
  onRemove: (index: number) => void;
  onDragStart: (event: ReactPointerEvent, nodes: readonly WorkflowNode[]) => void;
}

export function WorkflowGroupFrame({
  group,
  index,
  rect,
  members,
  onRename,
  onRemove,
  onDragStart,
}: WorkflowGroupFrameProps) {
  const drag = (event: ReactPointerEvent) => {
    if ((event.target as HTMLElement).closest('input, button')) return;
    onDragStart(event, members);
  };

  return (
    <>
      <div
        data-testid={`workflow-group-${index}`}
        onPointerDown={drag}
        className="absolute z-10 rounded-xl border border-dashed border-accent/40 bg-accent/5"
        style={{ left: rect.x, top: rect.y, width: rect.width, height: rect.height }}
      />
      <div
        data-testid={`workflow-group-chip-${index}`}
        data-frame-chip=""
        onPointerDown={drag}
        className="absolute z-30 flex items-center rounded border border-line bg-panel shadow-sm"
        style={{ left: rect.x + 8, top: rect.y + rect.height - CHIP_HEIGHT / 2 }}
      >
        <span
          data-testid={`workflow-group-grip-${index}`}
          title={`Drag frame ${index + 1} and every card in it`}
          aria-hidden="true"
          className="flex h-6 w-6 cursor-grab touch-none items-center justify-center rounded-l text-faint hover:text-accent"
        >
          <GripVertical className="h-3 w-3" />
        </span>
        <input
          data-testid={`workflow-group-title-${index}`}
          aria-label={`Name of frame ${index + 1}`}
          value={group.title}
          maxLength={MAX_GROUP_TITLE_CHARS}
          placeholder={`Frame ${index + 1}`}
          onChange={(event) => onRename(index, event.target.value)}
          onPointerDown={(event) => event.stopPropagation()}
          className="h-6 w-28 bg-transparent px-1 font-mono text-[11px] text-accent outline-none placeholder:text-faint"
        />
        <button
          type="button"
          data-testid={`workflow-group-remove-${index}`}
          aria-label={`Remove frame ${index + 1}, keeping its cards`}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={() => onRemove(index)}
          className="flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded font-mono text-[11px] text-faint hover:text-rose"
        >
          ×
        </button>
      </div>
    </>
  );
}
