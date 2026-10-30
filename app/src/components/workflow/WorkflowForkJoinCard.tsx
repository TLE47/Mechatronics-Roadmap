import type { PointerEvent as ReactPointerEvent } from 'react';
import { Trash2 } from 'lucide-react';
import { KIND_META, NODE_WIDTH, type SocketKinds, type WorkflowIssue, type WorkflowNode } from '../../workflow.ts';
import { iconForKind } from '../workflowIcons.ts';
import { nudgeCard } from './cardNudge.ts';
import { WorkflowPorts } from './WorkflowPorts.tsx';
import type { LinkDraft } from './useLinking.ts';

/**
 * A fork or join bar (`components/workflow/WorkflowForkJoinCard.tsx`).
 *
 * UML draws concurrency as a heavy bar, not a box with prose, and the bar is the one element whose
 * meaning is its shape. So this card has no title, detail or unit fields — a fork says "these run
 * together" and a join says "wait here", nothing else — and validation does not ask it for a title.
 * It keeps the card's drag header, delete button, arrow-key nudge and four connection dots, so it is
 * moved, wired and removed exactly like every other element.
 *
 * The label is the bar's own name in both exports (`[[Fork]]`), which is why it is a card rather than
 * a bare line: a bare line would have no id to draw arrows from and no name to print.
 */

export interface WorkflowForkJoinCardProps {
  node: WorkflowNode;
  index: number;
  number: number;
  issue: WorkflowIssue | undefined;
  selected: boolean;
  position: { x: number; y: number };
  dragging: boolean;
  linking: LinkDraft | null;
  sockets: SocketKinds | undefined;
  onSelect: (id: string) => void;
  onMove: (id: string, x: number, y: number) => void;
  onRemove: (id: string) => void;
  onDragStart: (event: ReactPointerEvent, node: WorkflowNode) => void;
  onLinkStart: (event: ReactPointerEvent, node: WorkflowNode, side: 'left' | 'right' | 'top' | 'bottom') => void;
  onLinkLand: (event: ReactPointerEvent, node: WorkflowNode) => void;
}

export function WorkflowForkJoinCard({
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
  onRemove,
  onDragStart,
  onLinkStart,
  onLinkLand,
}: WorkflowForkJoinCardProps) {
  const Icon = iconForKind(node.kind);
  const meta = KIND_META[node.kind];
  const frame = selected ? 'border-accent ring-2 ring-accent/25' : issue ? 'border-amber/70' : 'border-line';
  return (
    <div
      data-node-id={node.id}
      data-testid={`workflow-node-${index}`}
      data-step={number}
      data-kind={node.kind}
      data-shape="bar"
      style={{ left: position.x, top: position.y, width: NODE_WIDTH }}
      className={`absolute z-20 cursor-default rounded-lg border bg-panel shadow-sm ${frame} ${
        dragging ? 'z-30 shadow-lg' : ''
      }`}
      onPointerDown={(event) => onLinkLand(event, node)}
    >
      <div
        data-testid={`workflow-node-drag-${index}`}
        role="group"
        tabIndex={0}
        aria-label={`${meta.label} ${number}. Drag to move; arrow keys nudge it.`}
        onPointerDown={(event) => onDragStart(event, node)}
        onKeyDown={(event) => nudgeCard(event, node, onMove, onSelect)}
        className="flex cursor-grab touch-none items-center gap-1.5 rounded-t-lg border-b border-line-soft bg-canvas px-2 py-1 select-none focus-visible:outline-2 focus-visible:outline-accent"
      >
        <Icon className="h-3 w-3 shrink-0 text-accent" aria-hidden="true" />
        <span className="truncate font-mono text-[10px] uppercase tracking-[0.1em] text-accent">
          {meta.label}
        </span>
        <span className="ml-auto font-mono text-[10px] tabular-nums text-faint">{number}</span>
        <button
          type="button"
          data-testid={`workflow-node-delete-${index}`}
          aria-label={`Delete ${meta.label.toLowerCase()} ${number}`}
          title="Delete this bar and its arrows"
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
      <div className="px-2 py-2" aria-hidden="true">
        <div className="h-2.5 w-full rounded-sm bg-accent/80" />
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
