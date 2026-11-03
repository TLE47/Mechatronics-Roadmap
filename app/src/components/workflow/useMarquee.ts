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
  /**
   * Starts a box when the press is on paper; false leaves the press to whoever else wants it.
   * `allowStructural` is the armed frame/lane draw, which may begin over a frame or lane.
   */
  start: (event: ReactPointerEvent, allowStructural?: boolean) => boolean;
  move: (event: ReactPointerEvent) => void;
  finish: () => void;
}

export function useMarquee({
  toCanvas,
  onDone,
}: {
  toCanvas: (clientX: number, clientY: number) => { x: number; y: number };
  onDone: (rect: CanvasRect, dragged: boolean) => void;
}): Marquee {
  const [rect, setRect] = useState<CanvasRect | null>(null);
  const box = useRef<CanvasRect | null>(null);
  const origin = useRef<{ x: number; y: number } | null>(null);

  const start = (event: ReactPointerEvent, allowStructural = false) => {
    if (event.button !== 0) return false;
    const target = event.target as HTMLElement;
    // A chip is a control, not paper: armed or not, pressing it must name or move the frame rather
    // than start a box on top of it. Everything with its own gesture is skipped too. A frame's
    // border is paper only for an armed frame/lane draw; a plain selection must leave the border
    // to the frame's own drag.
    if (
      target.closest(
        'button, input, textarea, select, a, [data-node-id], [data-edge-inspector], [data-frame-chip], [data-lane-chip]'
      ) ||
      (!allowStructural && target.closest('[data-testid^="workflow-group-"]'))
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
    if (!origin.current) return;
    const drawn = box.current && normalizeRect(box.current);
    origin.current = null;
    box.current = null;
    setRect(null);
    // A press with no drag is a click on the paper: the caller clears the selection, rather than
    // turning a zero-size box into an empty frame.
    onDone(drawn ?? { x: 0, y: 0, width: 0, height: 0 }, Boolean(drawn && Math.min(drawn.width, drawn.height) >= 12));
  };

  return { rect, start, move, finish };
}
