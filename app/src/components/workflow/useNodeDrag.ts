import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { MAX_NODE_COORD, type WorkflowNode } from '../../workflow.ts';

/**
 * Dragging cards (`components/workflow/useNodeDrag.ts`).
 *
 * One card by its header, or a frame by its name — the frame's members move rigidly, so the shape a
 * learner drew survives the drag instead of collapsing against the paper's edges. The only state
 * here is the pixels of a drag in progress: positions are reported to the document once, on release,
 * and never persisted mid-gesture. A drag is a window gesture, so the pointer may leave the card,
 * the surface or the window and the cards still follow it.
 */

/** The grid documents snap to, so two drags cannot leave cards one pixel apart. */
const DRAG_STEP = 4;

export interface NodeMove {
  id: string;
  x: number;
  y: number;
}

export interface NodeDrag {
  /** The cards the pointer holds, or null. */
  dragIds: string[] | null;
  /** Their positions while dragged, keyed by card id. */
  live: Map<string, { x: number; y: number }> | null;
  /** One card by its header, or a frame's members together: both are one drag of a list. */
  startDrag: (event: ReactPointerEvent, nodes: WorkflowNode | readonly WorkflowNode[]) => void;
}

export function useNodeDrag({
  toCanvas,
  onMoveMany,
}: {
  toCanvas: (clientX: number, clientY: number) => { x: number; y: number };
  onMoveMany: (moves: NodeMove[]) => void;
}): NodeDrag {
  const [dragIds, setDragIds] = useState<string[] | null>(null);
  const [live, setLive] = useState<Map<string, { x: number; y: number }> | null>(null);
  const start = useRef<{ x: number; y: number } | null>(null);
  const starts = useRef<NodeMove[]>([]);
  const delta = useRef({ dx: 0, dy: 0 });
  const moved = useRef(false);
  /** The window listeners of the drag in hand, so its own release can take them off again. */
  const detach = useRef<(() => void) | null>(null);

  const begin = (event: ReactPointerEvent, nodes: readonly WorkflowNode[]) => {
    if (event.button !== 0 || !nodes.length) return;
    event.preventDefault();
    event.stopPropagation();
    start.current = toCanvas(event.clientX, event.clientY);
    starts.current = nodes.map((node) => ({ id: node.id, x: node.x, y: node.y }));
    delta.current = { dx: 0, dy: 0 };
    moved.current = false;
    setLive(new Map(nodes.map((node) => [node.id, { x: node.x, y: node.y }])));
    setDragIds(nodes.map((node) => node.id));

    // The listeners go on at the press, not in an effect after the render it causes: a quick drag
    // can be released before that render commits, and a release nobody heard leaves the card drawn
    // where the document does not say it is.
    const move = (pointerEvent: PointerEvent) => {
      const origin = start.current;
      if (!origin) return;
      const point = toCanvas(pointerEvent.clientX, pointerEvent.clientY);
      const held = starts.current;
      const minX = Math.min(...held.map((node) => node.x));
      const minY = Math.min(...held.map((node) => node.y));
      const maxX = Math.max(...held.map((node) => node.x));
      const maxY = Math.max(...held.map((node) => node.y));
      // The grid first, then the paper: a delta that would push any member out of bounds is
      // clamped as one number, so the frame keeps its shape against every edge.
      const dx = Math.min(
        MAX_NODE_COORD - maxX,
        Math.max(-minX, Math.round((point.x - origin.x) / DRAG_STEP) * DRAG_STEP)
      );
      const dy = Math.min(
        MAX_NODE_COORD - maxY,
        Math.max(-minY, Math.round((point.y - origin.y) / DRAG_STEP) * DRAG_STEP)
      );
      delta.current = { dx, dy };
      moved.current = true;
      setLive(new Map(held.map((node) => [node.id, { x: node.x + dx, y: node.y + dy }])));
    };
    const finish = () => {
      const { dx, dy } = delta.current;
      // A press that never moved is a selection, not a move: it must not write a new document.
      if (moved.current) {
        onMoveMany(starts.current.map((node) => ({ id: node.id, x: node.x + dx, y: node.y + dy })));
      }
      start.current = null;
      starts.current = [];
      moved.current = false;
      setLive(null);
      setDragIds(null);
      detach.current?.();
      detach.current = null;
    };
    detach.current?.();
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', finish);
    window.addEventListener('pointercancel', finish);
    detach.current = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', finish);
      window.removeEventListener('pointercancel', finish);
    };
  };

  const startDrag = (event: ReactPointerEvent, nodes: WorkflowNode | readonly WorkflowNode[]) =>
    begin(event, Array.isArray(nodes) ? nodes : [nodes]);

  // A tab hidden or unmounted mid-drag still takes its window listeners with it.
  useEffect(() => () => detach.current?.(), []);

  return { dragIds, live, startDrag };
}
