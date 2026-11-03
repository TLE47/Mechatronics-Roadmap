/**
 * Auto layout for a workflow (`app/src/workflowLayout.ts`).
 *
 * The canvas is deliberately free-form, but a diagram with a dozen cards dragged into a corner is
 * harder to read than its graph deserves. This lays the cards out in dependency columns: cards with
 * no incoming arrow start the first column, the cards they feed start the second, and so on. Within
 * a column the reading order of the document is kept, so a learner can recognise their flow after
 * the move.
 *
 * Pure: no React, no DOM and no persistence. `useWorkflowEditor` owns the history write.
 */

import {
  CANVAS_PAD,
  MAX_NODE_COORD,
  NODE_COLUMN,
  NODE_ROW,
  nodeWidth,
  type WorkflowDoc,
  type WorkflowNode,
} from './workflow.ts';

export interface LayoutPoint {
  id: string;
  x: number;
  y: number;
}

/**
 * One point per card, in dependency columns.
 *
 * Cycles are normal: a loop is a workflow card like any other, not an error. A card that is never
 * reached from a source still gets a column, using the longest path from any unreached node, so no
 * card can be omitted by a graph with no root. Cards keep their document order inside a column.
 */
export function layoutPoints(doc: WorkflowDoc): LayoutPoint[] {
  const ids = new Set(doc.nodes.map((node) => node.id));
  const incoming = new Map<string, number>();
  const outgoing = new Map<string, string[]>();
  for (const node of doc.nodes) {
    incoming.set(node.id, 0);
    outgoing.set(node.id, []);
  }
  for (const edge of doc.edges) {
    if (!ids.has(edge.from) || !ids.has(edge.to) || edge.from === edge.to) continue;
    incoming.set(edge.to, (incoming.get(edge.to) ?? 0) + 1);
    outgoing.get(edge.from)?.push(edge.to);
  }

  const depth = new Map<string, number>();
  const queue = doc.nodes.filter((node) => (incoming.get(node.id) ?? 0) === 0).map((node) => node.id);
  for (const id of queue) depth.set(id, 0);
  for (let head = 0; head < queue.length; head += 1) {
    const id = queue[head];
    for (const next of outgoing.get(id) ?? []) {
      if (depth.has(next)) continue;
      depth.set(next, (depth.get(id) ?? 0) + 1);
      queue.push(next);
    }
  }
  // A graph that is all cycle has no source. Give every unvisited card a depth from its position so
  // the result is still deterministic and every card remains on the paper.
  for (const node of doc.nodes) {
    if (depth.has(node.id)) continue;
    const fromEdge = doc.edges
      .filter((edge) => edge.to === node.id && depth.has(edge.from))
      .reduce((max, edge) => Math.max(max, (depth.get(edge.from) ?? 0) + 1), -1);
    depth.set(node.id, fromEdge >= 0 ? fromEdge : 0);
  }

  const byDepth = new Map<number, WorkflowNode[]>();
  for (const node of doc.nodes) {
    const level = Math.max(0, depth.get(node.id) ?? 0);
    const column = byDepth.get(level) ?? [];
    column.push(node);
    byDepth.set(level, column);
  }

  const levels = [...byDepth.keys()].sort((a, b) => a - b);
  const columnX = new Map<number, number>();
  let x = CANVAS_PAD;
  for (const level of levels) {
    columnX.set(level, x);
    const widest = Math.max(...(byDepth.get(level) ?? []).map((node) => nodeWidth(node)));
    x += Math.max(NODE_COLUMN, widest + 56);
  }

  const points: LayoutPoint[] = [];
  for (const level of levels) {
    const column = byDepth.get(level) ?? [];
    column.forEach((node, row) => {
      points.push({
        id: node.id,
        x: Math.min(MAX_NODE_COORD, (columnX.get(level) ?? CANVAS_PAD) + 0),
        y: Math.min(MAX_NODE_COORD, CANVAS_PAD + row * NODE_ROW),
      });
    });
  }
  return points;
}

/** The same document with every card at its auto-layout point. */
export function autoLayoutWorkflow(doc: WorkflowDoc): WorkflowDoc {
  const points = new Map(layoutPoints(doc).map((point) => [point.id, point]));
  return {
    ...doc,
    nodes: doc.nodes.map((node) => {
      const point = points.get(node.id);
      return point ? { ...node, x: point.x, y: point.y } : node;
    }),
  };
}
