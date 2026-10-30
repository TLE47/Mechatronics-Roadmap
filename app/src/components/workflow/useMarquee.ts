import { useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { normalizeRect, type CanvasRect } from './canvasGeometry.ts';

/**
 * Drawing a frame around cards (`components/workflow/useMarquee.ts`).
 *
 * Press **Group**, then drag a box across the cards that belong together; the box is reported once,
 * on release, and the panel turns it into a named frame. The gesture is armed rather than always on,
 * because the same paper already pans: on a phone a plain drag has to keep scrolling, so grouping
 * has to be a choice. Shift-drag is the mouse shortcut for the same choice.
 *
 * A press that starts on a card, a dot or a control is not a box — it belongs to that control — and
 * `start` says so, so the canvas can fall through to its pan. The surface captures the pointer, so a
 * box keeps drawing when the pointer leaves the paper.
 */

export interface Marquee {
  rect: CanvasRect | null;
  /** Starts a box when the press is on empty paper; false leaves the press to whoever else wants it. */
  start: (event: ReactPointerEvent) => boolean;
  move: (event: ReactPointerEvent) => void;
  finish: () => void;
}

export function useMarquee({
  toCanvas,
  onDone,
}: {
  toCanvas: (clientX: number, clientY: number) => { x: number; y: number };
  onDone: (rect: CanvasRect) => void;
}): Marquee {
  const [rect, setRect] = useState<CanvasRect | null>(null);
  const box = useRef<CanvasRect | null>(null);
  const origin = useRef<{ x: number; y: number } | null>(null);

  const start = (event: ReactPointerEvent) => {
    if (event.button !== 0) return false;
    const target = event.target as HTMLElement;
    // A frame's chip is a control, not paper: armed or not, pressing it must name or move the
    // frame rather than start a box on top of it. Everything else with its own gesture is skipped
    // too.
    if (
      target.closest(
        'button, input, textarea, select, a, [data-node-id], [data-edge-inspector], [data-frame-chip]'
      )
    ) {
      return false;
    }
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    const point = toCanvas(event.clientX, event.clientY);
    origin.current = point;
    box.current = { x: point.x, y: point.y, width: 0, height: 0 };
    setRect(box.current);
    return true;
  };

  const move = (event: ReactPointerEvent) => {
    const from = origin.current;
    if (!from) return;
    const point = toCanvas(event.clientX, event.clientY);
    box.current = { x: from.x, y: from.y, width: point.x - from.x, height: point.y - from.y };
    setRect(normalizeRect(box.current));
  };

  const finish = () => {
    const drawn = box.current && normalizeRect(box.current);
    origin.current = null;
    box.current = null;
    setRect(null);
    // A press with no drag is a click on the paper, not a frame around nothing.
    if (drawn && Math.min(drawn.width, drawn.height) >= 12) onDone(drawn);
  };

  return { rect, start, move, finish };
}
