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
