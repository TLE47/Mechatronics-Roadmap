import type { PointerEvent as ReactPointerEvent } from 'react';
import { Trash2 } from 'lucide-react';
import {
  KIND_META,
  MAX_BRANCH_CONDITION_CHARS,
  MAX_STEP_DETAIL_CHARS,
  MAX_STEP_TITLE_CHARS,
  MAX_STEP_UNIT_CHARS,
  NODE_SHAPE,
  NODE_WIDTH,
  type NodeShape,
  type SocketKinds,
  type WorkflowIssue,
  type WorkflowNode,
  type WorkflowSide,
} from '../../workflow.ts';
import { iconForKind } from '../workflowIcons.ts';
import { nudgeCard } from './cardNudge.ts';
import { WorkflowPorts } from './WorkflowPorts.tsx';
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

/**
 * How a kind's plate is drawn: the same silhouette a flowchart gives that meaning.
 *
 * The cuts are 14 px and the fields are indented past them, because a card is a form — a diamond
 * big enough to hold three inputs would be a 400 px point. The plate says what the card is; the
 * fields stay readable. `rect` keeps the border and ring it always had, so no recorded card moves.
 */
const SHAPE_CLIP: Partial<Record<NodeShape, string>> = {
  data: 'polygon(14px 0, 100% 0, calc(100% - 14px) 100%, 0 100%)',
  gate: 'polygon(14px 0, calc(100% - 14px) 0, 100% 14px, 100% calc(100% - 14px), calc(100% - 14px) 100%, 14px 100%, 0 calc(100% - 14px), 0 14px)',
  diamond: 'polygon(50% 0, 100% 50%, 50% 100%, 0 50%)',
};
const SHAPE_ROUND: Record<NodeShape, string> = {
  rect: 'rounded-xl',
  stadium: 'rounded-[32px]',
  data: '',
  gate: '',
  diamond: '',
  bar: '',
};
/** A cut or diamond corner leaves the outer strip empty, so those fields move inward. */
const SHAPE_INSET: Partial<Record<NodeShape, string>> = {
  data: 'px-4',
  gate: 'px-4',
  diamond: 'px-9',
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
  /** What is plugged into each of this card's four dots, read off the document's arrows. */
  sockets: SocketKinds | undefined;
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
  sockets,
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
  const shape = NODE_SHAPE[node.kind];
  const shaped = shape !== 'rect';
  const clip = SHAPE_CLIP[shape];
  const inset = SHAPE_INSET[shape] ?? '';
  const frame = selected
    ? 'border-accent ring-2 ring-accent/25'
    : issue
      ? 'border-amber/70'
      : 'border-line';

  // A resting card sits under the connector layer (`z-[25]`): a curve that crosses a card must be
  // seen, because its arrowhead is the only thing that says where it lands. A card being dragged
  // rises above the arrows it is crossing.
  return (
    <div
      data-node-id={node.id}
      data-testid={`workflow-node-${index}`}
      data-step={number}
      data-kind={node.kind}
      data-shape={shape}
      style={{ left: position.x, top: position.y, width: NODE_WIDTH }}
      className={`absolute z-20 cursor-default ${
        shaped ? '' : `rounded-xl border bg-panel shadow-sm ${frame}`
      } ${dragging ? (shaped ? 'z-30' : 'z-30 shadow-lg') : ''}`}
      onPointerDown={(event) => onLinkLand(event, node)}
    >
      {shaped && (
        <>
          <div
            aria-hidden="true"
            style={clip ? { clipPath: clip } : undefined}
            className={`pointer-events-none absolute inset-0 drop-shadow-sm ${SHAPE_ROUND[shape]} ${
              selected ? 'bg-accent' : issue ? 'bg-amber/70' : 'bg-line'
            }`}
          />
          <div
            aria-hidden="true"
            style={clip ? { clipPath: clip } : undefined}
            className={`pointer-events-none absolute bg-panel ${SHAPE_ROUND[shape]} ${
              selected ? 'inset-[2px]' : 'inset-px'
            }`}
          />
        </>
      )}
      <div
        data-testid={`workflow-node-drag-${index}`}
        role="group"
        tabIndex={0}
        aria-label={`Card ${number}, ${meta.label}. Drag to move; arrow keys nudge it.`}
        onPointerDown={(event) => onDragStart(event, node)}
        onKeyDown={(event) => nudgeCard(event, node, onMove, onSelect)}
        className={`flex cursor-grab touch-none items-center gap-1.5 border-b border-line-soft py-1.5 select-none focus-visible:outline-2 focus-visible:outline-accent ${
          shaped ? inset : 'rounded-t-xl bg-canvas px-2'
        }`}
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

      <div className={`space-y-1 ${shaped ? `${inset} py-1.5` : 'p-1.5'}`}>
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
        {node.kind === 'branch' && (
          <input
            data-testid={`workflow-node-condition-${index}`}
            aria-label={`Condition on card ${number}'s arrows`}
            value={node.condition ?? ''}
            maxLength={MAX_BRANCH_CONDITION_CHARS}
            placeholder="condition — speed > 0.5"
            onChange={(event) => onUpdate(node.id, { condition: event.target.value })}
            onFocus={() => onSelect(node.id)}
            className="w-full rounded border border-transparent bg-transparent px-1 py-0.5 font-mono text-[10.5px] outline-none hover:bg-raise focus:border-line focus:bg-canvas"
            style={{ color: 'var(--accent)' }}
          />
        )}
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

      <WorkflowPorts
        node={node}
        index={index}
        number={number}
        sockets={sockets}
        linking={linking}
        onLinkStart={onLinkStart}
      />
    </div>
  );
}
