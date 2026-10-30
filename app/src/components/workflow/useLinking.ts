import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { WORKFLOW_SIDES, type WorkflowNode, type WorkflowSide } from '../../workflow.ts';
import { cardHeight, facingSide } from './canvasGeometry.ts';

/**
 * Drawing one arrow (`components/workflow/useLinking.ts`).
 *
 * Two ways to draw it, one state machine. Drag from one dot to another (a mouse), or tap the first
 * then the second (a phone, or an unsteady hand). Every side is both a source and a target. Escape,
 * or a release on empty grid, cancels; a release on its own dot stays armed for the second tap.
 *
 * The choice of target side when the pointer lands on a card's body rather than its dot lives here
 * too, because it is the same question the gesture is answering.
 */

export interface LinkDraft {
  nodeId: string;
  side: WorkflowSide;
}

interface ConnectionTarget {
  nodeId: string;
  /** The dot under the pointer, or null when the pointer is on the card body. */
  side: WorkflowSide | null;
}

function connectionTargetAt(clientX: number, clientY: number): ConnectionTarget | null {
  const element = document.elementFromPoint(clientX, clientY) as HTMLElement | null;
  const port = element?.closest<HTMLElement>('[data-port]');
  const card =
    port?.closest<HTMLElement>('[data-node-id]') ?? element?.closest<HTMLElement>('[data-node-id]');
  const nodeId = card?.getAttribute('data-node-id');
  if (!nodeId) return null;
  const raw = port?.getAttribute('data-port');
  const side = raw && (WORKFLOW_SIDES as readonly string[]).includes(raw) ? (raw as WorkflowSide) : null;
  return { nodeId, side };
}

export interface Linking {
  linking: LinkDraft | null;
  /** The pointer in canvas pixels, for the dashed preview. */
  cursor: { x: number; y: number };
  startLink: (event: ReactPointerEvent, node: WorkflowNode, side: WorkflowSide) => void;
  /** A press on a card's body: the other way to name an arrow's target. */
  landOnCard: (event: ReactPointerEvent, node: WorkflowNode) => void;
}

export function useLinking({
  toCanvas,
  byId,
  heights,
  onConnect,
  onSelect,
}: {
  toCanvas: (clientX: number, clientY: number) => { x: number; y: number };
  byId: Map<string, WorkflowNode>;
  heights: Record<string, number>;
  onConnect: (from: string, to: string, fromSide: WorkflowSide, toSide: WorkflowSide) => void;
  onSelect: (id: string | null) => void;
}): Linking {
  const [linking, setLinking] = useState<LinkDraft | null>(null);
  const [cursor, setCursor] = useState({ x: 0, y: 0 });
  const linkTravelled = useRef(false);

  /**
   * A port's pointer down. With an arrow already armed this is the target, so it completes at this
   * side; otherwise it starts one.
   */
  const startLink = (event: ReactPointerEvent, node: WorkflowNode, side: WorkflowSide) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    if (linking) {
      if (linking.nodeId === node.id) {
        setLinking(null);
        return;
      }
      onConnect(linking.nodeId, node.id, linking.side, side);
      setLinking(null);
      return;
    }
    const point = toCanvas(event.clientX, event.clientY);
    linkTravelled.current = false;
    setCursor(point);
    setLinking({ nodeId: node.id, side });
    onSelect(node.id);
  };

  /** The card body is a generous target: land on the side that faces the source. */
  const landOnCard = (event: ReactPointerEvent, node: WorkflowNode) => {
    if (!linking) return;
    if (linking.nodeId === node.id) {
      setLinking(null);
      return;
    }
    const from = byId.get(linking.nodeId);
    if (!from) {
      setLinking(null);
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    onConnect(
      linking.nodeId,
      node.id,
      linking.side,
      facingSide(from, node, cardHeight(heights, from.id), cardHeight(heights, node.id))
    );
    setLinking(null);
  };

  useEffect(() => {
    if (!linking) return;
    const move = (event: PointerEvent) => {
      linkTravelled.current = true;
      setCursor(toCanvas(event.clientX, event.clientY));
    };
    const up = (event: PointerEvent) => {
      const target = connectionTargetAt(event.clientX, event.clientY);
      if (target && target.nodeId !== linking.nodeId) {
        const from = byId.get(linking.nodeId);
        const to = byId.get(target.nodeId);
        if (!from || !to) {
          setLinking(null);
          return;
        }
        const toSide =
          target.side ?? facingSide(from, to, cardHeight(heights, from.id), cardHeight(heights, to.id));
        onConnect(linking.nodeId, target.nodeId, linking.side, toSide);
        setLinking(null);
        return;
      }
      // Released on its own dot: stay armed for the phone's tap-then-tap. Released on the grid, or
      // after a drag that ended nowhere: cancel, because a half-drawn arrow left armed is a trap.
      if (target === null || linkTravelled.current) setLinking(null);
    };
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setLinking(null);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('keydown', key);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('keydown', key);
    };
  }, [linking, onConnect, byId, heights]);

  return { linking, cursor, startLink, landOnCard };
}
