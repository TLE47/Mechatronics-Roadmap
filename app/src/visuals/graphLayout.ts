import type { DiagramSpec } from './scenes.ts';

/**
 * Where a graph's boxes sit, from the edges alone (`app/src/visuals/graphLayout.ts`).
 *
 * It lives outside `Diagram.tsx` so the node suite can call the same function the renderer does:
 * a layout that stacks two boxes in one cell draws one figure on top of another, and that is a
 * failing assertion here rather than a picture nobody notices.
 */

export interface PlacedNode {
  id: string;
  label: string;
  tone?: 'accent' | 'ink' | 'muted';
  level: number;
  row: number;
}

/**
 * Longest-path layering: a box is one column past the furthest box that feeds it, which is what makes
 * a flow read left to right. The relaxation is bounded by the node count, so a cycle (a state machine
 * that loops back) settles instead of spinning: the loop closes to the right of its own body.
 *
 * `row` is the cross-axis lane. A scene that names its own rows keeps them; the rest are stacked in
 * the order they appear, one lane each, so a fan of three siblings never lands on one another.
 */
export function graphLayers(spec: DiagramSpec): { nodes: PlacedNode[]; levels: number; rows: number } {
  const nodes = spec.nodes ?? [];
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const level = new Map<string, number>();
  for (const node of nodes) level.set(node.id, node.col ?? 0);
  for (let pass = 0; pass < nodes.length; pass += 1) {
    let changed = false;
    for (const edge of spec.edges ?? []) {
      const from = byId.get(edge.from);
      const to = byId.get(edge.to);
      if (!from || !to || to.col !== undefined) continue;
      const want = (level.get(from.id) ?? 0) + 1;
      if (want > (level.get(to.id) ?? 0) && want <= nodes.length) {
        level.set(to.id, want);
        changed = true;
      }
    }
    if (!changed) break;
  }
  const taken = new Map<number, number>();
  const placed: PlacedNode[] = nodes.map((node) => {
    const column = level.get(node.id) ?? 0;
    const row = node.row ?? taken.get(column) ?? 0;
    taken.set(column, Math.max(taken.get(column) ?? 0, row + 1));
    return { id: node.id, label: node.label, tone: node.tone, level: column, row };
  });
  return {
    nodes: placed,
    levels: Math.max(0, ...placed.map((node) => node.level)) + 1,
    rows: Math.max(...placed.map((node) => node.row), 0) + 1,
  };
}

/** Two boxes in one `(level, row)` cell are drawn on top of each other: the fan is silently lost. */
export function collidingCells(spec: DiagramSpec): string[] {
  const seen = new Map<string, string>();
  const clashes: string[] = [];
  for (const node of graphLayers(spec).nodes) {
    const cell = `${node.level}:${node.row}`;
    const first = seen.get(cell);
    if (first) clashes.push(`${first} and ${node.id} both sit at ${cell}`);
    else seen.set(cell, node.id);
  }
  return clashes;
}
