/**
 * Where the platforms stand (`app/src/learningPathLayout.ts`).
 *
 * One node order, two arrangements. Desktop is a serpentine of three per row — left to right, then
 * right to left — so the road winds down the page without horizontal scrolling. A phone is one
 * platform per row, alternating sides around the centre line. Both are percentages of the world box,
 * so the world can be any height and the same points still draw the road.
 *
 * A district starts on a fresh row. That is not cosmetic: a district's band is a full-width stripe,
 * so two districts sharing a row would paint two stripes over each other and print their labels in
 * the same corner. The page therefore passes the district counts as `groups`; a district that ends
 * mid-row leaves the rest of that row open, and the next district's label has a clean top edge.
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
  /**
   * District sizes, in order. Each group begins on a new row so every district owns whole rows and
   * its band can never overlap the next one. Omit for plain packing.
   */
  groups?: readonly number[];
}

export interface PathBand {
  top: number;
  height: number;
}

/**
 * The vertical extent of a district: exactly the rows it owns. Because a platform's centre is the
 * middle of its row, a band from the first row's edge to the last row's edge never cuts a platform
 * or overlaps the next district, whatever the total row count.
 */
export function bandForRows(startRow: number, endRow: number, rows: number): PathBand {
  if (rows <= 0) return { top: 0, height: 100 };
  return {
    top: (startRow / rows) * 100,
    height: ((endRow - startRow + 1) / rows) * 100,
  };
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
  const rows: number[][] = [];

  const groups = (options.groups ?? []).filter((size) => size > 0);
  let offset = 0;
  if (groups.length > 0) {
    for (const groupCount of groups) {
      for (let inGroup = 0; inGroup < groupCount; inGroup += columns) {
        const size = Math.min(columns, groupCount - inGroup);
        rows.push(Array.from({ length: size }, (_, slot) => offset + inGroup + slot));
      }
      offset += groupCount;
    }
    // The groups are derived from the same node list; a mismatch is a caller bug, not a layout.
    if (offset !== count) {
      throw new Error(`layoutPath groups cover ${offset} nodes, expected ${count}`);
    }
  } else {
    for (let index = 0; index < count; index += columns) {
      const size = Math.min(columns, count - index);
      rows.push(Array.from({ length: size }, (_, slot) => index + slot));
    }
  }

  return rows.flatMap((indices, row) =>
    indices.map((index, inRow) => {
      const rowCount = indices.length;
      // Serpentine: odd rows run the other way, so the road never jumps across the page.
      const slot = row % 2 === 1 ? rowCount - 1 - inRow : inRow;
      const slotSpan = 100 / rowCount;
      // One column is the phone's street: alternate sides so the road keeps its width and the label
      // has room, rather than stacking every platform on the centre line. The 36/64 split leaves
      // enough viewport for a 64vw lesson label on each side on a 320 px screen.
      const x =
        columns === 1
          ? row % 2 === 1
            ? 64
            : 36
          : rowCount === 1
            ? 50
            : (slot + 0.5) * slotSpan;
      // The platform sits at the middle of its own row. The world is exactly `rows` rows tall, so the
      // first and last rows each keep half a row of clearance without a percentage inset that would
      // grow with the curriculum.
      const y = ((row + 0.5) / rows.length) * 100;
      return {
        x,
        y,
        row,
        column: slot,
        side: columns === 1 ? (row % 2 === 1 ? 'right' : 'left') : 'center',
      };
    })
  );
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
