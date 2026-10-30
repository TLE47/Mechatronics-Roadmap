import type { PointerEvent as ReactPointerEvent } from 'react';
import {
  PORT_LABEL,
  WORKFLOW_SIDES,
  type PortKind,
  type SocketKinds,
  type WorkflowNode,
  type WorkflowSide,
} from '../../workflow.ts';
import type { LinkDraft } from './useLinking.ts';

/**
 * The four connection dots on a card's edge (`components/workflow/WorkflowPorts.tsx`).
 *
 * A dot is both an inlet and an outlet, so every shape of flow needs no scrolling around to draw
 * bottom-up or sideways. The letter is the socket the arrows already plug in (I, O, D, P, M), which
 * survives greyscale and every palette; an untouched dot keeps the plain bead every canvas drawn
 * before sockets existed.
 *
 * The component is shared by the editable card and the fork/join bar: two plates, one connector
 * geometry, so a bar's dots cannot end up in a different place from a card's.
 */

const PORT_POSITION: Record<WorkflowSide, string> = {
  left: 'left-0 top-1/2 -translate-x-1/2 -translate-y-1/2',
  right: 'right-0 top-1/2 translate-x-1/2 -translate-y-1/2',
  top: 'top-0 left-1/2 -translate-x-1/2 -translate-y-1/2',
  bottom: 'bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2',
};

function PortGlyph({ kind }: { kind: PortKind | null }) {
  if (!kind) return <circle cx="5" cy="5" r="2.6" fill="currentColor" />;
  return (
    <text x="5" y="5" textAnchor="middle" dominantBaseline="central" fontSize="7" fill="currentColor">
      {PORT_LABEL[kind][0]}
    </text>
  );
}

export interface WorkflowPortsProps {
  node: WorkflowNode;
  index: number;
  number: number;
  sockets: SocketKinds | undefined;
  linking: LinkDraft | null;
  onLinkStart: (event: ReactPointerEvent, node: WorkflowNode, side: WorkflowSide) => void;
}

export function WorkflowPorts({
  node,
  index,
  number,
  sockets,
  linking,
  onLinkStart,
}: WorkflowPortsProps) {
  return (
    <>
      {WORKFLOW_SIDES.map((side) => {
        const source = linking?.nodeId === node.id && linking.side === side;
        const target = Boolean(linking && linking.nodeId !== node.id);
        const plugged = sockets?.[side] ?? null;
        const what = plugged ? `${PORT_LABEL[plugged]} socket` : 'connection';
        return (
          <button
            key={side}
            type="button"
            data-testid={`workflow-node-port-${side}-${index}`}
            data-port={side}
            data-port-kind={plugged ?? undefined}
            aria-label={`${side} ${what} on card ${number}: drag an arrow from here, or drop one here`}
            title={
              target
                ? `Connect the arrow to the ${side}${plugged ? ` (${PORT_LABEL[plugged]})` : ''}`
                : `Drag an arrow from the ${side}${plugged ? ` ${PORT_LABEL[plugged]}` : ''} of this card`
            }
            onPointerDown={(event) => onLinkStart(event, node, side)}
            className={`absolute z-20 flex h-5 w-5 touch-none cursor-crosshair items-center justify-center rounded-full border border-accent bg-panel ${PORT_POSITION[side]} ${
              source || target ? 'ring-2 ring-accent/35' : ''
            }`}
          >
            <svg viewBox="0 0 10 10" className="h-2.5 w-2.5 text-accent" aria-hidden="true">
              <PortGlyph kind={plugged} />
            </svg>
          </button>
        );
      })}
    </>
  );
}
