/**
 * The graph's sheet (`runner/GraphPlot.tsx`).
 *
 * Two canvases, one window: the 2D paper with its adaptive explicit curves and Python's points, and
 * the transparent WebGL2 layer above it for implicit curves. The component owns what belongs to the
 * drawing — the measured size, the zoom/pan controls, the pointer and its hover readout, and the
 * shader's own failures, which are a sentence in the corner rather than a silent blank sheet. The
 * expressions live in `GraphingPane.tsx`; this view is handed the curves they compiled into.
 */

import {
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type PointerEvent as ReactPointerEvent,
  type SetStateAction,
} from 'react';
import { Minus, Plus, RotateCcw } from 'lucide-react';
import {
  drawScene,
  fitViewport,
  ImplicitRenderer,
  panViewport,
  pixelAt,
  pointAt,
  refreshExplicitSamples,
  viewportFor,
  zoomViewport,
  type ExplicitCurve,
  type GraphPoint,
  type HoverPoint,
  type ImplicitCurve,
  type Viewport,
} from '../../../grapher/renderer';
import { shortNumber } from './graphModel';

/** A redraw with no parameter move: keep every sample and every uniform. */
const NO_AFFECTED_ROWS: ReadonlySet<string> = new Set();

/** One Python point in the colour of the row that pushed it. */
export interface ScatterPoint {
  point: GraphPoint;
  color: string;
}

export function GraphPlot({
  view,
  onView,
  explicitCurves,
  implicitCurves,
  scatter,
  scope,
  affectedIds,
}: {
  view: Viewport;
  onView: Dispatch<SetStateAction<Viewport>>;
  explicitCurves: ExplicitCurve[];
  implicitCurves: ImplicitCurve[];
  scatter: ScatterPoint[];
  /** The current parameter values. A resampled curve reads them through its compiled closure. */
  scope: Record<string, number>;
  /** Rows the dependency graph says a parameter move reached; null/undefined means none specific. */
  affectedIds: ReadonlySet<string> | null;
}) {
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [hover, setHover] = useState<HoverPoint | null>(null);
  const [dragging, setDragging] = useState(false);
  const [glNotice, setGlNotice] = useState<string | null>(null);
  const [renderer, setRenderer] = useState<ImplicitRenderer | null>(null);
  const plotRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const glCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const dragRef = useRef<{ x: number; y: number; view: Viewport } | null>(null);
  const viewRef = useRef(view);
  viewRef.current = view;
  const fitted = useRef({ width: 0, height: 0 });
  /** The samples already earned, and the window/curve identity they belong to. */
  const samplesRef = useRef<ReadonlyMap<string, GraphPoint[][]>>(new Map());
  const samplesWindowRef = useRef<{
    view: Viewport;
    width: number;
    height: number;
    curves: readonly ExplicitCurve[];
  } | null>(null);
  /** The scope each layer last drew. `affectedIds` only applies on the frame a scope changes. */
  const drawnScopeRef = useRef<Record<string, number> | null>(null);
  const uploadedScopeRef = useRef<Record<string, number> | null>(null);

  // The sheet is measured, not guessed: a split pane and a full-width tab are both legal widths.
  useEffect(() => {
    const node = plotRef.current;
    if (!node) return;
    const measure = () => {
      const rect = node.getBoundingClientRect();
      // The scientific face hides this pane rather than unmounting it, and a hidden element
      // measures zero. Keeping the last real size is what preserves the window across a switch.
      if (rect.width <= 0 || rect.height <= 0) return;
      const width = Math.round(rect.width);
      const height = Math.round(rect.height);
      setSize((previous) =>
        previous.width === width && previous.height === height ? previous : { width, height }
      );
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  // A resize keeps the x window and re-derives y so a unit is the same number of pixels on both axes.
  // The first measurement is the opening window, centred and square.
  useEffect(() => {
    if (!size.width || !size.height) return;
    if (fitted.current.width === size.width && fitted.current.height === size.height) return;
    const first = fitted.current.width === 0;
    fitted.current = { width: size.width, height: size.height };
    onView((current) =>
      first ? viewportFor(size.width, size.height) : fitViewport(current, size.width, size.height)
    );
  }, [onView, size]);

  // The WebGL layer is created once per canvas. It clears to transparent; the 2D paper below stays
  // the readable surface even when a browser has no WebGL2.
  useEffect(() => {
    const canvas = glCanvasRef.current;
    if (!canvas) return;
    const instance = new ImplicitRenderer(canvas);
    setRenderer(instance);
    if (!instance.available) setGlNotice('This browser has no WebGL2, so implicit curves are hidden.');
    return () => {
      instance.dispose();
      setRenderer(null);
    };
  }, []);

  // A wheel over the plot zooms about the pointer; React's own wheel listener is passive, so the
  // preventDefault that keeps the page still has to come from a native listener.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const rect = canvas.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      const anchor = pointAt(
        viewRef.current,
        event.clientX - rect.left,
        event.clientY - rect.top,
        rect.width,
        rect.height
      );
      const factor = Math.exp(Math.max(-160, Math.min(160, event.deltaY)) * 0.0015);
      onView((current) => zoomViewport(current, factor, anchor));
    };
    canvas.addEventListener('wheel', onWheel, { passive: false });
    return () => canvas.removeEventListener('wheel', onWheel);
  }, [onView]);

  // The drawing itself. Every colour and size is a local number rather than a token: a canvas is an
  // instrument face in both palettes, which is why `--plot` is dark in light mode too.
  //
  // A parameter move redraws every curve, but only the curves the dependency graph named are
  // resampled. Every other curve paints its previous segments; its compiled closure is not called.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || size.width <= 0 || size.height <= 0) return;
    const previousWindow = samplesWindowRef.current;
    const curvesChanged =
      !previousWindow ||
      previousWindow.curves.length !== explicitCurves.length ||
      explicitCurves.some((curve, index) => {
        const previous = previousWindow.curves[index];
        return !previous || previous.id !== curve.id || previous.evaluate !== curve.evaluate;
      });
    const windowChanged =
      !previousWindow ||
      previousWindow.view !== view ||
      previousWindow.width !== size.width ||
      previousWindow.height !== size.height;
    // A cached sample is only safe while the scope is the one that earned it. On any other redraw
    // (hover, colour, points) `affectedIds` may still describe the last drag, so it must not be
    // read as a fresh move.
    const scopeMoved = drawnScopeRef.current !== scope;
    drawnScopeRef.current = scope;
    const dirty =
      curvesChanged || windowChanged
        ? null
        : scopeMoved
          ? (affectedIds ?? NO_AFFECTED_ROWS)
          : NO_AFFECTED_ROWS;
    const samples = refreshExplicitSamples(
      explicitCurves,
      scope,
      view,
      size.width,
      dirty,
      samplesRef.current
    );
    samplesRef.current = samples;
    samplesWindowRef.current = {
      view,
      width: size.width,
      height: size.height,
      curves: explicitCurves,
    };

    const density = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(size.width * density);
    canvas.height = Math.round(size.height * density);
    const context = canvas.getContext('2d');
    if (!context) return;
    context.setTransform(density, 0, 0, density, 0, 0);
    drawScene(context, {
      viewport: view,
      width: size.width,
      height: size.height,
      scope,
      curves: explicitCurves.map((curve) => ({
        ...curve,
        segments: samples.get(curve.id),
      })),
      points: scatter.map((entry) => entry.point),
      pointColor: scatter[0]?.color,
      hover,
    });
  }, [affectedIds, explicitCurves, hover, scatter, scope, size, view]);

  // The implicit layer sits above the paper. Re-rendering writes uniforms for parameter moves; only
  // an equation's own source change builds another shader. A failure is the shader's sentence, not a
  // dropped frame: the renderer draws every curve it can and returns what it could not compile.
  useEffect(() => {
    if (!renderer || size.width <= 0 || size.height <= 0) return;
    if (!renderer.available) {
      setGlNotice('This browser has no WebGL2, so implicit curves are hidden.');
      return;
    }
    const density = Math.min(2, window.devicePixelRatio || 1);
    const canvas = glCanvasRef.current;
    if (!canvas) return;
    canvas.width = Math.round(size.width * density);
    canvas.height = Math.round(size.height * density);
    renderer.resize(size.width, size.height, density);
    try {
      // The shader still draws every implicit curve (the layer is cleared each frame), but only
      // rows the dependency graph named write their parameter uniforms again. The others keep the
      // values already sitting in their own program. As above, a stale set from the last drag is
      // not a parameter move; only a new scope makes the set current.
      const scopeMoved = uploadedScopeRef.current !== scope;
      uploadedScopeRef.current = scope;
      const failures = renderer.render(
        implicitCurves,
        view,
        scopeMoved ? affectedIds : NO_AFFECTED_ROWS
      );
      setGlNotice(failures[0] ?? null);
    } catch (failure) {
      setGlNotice(
        failure instanceof Error ? failure.message : 'An implicit curve could not be drawn'
      );
    }
  }, [affectedIds, implicitCurves, renderer, size, view]);

  const pointerDown = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { x: event.clientX, y: event.clientY, view };
    setDragging(true);
    setHover(null);
  };

  const pointerMove = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    if (dragRef.current) {
      const drag = dragRef.current;
      onView(
        panViewport(drag.view, event.clientX - drag.x, event.clientY - drag.y, rect.width, rect.height)
      );
      return;
    }
    const px = event.clientX - rect.left;
    const py = event.clientY - rect.top;
    const point = pointAt(view, px, py, rect.width, rect.height);
    const hits: HoverPoint[] = [];
    for (const curve of explicitCurves) {
      const y = curve.evaluate(point.x, scope);
      if (!Number.isFinite(y)) continue;
      const yPx = pixelAt(view, { x: point.x, y }, rect.width, rect.height).y;
      if (yPx < -24 || yPx > rect.height + 24) continue;
      if (Math.abs(yPx - py) <= 36) hits.push({ px, py: yPx, x: point.x, y, color: curve.color });
    }
    setHover(hits[0] ?? null);
  };

  const pointerUp = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    dragRef.current = null;
    setDragging(false);
  };

  return (
    <div
      ref={plotRef}
      className="relative h-[21rem] min-w-0 flex-1 bg-plot sm:h-auto sm:min-h-[27rem]"
    >
      <canvas
        ref={canvasRef}
        data-testid="graph-canvas"
        role="img"
        aria-label="Graph of the expressions and points in the list: explicit curves, implicit curves, and shaded inequality regions. The implicit curves and regions are drawn on the transparent layer above it."
        onPointerDown={pointerDown}
        onPointerMove={pointerMove}
        onPointerUp={pointerUp}
        onPointerCancel={pointerUp}
        onPointerLeave={() => {
          if (!dragRef.current) setHover(null);
        }}
        className={`absolute inset-0 block h-full w-full touch-none ${dragging ? 'cursor-grabbing' : 'cursor-crosshair'}`}
      />
      <canvas
        ref={glCanvasRef}
        data-testid="graph-implicit-canvas"
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 block h-full w-full"
      />
      <div className="absolute right-2 top-2 flex flex-col gap-1">
        <button
          type="button"
          data-testid="graph-zoom-in"
          aria-label="Zoom in"
          title="Zoom in"
          onClick={() => onView((current) => zoomViewport(current, 0.75))}
          className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-md border border-line bg-panel/90 text-body shadow-[var(--shadow-sm)] transition-colors hover:bg-raise"
        >
          <Plus className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
        <button
          type="button"
          data-testid="graph-zoom-out"
          aria-label="Zoom out"
          title="Zoom out"
          onClick={() => onView((current) => zoomViewport(current, 4 / 3))}
          className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-md border border-line bg-panel/90 text-body shadow-[var(--shadow-sm)] transition-colors hover:bg-raise"
        >
          <Minus className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
        <button
          type="button"
          data-testid="graph-reset-view"
          aria-label="Reset the view"
          title="Reset the view"
          onClick={() => onView(viewportFor(size.width, size.height))}
          className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-md border border-line bg-panel/90 text-body shadow-[var(--shadow-sm)] transition-colors hover:bg-raise"
        >
          <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </div>
      {glNotice && (
        <p
          role="status"
          data-testid="graph-gl-notice"
          className="pointer-events-none absolute bottom-2 left-2 max-w-[min(92%,34rem)] rounded-md border border-line bg-panel/95 px-2 py-1 font-mono text-[10.5px] leading-snug text-muted shadow-[var(--shadow-sm)]"
        >
          {glNotice}
        </p>
      )}
      {hover && (
        <div
          data-testid="graph-hover-readout"
          className="pointer-events-none absolute rounded-md border border-line bg-panel/95 px-2 py-1 font-mono text-[11px] text-body shadow-[var(--shadow-sm)] tabular-nums"
          style={{
            left: Math.max(6, Math.min(size.width - 132, hover.px + 10)),
            top: Math.max(6, Math.min(size.height - 34, hover.py - 32)),
          }}
        >
          ({shortNumber(hover.x)}, {shortNumber(hover.y)})
        </div>
      )}
    </div>
  );
}
