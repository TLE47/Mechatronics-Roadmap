import type {
  KeyboardEvent as ReactKeyboardEvent,
  PointerEvent as ReactPointerEvent,
} from 'react';
import { Trash2 } from 'lucide-react';
import {
  KIND_META,
  MAX_NODE_COORD,
  MAX_STEP_DETAIL_CHARS,
  MAX_STEP_TITLE_CHARS,
  MAX_STEP_UNIT_CHARS,
  NODE_WIDTH,
  WORKFLOW_SIDES,
  type WorkflowIssue,
  type WorkflowNode,
  type WorkflowSide,
} from '../../workflow.ts';
import { iconForKind } from '../workflowIcons.ts';
import { clamp } from './canvasGeometry.ts';
import type { LinkDraft } from './useLinking.ts';

/**
 * One card on the canvas (`components/workflow/WorkflowNodeCard.tsx`).
 *
 * A card is editable where it sits: title, detail and unit are always inputs, so there is no edit
 * mode to enter and no second form that can drift from what the card shows. Its header is the drag
 * handle and the keyboard handle (arrows nudge); its four dots are both inlets and outlets.
 *
 * The card owns no state — the position it is drawn at, whether it is being dragged, and which
 * arrow is armed all belong to the canvas, so two cards can never disagree about them.
 */

const NUDGE = 8;
const NUDGE_FAST = 32;

const PORT_POSITION: Record<WorkflowSide, string> = {
  left: 'left-0 top-1/2 -translate-x-1/2 -translate-y-1/2',
  right: 'right-0 top-1/2 translate-x-1/2 -translate-y-1/2',
  top: 'top-0 left-1/2 -translate-x-1/2 -translate-y-1/2',
  bottom: 'bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2',
};

export interface WorkflowNodeCardProps {
  node: WorkflowNode;
  index: number;
  /** Its place in the one reading order — the number the checklist also says. */
  number: number;
  issue: WorkflowIssue | undefined;
  selected: boolean;
  /** Where the canvas draws it: the document's point, or the live one during a drag. */
  position: { x: number; y: number };
  dragging: boolean;
  linking: LinkDraft | null;
  onSelect: (id: string) => void;
  onMove: (id: string, x: number, y: number) => void;
  onUpdate: (id: string, patch: Partial<WorkflowNode>) => void;
  onRemove: (id: string) => void;
  onDragStart: (event: ReactPointerEvent, node: WorkflowNode) => void;
  onLinkStart: (event: ReactPointerEvent, node: WorkflowNode, side: WorkflowSide) => void;
  /** A press on the body: the canvas's armed arrow lands here, or the press is just a selection. */
  onLinkLand: (event: ReactPointerEvent, node: WorkflowNode) => void;
}

export function WorkflowNodeCard({
  node,
  index,
  number,
  issue,
  selected,
  position,
  dragging,
  linking,
  onSelect,
  onMove,
  onUpdate,
  onRemove,
  onDragStart,
  onLinkStart,
  onLinkLand,
}: WorkflowNodeCardProps) {
  const Icon = iconForKind(node.kind);
  const meta = KIND_META[node.kind];

  const nudge = (event: ReactKeyboardEvent) => {
    const step = event.shiftKey ? NUDGE_FAST : NUDGE;
    const delta =
      event.key === 'ArrowLeft'
        ? { x: -step, y: 0 }
        : event.key === 'ArrowRight'
          ? { x: step, y: 0 }
          : event.key === 'ArrowUp'
            ? { x: 0, y: -step }
            : event.key === 'ArrowDown'
              ? { x: 0, y: step }
              : null;
    if (!delta) return;
    event.preventDefault();
    onMove(
      node.id,
      clamp(node.x + delta.x, 0, MAX_NODE_COORD),
      clamp(node.y + delta.y, 0, MAX_NODE_COORD)
    );
    onSelect(node.id);
  };

  return (
    <div
      data-node-id={node.id}
      data-testid={`workflow-node-${index}`}
      data-step={number}
      data-kind={node.kind}
      style={{ left: position.x, top: position.y, width: NODE_WIDTH }}
      className={`absolute z-10 cursor-default rounded-xl border bg-panel shadow-sm ${
        selected ? 'border-accent ring-2 ring-accent/25' : issue ? 'border-amber/70' : 'border-line'
      } ${dragging ? 'z-20 shadow-lg' : ''}`}
      onPointerDown={(event) => onLinkLand(event, node)}
    >
      <div
        data-testid={`workflow-node-drag-${index}`}
        role="group"
        tabIndex={0}
        aria-label={`Card ${number}, ${meta.label}. Drag to move; arrow keys nudge it.`}
        onPointerDown={(event) => onDragStart(event, node)}
        onKeyDown={nudge}
        className="flex cursor-grab touch-none items-center gap-1.5 rounded-t-xl border-b border-line-soft bg-canvas px-2 py-1.5 select-none focus-visible:outline-2 focus-visible:outline-accent"
      >
        <Icon className="h-3 w-3 shrink-0 text-accent" aria-hidden="true" />
        <span className="truncate font-mono text-[10px] uppercase tracking-[0.1em] text-accent">
          {meta.label}
        </span>
        <span
          data-testid={`workflow-node-number-${index}`}
          className="ml-auto font-mono text-[10px] tabular-nums text-faint"
        >
          {number}
        </span>
        <button
          type="button"
          data-testid={`workflow-node-delete-${index}`}
          aria-label={`Delete card ${number}`}
          title="Delete this card and its arrows"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={() => onRemove(node.id)}
          className="flex h-4 w-4 cursor-pointer items-center justify-center rounded text-faint hover:text-rose"
        >
          <Trash2 className="h-3 w-3" aria-hidden="true" />
        </button>
        {issue && (
          <span
            className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber"
            title={issue.message}
            aria-label={issue.message}
          />
        )}
      </div>

      <div className="space-y-1 p-1.5">
        <input
          data-testid={`workflow-node-title-${index}`}
          aria-label={`Title of card ${index + 1}`}
          value={node.title}
          maxLength={MAX_STEP_TITLE_CHARS}
          placeholder={`${meta.label} — one idea`}
          onChange={(event) => onUpdate(node.id, { title: event.target.value })}
          onFocus={() => onSelect(node.id)}
          className="w-full rounded border border-transparent bg-transparent px-1 py-0.5 text-[12px] font-semibold outline-none hover:bg-raise focus:border-line focus:bg-canvas"
          style={{ color: 'var(--text)' }}
        />
        <textarea
          data-testid={`workflow-node-detail-${index}`}
          aria-label={`Detail of card ${index + 1}`}
          value={node.detail}
          rows={2}
          maxLength={MAX_STEP_DETAIL_CHARS}
          placeholder={meta.hint}
          onChange={(event) => onUpdate(node.id, { detail: event.target.value })}
          onFocus={() => onSelect(node.id)}
          className="w-full resize-y rounded border border-transparent bg-transparent px-1 py-0.5 font-mono text-[11px] leading-snug outline-none hover:bg-raise focus:border-line focus:bg-canvas"
          style={{ color: 'var(--muted)' }}
        />
        {meta.measured && (
          <input
            data-testid={`workflow-node-unit-${index}`}
            aria-label={`Unit of card ${index + 1}`}
            value={node.unit ?? ''}
            maxLength={MAX_STEP_UNIT_CHARS}
            placeholder="unit — A, V, rad/s"
            onChange={(event) => onUpdate(node.id, { unit: event.target.value })}
            onFocus={() => onSelect(node.id)}
            className="w-24 rounded border border-transparent bg-transparent px-1 py-0.5 font-mono text-[10.5px] outline-none hover:bg-raise focus:border-line focus:bg-canvas"
            style={{ color: 'var(--body)' }}
          />
        )}
      </div>

      {WORKFLOW_SIDES.map((side) => {
        const source = linking?.nodeId === node.id && linking.side === side;
        const target = Boolean(linking && linking.nodeId !== node.id);
        return (
          <button
            key={side}
            type="button"
            data-testid={`workflow-node-port-${side}-${index}`}
            data-port={side}
            aria-label={`${side} connection on card ${number}: drag an arrow from here, or drop one here`}
            title={
              target
                ? `Connect the arrow to the ${side}`
                : `Drag an arrow from the ${side} of this card`
            }
            onPointerDown={(event) => onLinkStart(event, node, side)}
            className={`absolute z-20 flex h-5 w-5 touch-none cursor-crosshair items-center justify-center rounded-full border border-accent bg-panel ${PORT_POSITION[side]} ${
              source || target ? 'ring-2 ring-accent/35' : ''
            }`}
          >
            <span className="h-2 w-2 rounded-full bg-accent" aria-hidden="true" />
          </button>
        );
      })}
    </div>
  );
}
