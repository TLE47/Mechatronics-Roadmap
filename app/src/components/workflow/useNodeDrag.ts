import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { MAX_NODE_COORD, type WorkflowNode } from '../../workflow.ts';
import { clamp } from './canvasGeometry.ts';

/**
 * Dragging one card (`components/workflow/useNodeDrag.ts`).
 *
 * The only state here is the pixels of a drag in progress: the position is reported to the document
 * once, on release, and never persisted mid-gesture. A drag is a window gesture, so the pointer may
 * leave the card, the surface or the window and the card still follows it.
 */

const DRAG_STEP = 4;

export interface NodeDrag {
  dragId: string | null;
  /** The card's position while the pointer holds it, before anything is written to the document. */
  livePosition: { x: number; y: number } | null;
  startDrag: (event: ReactPointerEvent, node: WorkflowNode) => void;
}

export function useNodeDrag({
  toCanvas,
  onMove,
  onSelect,
}: {
  toCanvas: (clientX: number, clientY: number) => { x: number; y: number };
  onMove: (id: string, x: number, y: number) => void;
  onSelect: (id: string | null) => void;
}): NodeDrag {
  const [dragId, setDragId] = useState<string | null>(null);
  const dragOffset = useRef({ dx: 0, dy: 0 });
  const dragged = useRef<{ x: number; y: number } | null>(null);
  const dragMoved = useRef(false);
  const [livePosition, setLivePosition] = useState<{ x: number; y: number } | null>(null);

  const startDrag = (event: ReactPointerEvent, node: WorkflowNode) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const point = toCanvas(event.clientX, event.clientY);
    dragOffset.current = { dx: point.x - node.x, dy: point.y - node.y };
    dragged.current = { x: node.x, y: node.y };
    dragMoved.current = false;
    setLivePosition({ x: node.x, y: node.y });
    setDragId(node.id);
    onSelect(node.id);
  };

  useEffect(() => {
    if (!dragId) return;
    const move = (event: PointerEvent) => {
      const point = toCanvas(event.clientX, event.clientY);
      const x = clamp(
        Math.round((point.x - dragOffset.current.dx) / DRAG_STEP) * DRAG_STEP,
        0,
        MAX_NODE_COORD
      );
      const y = clamp(
        Math.round((point.y - dragOffset.current.dy) / DRAG_STEP) * DRAG_STEP,
        0,
        MAX_NODE_COORD
      );
      dragged.current = { x, y };
      dragMoved.current = true;
      setLivePosition({ x, y });
    };
    const finish = () => {
      const position = dragged.current;
      // A press that never moved is a selection, not a move: it must not write a new document.
      if (position && dragMoved.current) onMove(dragId, position.x, position.y);
      dragged.current = null;
      setLivePosition(null);
      setDragId(null);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', finish);
    window.addEventListener('pointercancel', finish);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', finish);
      window.removeEventListener('pointercancel', finish);
    };
  }, [dragId, onMove]);

  return { dragId, livePosition, startDrag };
}
