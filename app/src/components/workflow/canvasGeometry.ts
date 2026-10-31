import { NODE_WIDTH, type EdgeRoute, type WorkflowNode, type WorkflowSide } from '../../workflow.ts';

/**
 * The workflow canvas's geometry (`components/workflow/canvasGeometry.ts`).
 *
 * Pure arithmetic, no React and no DOM: where a card's dot sits, how an arrow bends, and which side
 * of a dropped-on card faces the source. The edge layer, the card layer and the link gesture all
 * read these, so a change to how an arrow leaves a card lands in one function.
 */

/** Before the first DOM measurement: tall enough for a header and two detail lines. */
export const NODE_FALLBACK_HEIGHT = 120;

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** A card's measured height, or the two-line guess before the observer has seen it. */
export function cardHeight(heights: Record<string, number>, id: string): number {
  return heights[id] ?? NODE_FALLBACK_HEIGHT;
}

const SIDE_VECTOR: Record<WorkflowSide, { x: number; y: number }> = {
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
  top: { x: 0, y: -1 },
  bottom: { x: 0, y: 1 },
};

/** A dot sits on its card's edge; the anchor is that edge's midpoint. */
function anchorOn(node: WorkflowNode, side: WorkflowSide, height: number): { x: number; y: number } {
  switch (side) {
    case 'left':
      return { x: node.x, y: node.y + height / 2 };
    case 'right':
      return { x: node.x + NODE_WIDTH, y: node.y + height / 2 };
    case 'top':
      return { x: node.x + NODE_WIDTH / 2, y: node.y };
    case 'bottom':
      return { x: node.x + NODE_WIDTH / 2, y: node.y + height };
  }
}

/** The dot on a card's own edge, in canvas pixels, at its measured height. */
export function anchorFrom(
  node: WorkflowNode,
  side: WorkflowSide,
  heights: Record<string, number>
): { x: number; y: number } {
  return anchorOn(node, side, cardHeight(heights, node.id));
}

function bendBetween(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.max(16, Math.min(56, Math.hypot(b.x - a.x, b.y - a.y) / 2));
}

/** The two control points of the cubic between two dots, each pushed out along its own side. */
function controlPoints(
  a: { x: number; y: number },
  aSide: WorkflowSide,
  b: { x: number; y: number },
  bSide: WorkflowSide
): { c1: { x: number; y: number }; c2: { x: number; y: number } } {
  const bend = bendBetween(a, b);
  const av = SIDE_VECTOR[aSide];
  const bv = SIDE_VECTOR[bSide];
  return {
    c1: { x: a.x + av.x * bend, y: a.y + av.y * bend },
    c2: { x: b.x + bv.x * bend, y: b.y + bv.y * bend },
  };
}

/** A cubic that leaves its source and enters its target along the named sides. */
export function edgeCurve(
  a: { x: number; y: number },
  aSide: WorkflowSide,
  b: { x: number; y: number },
  bSide: WorkflowSide
): string {
  const { c1, c2 } = controlPoints(a, aSide, b, bSide);
  return `M ${a.x} ${a.y} C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${b.x} ${b.y}`;
}

/**
 * A straight line reads as straight only near an axis: past this drift it crosses the paper
 * diagonally, so `edgePath` draws the rounded elbow instead of a line nothing lines up with.
 */
export const STRAIGHT_ALIGN = 12;

/** The corner radius of a rounded route, capped again by half of each leg it turns through. */
const ROUTE_RADIUS = 12;

function unit(from: { x: number; y: number }, to: { x: number; y: number }) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy);
  return length ? { x: dx / length, y: dy / length, length } : null;
}

/**
 * The points an elbow runs through: out of the source's dot, a turn, and into the target's.
 *
 * The departure matters as much as the dots: an arrow leaving a card's right side must first go
 * right, or it would start by crossing the card it belongs to. Two horizontal (or two vertical)
 * faces turn once on the shared axis; mixed faces turn once where the two departures cross.
 */
function elbowPoints(
  a: { x: number; y: number },
  aSide: WorkflowSide,
  b: { x: number; y: number },
  bSide: WorkflowSide
): { x: number; y: number }[] {
  const bend = Math.max(20, Math.min(64, Math.hypot(b.x - a.x, b.y - a.y) / 3));
  const av = SIDE_VECTOR[aSide];
  const bv = SIDE_VECTOR[bSide];
  const p1 = { x: a.x + av.x * bend, y: a.y + av.y * bend };
  const p2 = { x: b.x + bv.x * bend, y: b.y + bv.y * bend };
  const aLevel = av.y === 0;
  const bLevel = bv.y === 0;
  const points =
    aLevel && bLevel
      ? (() => {
          const mid = (p1.x + p2.x) / 2;
          return [a, p1, { x: mid, y: p1.y }, { x: mid, y: p2.y }, p2, b];
        })()
      : !aLevel && !bLevel
        ? (() => {
            const mid = (p1.y + p2.y) / 2;
            return [a, p1, { x: p1.x, y: mid }, { x: p2.x, y: mid }, p2, b];
          })()
        : aLevel
          ? [a, p1, { x: p2.x, y: p1.y }, p2, b]
          : [a, p1, { x: p1.x, y: p2.y }, p2, b];
  // A corner that lands on its neighbour (two dots already level) is not a corner: dropping it keeps
  // the path valid for the renderer and the midpoint honest.
  return points.filter(
    (point, index) => index === 0 || Math.hypot(point.x - points[index - 1].x, point.y - points[index - 1].y) > 0.5
  );
}

/** The points a route runs through; `straight` only where it is aligned, else a rounded elbow. */
function routePoints(
  a: { x: number; y: number },
  aSide: WorkflowSide,
  b: { x: number; y: number },
  bSide: WorkflowSide,
  route: EdgeRoute
): { x: number; y: number }[] {
  if (route === 'straight' && (Math.abs(a.y - b.y) <= STRAIGHT_ALIGN || Math.abs(a.x - b.x) <= STRAIGHT_ALIGN)) {
    return [a, b];
  }
  return elbowPoints(a, aSide, b, bSide);
}

function linePath(points: { x: number; y: number }[]): string {
  return points.map((point, index) => `${index ? 'L' : 'M'} ${point.x} ${point.y}`).join(' ');
}

/** A polyline with each interior corner turned through a quadratic of at most `ROUTE_RADIUS`. */
function roundedPath(points: { x: number; y: number }[]): string {
  let d = `M ${points[0].x} ${points[0].y}`;
  for (let index = 1; index < points.length - 1; index += 1) {
    const previous = points[index - 1];
    const corner = points[index];
    const next = points[index + 1];
    const incoming = unit(previous, corner);
    const outgoing = unit(corner, next);
    if (!incoming || !outgoing) continue;
    const back = Math.min(ROUTE_RADIUS, incoming.length / 2);
    const forward = Math.min(ROUTE_RADIUS, outgoing.length / 2);
    d += ` L ${corner.x - incoming.x * back} ${corner.y - incoming.y * back} Q ${corner.x} ${corner.y} ${
      corner.x + outgoing.x * forward
    } ${corner.y + outgoing.y * forward}`;
  }
  const last = points[points.length - 1];
  return `${d} L ${last.x} ${last.y}`;
}

/**
 * An arrow's line for the route it is set to.
 *
 * `curved` is the cubic every arrow had; `elbow` turns at right angles, `rounded` turns through a
 * small radius, and `straight` is a line only when the two dots are level — a diagonal straight
 * arrow would cut across cards, so it borrows the rounded elbow instead of looking broken.
 */
export function edgePath(
  a: { x: number; y: number },
  aSide: WorkflowSide,
  b: { x: number; y: number },
  bSide: WorkflowSide,
  route: EdgeRoute
): string {
  if (route === 'curved') return edgeCurve(a, aSide, b, bSide);
  const points = routePoints(a, aSide, b, bSide, route);
  return route === 'elbow' ? linePath(points) : roundedPath(points);
}

/** The dashed preview follows the pointer; it only needs the source side's departure. */
export function pendingCurve(
  a: { x: number; y: number },
  aSide: WorkflowSide,
  b: { x: number; y: number }
): string {
  const bend = bendBetween(a, b);
  const av = SIDE_VECTOR[aSide];
  return `M ${a.x} ${a.y} C ${a.x + av.x * bend} ${a.y + av.y * bend}, ${b.x} ${b.y}, ${b.x} ${b.y}`;
}

/** The arrow's own point at the half-way parameter (t = 0.5), not the line between the two dots. */
function curveMidpoint(
  a: { x: number; y: number },
  aSide: WorkflowSide,
  b: { x: number; y: number },
  bSide: WorkflowSide
): { x: number; y: number } {
  const { c1, c2 } = controlPoints(a, aSide, b, bSide);
  return { x: (a.x + 3 * c1.x + 3 * c2.x + b.x) / 8, y: (a.y + 3 * c1.y + 3 * c2.y + b.y) / 8 };
}

/** The point half-way along a polyline, measured by length rather than by corner count. */
function polylineMidpoint(points: { x: number; y: number }[]): { x: number; y: number } {
  let total = 0;
  for (let index = 1; index < points.length; index += 1) {
    total += Math.hypot(points[index].x - points[index - 1].x, points[index].y - points[index - 1].y);
  }
  let left = total / 2;
  for (let index = 1; index < points.length; index += 1) {
    const from = points[index - 1];
    const to = points[index];
    const length = Math.hypot(to.x - from.x, to.y - from.y);
    if (length >= left) {
      const at = length ? left / length : 0;
      return { x: from.x + (to.x - from.x) * at, y: from.y + (to.y - from.y) * at };
    }
    left -= length;
  }
  return points[points.length - 1];
}

/**
 * Where an arrow's label and remove button attach: on the line's half-way point, and the button
 * 10 px to its right so the two never overlap. The label lifts itself above the line and the button
 * centres itself on it in CSS; both share this one anchor, so they cannot drift apart — and it moves
 * with the route, so a label never floats off the elbow it belongs to.
 */
export function edgeControls(
  a: { x: number; y: number },
  aSide: WorkflowSide,
  b: { x: number; y: number },
  bSide: WorkflowSide,
  route: EdgeRoute = 'curved'
): { label: { x: number; y: number }; remove: { x: number; y: number } } {
  const label =
    route === 'curved' ? curveMidpoint(a, aSide, b, bSide) : polylineMidpoint(routePoints(a, aSide, b, bSide, route));
  return { label, remove: { x: label.x + 10, y: label.y } };
}

/** A canvas-pixel rectangle from the paper's top-left. */
export interface CanvasRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Air between a frame and the cards it holds; its name chip hangs in the space below. */
export const GROUP_PAD = 12;

/**
 * The box a frame draws: the union of its cards, padded.
 *
 * Derived rather than stored, so it cannot disagree with what is inside: a card dragged outward
 * stretches its frame, a card deleted shrinks it, and no rectangle has to be kept in step. The name
 * chip hangs below the box, where the opening column always has room, so no band is carved out of
 * the cards and no chip can be clipped by the paper's top edge.
 */
export function groupRect(
  members: readonly WorkflowNode[],
  heights: Record<string, number>
): CanvasRect | null {
  if (!members.length) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const node of members) {
    minX = Math.min(minX, node.x);
    minY = Math.min(minY, node.y);
    maxX = Math.max(maxX, node.x + NODE_WIDTH);
    maxY = Math.max(maxY, node.y + cardHeight(heights, node.id));
  }
  return {
    x: Math.max(0, minX - GROUP_PAD),
    y: Math.max(0, minY - GROUP_PAD),
    width: maxX - minX + GROUP_PAD * 2,
    height: maxY - minY + GROUP_PAD * 2,
  };
}

/**
 * The strip a partition adds above its cards for the lane's own name.
 *
 * 34 px, not the chip's own 20: a top port dot is centred on a card's top edge and reaches 10 px
 * above it, so a 22 px header put the lane's name field over the first card's top dot and stole its
 * press. The strip clears chip (22) plus dot (10) with 2 px to spare.
 */
export const LANE_HEADER = 34;

/**
 * The band a named partition draws: its cards' union, with a strip above them for the lane name.
 *
 * The header is carved out of the paper above the cards rather than out of the cards themselves, so
 * no field is covered by a lane's name. Like a frame's box it is read from its members, never stored.
 */
export function laneRect(
  members: readonly WorkflowNode[],
  heights: Record<string, number>
): CanvasRect | null {
  const box = groupRect(members, heights);
  if (!box) return null;
  const top = Math.max(0, box.y - LANE_HEADER);
  return { ...box, y: top, height: box.height + (box.y - top) };
}

/** The same rectangle with a negative width or height turned positive, as a drag can produce. */
export function normalizeRect(rect: CanvasRect): CanvasRect {
  return {
    x: Math.min(rect.x, rect.x + rect.width),
    y: Math.min(rect.y, rect.y + rect.height),
    width: Math.abs(rect.width),
    height: Math.abs(rect.height),
  };
}

/**
 * The cards a drawn box covers, judged by each card's centre.
 *
 * Centre rather than overlap: a box nicked across a corner of a card should not claim it, and a
 * gesture that only edges over an existing frame should not silently swallow the cards inside it.
 * A card's centre is inside its frame at every card size, so a box drawn tightly around a frame's
 * cards picks up exactly those cards.
 */
export function cardsWithin(
  rect: CanvasRect,
  nodes: readonly WorkflowNode[],
  heights: Record<string, number>
): string[] {
  const box = normalizeRect(rect);
  return nodes
    .filter((node) => {
      const cx = node.x + NODE_WIDTH / 2;
      const cy = node.y + cardHeight(heights, node.id) / 2;
      return cx >= box.x && cx <= box.x + box.width && cy >= box.y && cy <= box.y + box.height;
    })
    .map((node) => node.id);
}

/** The side of `to` that looks at `from` when a drop lands on the card body rather than a dot. */
export function facingSide(
  from: WorkflowNode,
  to: WorkflowNode,
  fromHeight: number,
  toHeight: number
): WorkflowSide {
  const dx = from.x + NODE_WIDTH / 2 - (to.x + NODE_WIDTH / 2);
  const dy = from.y + fromHeight / 2 - (to.y + toHeight / 2);
  const vertical = Math.abs(dy) / Math.max(1, Math.max(fromHeight, toHeight));
  const horizontal = Math.abs(dx) / NODE_WIDTH;
  if (horizontal >= vertical) return dx < 0 ? 'left' : 'right';
  return dy < 0 ? 'top' : 'bottom';
}
