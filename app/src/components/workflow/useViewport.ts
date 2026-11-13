import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from 'react';
import { nodeWidth, type WorkflowNode } from '../../workflow.ts';
import { clamp } from './canvasGeometry.ts';

/**
 * The canvas's viewport (`components/workflow/useViewport.ts`).
 *
 * Everything that is a lens on the graph rather than a coordinate in it: the view scale, the fit
 * control, the scrolled offset, and the two ways to pan (drag empty paper, or arrows on the focused
 * surface). None of it is written to the document, so a reload can never remember a zoom.
 */

/** A 24-card column is ~4,100 px tall; the map view may shrink it to a sixth, not to a speck. */
const FIT_MIN_SCALE = 0.1;
const FIT_PAD = 16;
const PAN_STEP = 40;
const PAN_STEP_FAST = 160;

export interface CanvasViewport {
  surfaceRef: RefObject<HTMLDivElement | null>;
  gridRef: RefObject<HTMLDivElement | null>;
  scale: number;
  panning: boolean;
  /** The grid's canvas-pixel size: the spacer reserves `extents × scale`. */
  extents: { width: number; height: number };
  /** A screen point in canvas pixels, scroll offsets and the view scale included. */
  toCanvas: (clientX: number, clientY: number) => { x: number; y: number };
  fitOrReset: () => void;
  startPan: (event: ReactPointerEvent) => void;
  panWithKeys: (event: ReactKeyboardEvent) => void;
}

export function useViewport(
  nodes: WorkflowNode[],
  onSelect: (id: string | null) => void
): CanvasViewport {
  const surfaceRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  /** View scale, not document data: a fit is a lens on the graph, never a coordinate written to it. */
  const [scale, setScale] = useState(1);
  const viewTarget = useRef<{ left: number; top: number } | null>(null);
  /** Whether the learner's last lens was Fit: a resize re-fits a fitted view, never a 100% one. */
  const fitted = useRef(false);
  const [viewSeq, setViewSeq] = useState(0);
  const panStart = useRef<{ x: number; y: number; left: number; top: number } | null>(null);
  const [panning, setPanning] = useState(false);

  const extents = useMemo(() => {
    // The grid is only as wide as the cards need: a 380 px split must not get a horizontal
    // scrollbar for paper nobody drew on.
    let width = nodeWidth(nodes[0] ?? { width: undefined }) + 48;
    let height = 300;
    for (const node of nodes) {
      width = Math.max(width, node.x + nodeWidth(node) + 48);
      // A card is guessed at 200 px, and a frame's name chip hangs 24 px below its box: without
      // that air under the last card, the chip scrolls out of the paper and its name and × are
      // unreachable.
      height = Math.max(height, node.y + 200 + 40);
    }
    return { width, height };
  }, [nodes]);

  const toCanvas = (clientX: number, clientY: number) => {
    const surface = surfaceRef.current;
    if (!surface) return { x: 0, y: 0 };
    const rect = surface.getBoundingClientRect();
    return {
      x: (clientX - rect.left + surface.scrollLeft) / scale,
      y: (clientY - rect.top + surface.scrollTop) / scale,
    };
  };

  // A fit is applied after the scaled spacer has laid out, or the scroll would be clamped to the
  // old size. One target, written by the press and consumed once.
  useEffect(() => {
    const target = viewTarget.current;
    if (!target) return;
    viewTarget.current = null;
    const surface = surfaceRef.current;
    if (!surface) return;
    surface.scrollLeft = Math.max(0, target.left);
    surface.scrollTop = Math.max(0, target.top);
  }, [viewSeq, scale]);

  /**
   * Fit every card in the canvas, or return to 100%.
   *
   * One control rather than two: while the map is smaller than life it says 100%, and pressing it
   * keeps the viewport's centre so the card being read does not jump away. The button is a lens, not
   * a document edit — no position, zoom or lesson field is written.
   */
  /**
   * The scale and centre that frame every card in the surface as it is now, or null when there is
   * nothing to frame. Read from the DOM rather than from the document: a fit is a lens.
   */
  const measureFit = () => {
    const surface = surfaceRef.current;
    const grid = gridRef.current;
    if (!surface || !grid) return null;
    const cards = Array.from(grid.querySelectorAll<HTMLElement>('[data-node-id]'));
    if (!cards.length) return null;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const card of cards) {
      minX = Math.min(minX, card.offsetLeft);
      minY = Math.min(minY, card.offsetTop);
      maxX = Math.max(maxX, card.offsetLeft + card.offsetWidth);
      maxY = Math.max(maxY, card.offsetTop + card.offsetHeight);
    }
    const fit = Math.min(
      (surface.clientWidth - FIT_PAD * 2) / Math.max(1, maxX - minX),
      (surface.clientHeight - FIT_PAD * 2) / Math.max(1, maxY - minY)
    );
    const next = clamp(fit, FIT_MIN_SCALE, 1);
    return {
      scale: next,
      left: ((minX + maxX) / 2) * next - surface.clientWidth / 2,
      top: ((minY + maxY) / 2) * next - surface.clientHeight / 2,
    };
  };

  /** Apply that lens. Returns false when there is nothing on the paper to frame. */
  const applyFit = () => {
    const fit = measureFit();
    if (!fit) return false;
    setScale(fit.scale);
    viewTarget.current = { left: fit.left, top: fit.top };
    setViewSeq((seq) => seq + 1);
    return true;
  };
  // The resize observer below is mounted once, so it reads the current `applyFit` through a ref
  // rather than closing over the first render's cards.
  const applyFitRef = useRef(applyFit);
  applyFitRef.current = applyFit;

  const fitOrReset = () => {
    const surface = surfaceRef.current;
    if (!surface) return;
    if (scale < 1) {
      const centreX = (surface.scrollLeft + surface.clientWidth / 2) / scale;
      const centreY = (surface.scrollTop + surface.clientHeight / 2) / scale;
      setScale(1);
      fitted.current = false;
      viewTarget.current = {
        left: centreX - surface.clientWidth / 2,
        top: centreY - surface.clientHeight / 2,
      };
      setViewSeq((seq) => seq + 1);
      return;
    }
    if (applyFit()) fitted.current = true;
  };

  /**
   * A fit is a lens on the surface, so it has to be a lens on the *current* surface.
   *
   * Resizing the pane (the bottom grip, a split divider, the window) used to leave the diagram at the
   * scale it had been fitted to, so a bigger canvas got a bigger page of empty paper and the cards'
   * text stayed the size it was. While the view is a fit, a resize re-measures it, and the cards - and
   * their text - grow and shrink with the room they are given. At 100% nothing happens, because life
   * size is life size.
   */
  useEffect(() => {
    const surface = surfaceRef.current;
    if (!surface || typeof ResizeObserver === 'undefined') return;
    let width = surface.clientWidth;
    let height = surface.clientHeight;
    let frame = 0;
    const observer = new ResizeObserver(() => {
      const nextWidth = surface.clientWidth;
      const nextHeight = surface.clientHeight;
      // A scrollbar appearing changes the surface by a few pixels; that is not a resize to re-fit.
      if (Math.abs(nextWidth - width) < 2 && Math.abs(nextHeight - height) < 2) return;
      width = nextWidth;
      height = nextHeight;
      if (!fitted.current) return;
      if (frame) cancelAnimationFrame(frame);
      // A grip drag reports every frame; the fit is measured once the size has settled for a frame.
      frame = requestAnimationFrame(() => {
        frame = 0;
        applyFitRef.current();
      });
    });
    observer.observe(surface);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, []);

  /**
   * Drag the empty paper to pan. Cards, fields and dots keep their own gestures; a finger keeps the
   * native scroll, because hijacking touch here would take away the scrolling that already works.
   */
  const startPan = (event: ReactPointerEvent) => {
    // A plain drag on paper is the selection box now. Panning is the explicit alternate gesture:
    // Alt-drag with a mouse, or the canvas arrow keys. A middle press still pans as it always did;
    // a right press belongs to the context menu, never to the viewport.
    if (
      event.pointerType === 'touch' ||
      (event.button === 0 && !event.altKey) ||
      (event.button !== 0 && event.button !== 1)
    )
      return;
    const target = event.target as HTMLElement;
    // The arrow inspector is paper drawn on the paper: a press in its padding is a press on a
    // control, not the start of a pan.
    if (target.closest('[data-node-id], [data-edge-inspector], button, input, textarea, select, a')) return;
    const surface = surfaceRef.current;
    if (!surface) return;
    event.preventDefault();
    // A pan press arms the arrow keys too; the surface's own focus ring stays keyboard-only.
    surface.focus({ preventScroll: true });
    onSelect(null);
    panStart.current = {
      x: event.clientX,
      y: event.clientY,
      left: surface.scrollLeft,
      top: surface.scrollTop,
    };
    setPanning(true);
  };

  /**
   * Arrow keys pan the focused paper, away from the cards' own nudge: the guard on `event.target`
   * means a focused card header (or a field) never reaches this, so the same key still moves the
   * card it belongs to.
   */
  const panWithKeys = (event: ReactKeyboardEvent) => {
    if (event.target !== event.currentTarget) return;
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    const step = event.shiftKey ? PAN_STEP_FAST : PAN_STEP;
    const dx = event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0;
    const dy = event.key === 'ArrowUp' ? -step : event.key === 'ArrowDown' ? step : 0;
    if (!dx && !dy) return;
    const surface = surfaceRef.current;
    if (!surface) return;
    event.preventDefault();
    surface.scrollLeft = Math.max(0, surface.scrollLeft + dx);
    surface.scrollTop = Math.max(0, surface.scrollTop + dy);
  };

  useEffect(() => {
    if (!panning) return;
    const surface = surfaceRef.current;
    if (!surface) return;
    const move = (event: PointerEvent) => {
      const start = panStart.current;
      if (!start) return;
      surface.scrollLeft = Math.max(0, start.left - (event.clientX - start.x));
      surface.scrollTop = Math.max(0, start.top - (event.clientY - start.y));
    };
    const finish = () => {
      panStart.current = null;
      setPanning(false);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', finish);
    window.addEventListener('pointercancel', finish);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', finish);
      window.removeEventListener('pointercancel', finish);
    };
  }, [panning]);

  return {
    surfaceRef,
    gridRef,
    scale,
    panning,
    extents,
    toCanvas,
    fitOrReset,
    startPan,
    panWithKeys,
  };
}
