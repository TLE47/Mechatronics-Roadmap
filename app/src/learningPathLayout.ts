/**
 * Where the platforms stand (`app/src/learningPathLayout.ts`).
 *
 * One node order, two arrangements. Desktop is a serpentine of three per row — left to right, then
 * right to left — so the road winds down the page without horizontal scrolling. A phone is one
 * platform per row, alternating sides around the centre line. Both are percentages of the world box,
 * so the world can be any height and the same points still draw the road.
 *
 * The module is pure: no DOM, no measurement. `pathD` turns the points into one smooth SVG path in
 * the same 0–100 space, which is why the road and the platforms cannot drift apart.
 */

export interface PathPoint {
  /** Left edge in the world, 0–100. */
  x: number;
  /** Top edge in the world, 0–100. */
  y: number;
  row: number;
  column: number;
  /** Which way a one-column phone path leans; `center` for the wide rows. */
  side: 'left' | 'right' | 'center';
}

export interface LayoutOptions {
  /** Platforms per row. Desktop 3, phone 1. */
  columns?: number;
  /** Percent of the world kept clear at the top and bottom. */
  top?: number;
  bottom?: number;
}

/** How many rows a slice needs at this column count. */
export function pathRows(count: number, columns = 3): number {
  return Math.max(1, Math.ceil(count / Math.max(1, columns)));
}

/**
 * The points, in lesson order.
 *
 * A short last row is spread across the same usable width as a full one, so six nodes in three
 * columns fill two rows exactly and a seventh would not sit half off the edge.
 */
export function layoutPath(count: number, options: LayoutOptions = {}): PathPoint[] {
  if (count <= 0) return [];
  const columns = Math.max(1, Math.floor(options.columns ?? 3));
  const top = options.top ?? 10;
  const bottom = options.bottom ?? 10;
  const span = Math.max(0, 100 - top - bottom);
  const rows = pathRows(count, columns);

  return Array.from({ length: count }, (_, index) => {
    const row = Math.floor(index / columns);
    const inRow = index % columns;
    const rowCount = Math.min(columns, count - row * columns);
    // Serpentine: odd rows run the other way, so the road never jumps across the page.
    const slot = row % 2 === 1 ? rowCount - 1 - inRow : inRow;
    const slotSpan = 100 / rowCount;
    // One column is the phone's street: alternate sides so the road keeps its width and the label
    // has room, rather than stacking every platform on the centre line.
    const x =
      columns === 1
        ? row % 2 === 1
          ? 70
          : 30
        : rowCount === 1
          ? 50
          : (slot + 0.5) * slotSpan;
    const y = rows === 1 ? top + span / 2 : top + (row / (rows - 1)) * span;
    return {
      x,
      y,
      row,
      column: slot,
      side: columns === 1 ? (row % 2 === 1 ? 'right' : 'left') : 'center',
    };
  });
}

/**
 * The road: a cubic through each pair of platforms, in the same 0–100 coordinates.
 *
 * One path, not a polyline with joins: the control points put the vertical tangent at each platform,
 * so the road enters and leaves a platform straight and curves between them.
 */
export function pathD(points: readonly PathPoint[]): string {
  if (points.length === 0) return '';
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;
  let d = `M ${points[0].x} ${points[0].y}`;
  for (let index = 1; index < points.length; index += 1) {
    const from = points[index - 1];
    const to = points[index];
    const middle = (from.y + to.y) / 2;
    d += ` C ${from.x} ${middle}, ${to.x} ${middle}, ${to.x} ${to.y}`;
  }
  return d;
}
