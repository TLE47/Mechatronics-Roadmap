/**
 * The graphing face's arithmetic (`app/src/graphing.ts`).
 *
 * A plot is three small problems rather than one: which numbers the grid should use, where a drag or
 * a wheel puts the window, and where a curve has to be broken. They are pure functions so the
 * browser cost of panning is a `setState` and a redraw, not a re-derivation of the grid on every
 * pointer move, and so `npm run test:calculator` can pin the numbers without a canvas.
 *
 * A curve is sampled once per screen column (never once per pixel: a 2× display would double the
 * work for no visible difference) and split at a non-finite value or a jump larger than the window,
 * which is what stops `tan(x)` drawing a vertical line through its asymptotes. The view keeps the
 * same pixels-per-unit on both axes unless a caller says otherwise, because a circle that plots as an
 * ellipse is a graph that lies about the shape of a function.
 */

export interface GraphView {
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
}

export interface GraphPoint {
  x: number;
  y: number;
}

/** The window a graph opens on: twenty units wide, with the height following the plot's shape. */
export function graphViewFor(width: number, height: number): GraphView {
  const w = width > 0 ? width : 640;
  const h = height > 0 ? height : 420;
  const halfX = 10;
  const halfY = (halfX * h) / w;
  return { xMin: -halfX, xMax: halfX, yMin: -halfY, yMax: halfY };
}

/**
 * The same window with square units: the x range is kept and the y range grows or shrinks around its
 * own centre. Called when the plot is measured, never on a pointer move.
 */
export function fitGraphView(view: GraphView, width: number, height: number): GraphView {
  if (!(width > 0) || !(height > 0)) return view;
  const xSpan = view.xMax - view.xMin;
  if (!(xSpan > 0)) return graphViewFor(width, height);
  const centre = (view.yMin + view.yMax) / 2;
  const halfY = (xSpan * height) / (width * 2);
  return { ...view, yMin: centre - halfY, yMax: centre + halfY };
}

/** A 1-2-5 step close to `span / target`, so the grid's labels stay whole numbers where they can. */
export function graphStep(span: number, target = 10): number {
  if (!(span > 0) || !Number.isFinite(span)) return 1;
  const raw = span / Math.max(1, target);
  const power = Math.pow(10, Math.floor(Math.log10(raw)));
  const normalized = raw / power;
  const factor = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return factor * power;
}

/** Every multiple of `step` inside the window, including its edges when they land on one. */
export function graphTicksBetween(min: number, max: number, step: number): number[] {
  if (!(step > 0) || !Number.isFinite(min) || !Number.isFinite(max) || max <= min) return [];
  const first = Math.ceil(min / step) * step;
  const ticks: number[] = [];
  for (let value = first; value <= max + step * 1e-6 && ticks.length < 200; value += step) {
    // A step of 0.1 accumulates 0.30000000000000004; two decimal places of the step's own
    // magnitude are plenty to put the label on its real multiple.
    const decimals = Math.max(0, Math.min(10, -Math.floor(Math.log10(step)) + 1));
    ticks.push(Number(value.toFixed(decimals)));
  }
  return ticks;
}

/** The text under a tick: whole numbers where the step is whole, otherwise the step's decimals. */
export function graphTickLabel(value: number, step: number): string {
  if (Object.is(value, -0) || value === 0) return '0';
  const magnitude = Math.abs(value);
  if (magnitude >= 1e6 || (magnitude > 0 && magnitude < 1e-4)) {
    return value.toExponential(1).replace('e+', 'e');
  }
  const decimals = Math.max(0, Math.min(8, -Math.floor(Math.log10(step))));
  return Number(value.toFixed(decimals)).toString();
}

/** Zoom about a world point (the centre by default), keeping that point under the cursor. */
export function zoomGraphView(
  view: GraphView,
  factor: number,
  anchor?: { x: number; y: number }
): GraphView {
  if (!(factor > 0) || !Number.isFinite(factor)) return view;
  const x = anchor?.x ?? (view.xMin + view.xMax) / 2;
  const y = anchor?.y ?? (view.yMin + view.yMax) / 2;
  return {
    xMin: x + (view.xMin - x) * factor,
    xMax: x + (view.xMax - x) * factor,
    yMin: y + (view.yMin - y) * factor,
    yMax: y + (view.yMax - y) * factor,
  };
}

/** A drag in pixels, applied to the whole window: the paper follows the pointer. */
export function panGraphView(
  view: GraphView,
  dxPixels: number,
  dyPixels: number,
  width: number,
  height: number
): GraphView {
  if (!(width > 0) || !(height > 0)) return view;
  const dx = (dxPixels / width) * (view.xMax - view.xMin);
  const dy = (dyPixels / height) * (view.yMax - view.yMin);
  return {
    xMin: view.xMin - dx,
    xMax: view.xMax - dx,
    yMin: view.yMin + dy,
    yMax: view.yMax + dy,
  };
}

/**
 * A curve as drawable segments. A break is a value the expression cannot take, or a jump larger
 * than the window: both are places a continuous line would invent a value the function never had.
 */
export function sampleCurve(
  evaluate: (x: number) => number,
  view: GraphView,
  columns: number
): GraphPoint[][] {
  const span = view.xMax - view.xMin;
  if (!(span > 0)) return [];
  const count = Math.max(120, Math.min(2000, Math.round(columns)));
  const ySpan = view.yMax - view.yMin;
  const jump = Math.max(ySpan * 3, 1e-9);
  const segments: GraphPoint[][] = [];
  let segment: GraphPoint[] = [];
  let previous: number | null = null;
  for (let index = 0; index <= count; index += 1) {
    const x = view.xMin + (index / count) * span;
    let y: number;
    try {
      y = evaluate(x);
    } catch {
      y = Number.NaN;
    }
    if (!Number.isFinite(y)) {
      if (segment.length > 1) segments.push(segment);
      segment = [];
      previous = null;
      continue;
    }
    if (previous !== null && Math.abs(y - previous) > jump && Math.abs(y) > ySpan * 2) {
      if (segment.length > 1) segments.push(segment);
      segment = [];
    }
    segment.push({ x, y });
    previous = y;
  }
  if (segment.length > 1) segments.push(segment);
  return segments;
}

/**
 * The screen point under a pointer, in world units. Kept here so the component's pointer handler and
 * its hover readout cannot disagree about which number the pointer is over.
 */
export function graphPointAt(
  view: GraphView,
  px: number,
  py: number,
  width: number,
  height: number
): { x: number; y: number } {
  if (!(width > 0) || !(height > 0)) return { x: 0, y: 0 };
  return {
    x: view.xMin + (px / width) * (view.xMax - view.xMin),
    y: view.yMax - (py / height) * (view.yMax - view.yMin),
  };
}
