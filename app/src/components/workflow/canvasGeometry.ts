import { NODE_WIDTH, type WorkflowNode, type WorkflowSide } from '../../workflow.ts';

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

/**
 * Where an arrow's label and remove button attach: the label on the curve's half-way point, the
 * button 10 px to its right so the two never overlap. The label lifts itself above the line and the
 * button centres itself on it in CSS; both share this one anchor, so they cannot drift apart.
 */
export function edgeControls(
  a: { x: number; y: number },
  aSide: WorkflowSide,
  b: { x: number; y: number },
  bSide: WorkflowSide
): { label: { x: number; y: number }; remove: { x: number; y: number } } {
  const label = curveMidpoint(a, aSide, b, bSide);
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

/** The strip a partition adds above its cards for the lane's own name. */
export const LANE_HEADER = 22;

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
