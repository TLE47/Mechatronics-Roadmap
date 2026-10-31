/**
 * The workflow document's structural edits, pure (`app/src/workflowEdits.ts`).
 *
 * Every canvas action is one function from a document to the next document: no React, no storage
 * and no status sentence. Keeping the algebra here means the rules a diagram obeys — a last card
 * empties the lesson, a removed card leaves its frames and lanes, a fork/join bar is a card, an
 * arrow cannot point at its own card — are testable and written once.
 *
 * `components/workflow/useWorkflowEditor.ts` owns the state around these edits (history, persistence,
 * selection, the sentence the header shows); `WorkflowPanel.tsx` owns only the view.
 */

import {
  MAX_EDGES,
  addWorkflowNode,
  nextEdgeId,
  withEdgePort,
  withEdgeRoute,
  withEdgeText,
  withEdgeType,
  type EdgeRoute,
  type PortKind,
  type StepKind,
  type WorkflowDoc,
  type WorkflowEdge,
  type WorkflowEdgeType,
  type WorkflowGroup,
  type WorkflowNode,
  type WorkflowSide,
} from './workflow.ts';
import { withoutNodeFromLanes, withLanes } from './workflowProcesses.ts';

export interface NodeMove {
  id: string;
  x: number;
  y: number;
}

/** The dot a new card was dragged from: the new arrow leaves that side and socket. */
export interface LinkOrigin {
  nodeId: string;
  side: WorkflowSide;
  kind: PortKind | null;
}

export type LinkResult = { doc: WorkflowDoc; id: string } | 'edges' | 'steps';
export type ConnectResult = { doc: WorkflowDoc; id: string } | 'self' | 'duplicate' | 'edges';
export interface RemoveResult {
  /** null when that was the last card: a workflow with no cards is the lesson's empty state. */
  doc: WorkflowDoc | null;
  lostEdges: number;
}

export function editNode(doc: WorkflowDoc, id: string, patch: Partial<WorkflowNode>): WorkflowDoc {
  return {
    ...doc,
    nodes: doc.nodes.map((node) => (node.id === id ? { ...node, ...patch } : node)),
  };
}

/** Notes and lesson links are optional fields: clearing one removes it instead of storing ''. */
export function annotateNode(
  doc: WorkflowDoc,
  id: string,
  field: 'note' | 'lesson',
  value: string
): WorkflowDoc {
  return {
    ...doc,
    nodes: doc.nodes.map((node) => {
      if (node.id !== id) return node;
      const next = { ...node };
      if (value) next[field] = value;
      else delete next[field];
      return next;
    }),
  };
}

/** A frame drag reports every member, so the whole move is one document; null when nothing moved. */
export function moveNodes(doc: WorkflowDoc, moves: readonly NodeMove[]): WorkflowDoc | null {
  const byId = new Map(moves.map((move) => [move.id, move]));
  let changed = false;
  const nodes = doc.nodes.map((node) => {
    const move = byId.get(node.id);
    if (!move || (node.x === move.x && node.y === move.y)) return node;
    changed = true;
    return { ...node, x: move.x, y: move.y };
  });
  return changed ? { ...doc, nodes } : null;
}

/**
 * Take one card out.
 *
 * Its arrows go with it, its frames keep only the cards they still have, and its lane does the same.
 * The last card is special: the lesson returns to its empty state rather than storing a document
 * the panel would have to pretend is a flow.
 */
export function removeNode(doc: WorkflowDoc, id: string): RemoveResult {
  const nodes = doc.nodes.filter((node) => node.id !== id);
  const edges = doc.edges.filter((edge) => edge.from !== id && edge.to !== id);
  const lostEdges = doc.edges.length - edges.length;
  if (!nodes.length) return { doc: null, lostEdges };
  const groups = (doc.groups ?? [])
    .map((group) => ({ ...group, nodeIds: group.nodeIds.filter((member) => member !== id) }))
    .filter((group) => group.nodeIds.length);
  const next = { ...doc, nodes, edges };
  if (groups.length) next.groups = groups;
  else delete next.groups;
  return { doc: withLanes(next, withoutNodeFromLanes(doc.lanes ?? [], id)), lostEdges };
}

/**
 * The card a drag from a dot asked for at the point it was released, plus the arrow into it.
 *
 * One write, so a drop cannot leave an arrow pointing at a card that never landed. Refusals are the
 * two document bounds the caller has a sentence for.
 */
export function linkNewNode(
  doc: WorkflowDoc,
  kind: StepKind,
  at: { x: number; y: number },
  origin: LinkOrigin
): LinkResult {
  if (doc.edges.length >= MAX_EDGES) return 'edges';
  const grown = addWorkflowNode(doc, kind, at);
  if (!grown) return 'steps';
  const added = grown.nodes[grown.nodes.length - 1];
  const from = doc.nodes.find((node) => node.id === origin.nodeId);
  const edge: WorkflowEdge = {
    id: nextEdgeId(grown.edges),
    from: origin.nodeId,
    to: added.id,
    // The new card is entered from the side facing the card the drag started on.
    fromSide: origin.side,
    toSide: from && from.x > added.x ? 'right' : 'left',
    ...(origin.kind ? { fromPort: origin.kind } : {}),
  };
  return { doc: { ...grown, edges: [...grown.edges, edge] }, id: added.id };
}

/** A new arrow, or the one reason it cannot be drawn. */
export function connectNodes(
  doc: WorkflowDoc,
  from: string,
  to: string,
  fromSide: WorkflowSide,
  toSide: WorkflowSide,
  fromPort: PortKind | null,
  toPort: PortKind | null
): ConnectResult {
  if (from === to) return 'self';
  if (doc.edges.some((edge) => edge.from === from && edge.to === to)) return 'duplicate';
  if (doc.edges.length >= MAX_EDGES) return 'edges';
  // A dot that already carries a socket hands it to the new arrow, so extending a power run
  // keeps it power; a dot with nothing plugged in adds no field at all.
  const edge: WorkflowEdge = {
    id: nextEdgeId(doc.edges),
    from,
    to,
    fromSide,
    toSide,
    ...(fromPort ? { fromPort } : {}),
    ...(toPort ? { toPort } : {}),
  };
  return { doc: { ...doc, edges: [...doc.edges, edge] }, id: edge.id };
}

export function removeEdge(doc: WorkflowDoc, edgeId: string): WorkflowDoc {
  return { ...doc, edges: doc.edges.filter((edge) => edge.id !== edgeId) };
}

/** One arrow, replaced by what its inspector's patch makes of it: the four edge edits' one write. */
export function patchEdge(
  doc: WorkflowDoc,
  edgeId: string,
  patch: (edge: WorkflowEdge) => WorkflowEdge
): WorkflowDoc {
  return { ...doc, edges: doc.edges.map((edge) => (edge.id === edgeId ? patch(edge) : edge)) };
}

export const edgeType = (edge: WorkflowEdge, type: WorkflowEdgeType) => withEdgeType(edge, type);
export const edgeText = (edge: WorkflowEdge, field: 'label' | 'guard', text: string) =>
  withEdgeText(edge, field, text);
export const edgeRoute = (edge: WorkflowEdge, route: EdgeRoute) => withEdgeRoute(edge, route);
export const edgePort = (edge: WorkflowEdge, end: 'from' | 'to', kind: PortKind | null) =>
  withEdgePort(edge, end, kind);

/**
 * The frame a drawn box asked for.
 *
 * A card belongs to one frame, so grouping cards that already sit in one moves them: the old frame
 * keeps the cards it still has, and disappears if that is none. A new frame starts named by its
 * position, and the name is edited on the frame itself.
 */
export function groupCards(doc: WorkflowDoc, nodeIds: readonly string[]): WorkflowDoc {
  const kept = (doc.groups ?? [])
    .map((group) => ({ ...group, nodeIds: group.nodeIds.filter((id) => !nodeIds.includes(id)) }))
    .filter((group) => group.nodeIds.length);
  const group: WorkflowGroup = { title: `Group ${kept.length + 1}`, nodeIds: [...nodeIds] };
  return { ...doc, groups: [...kept, group] };
}

export function renameGroup(doc: WorkflowDoc, index: number, title: string): WorkflowDoc {
  return {
    ...doc,
    groups: (doc.groups ?? []).map((group, at) => (at === index ? { ...group, title } : group)),
  };
}

export function removeGroup(doc: WorkflowDoc, index: number): WorkflowDoc {
  const groups = (doc.groups ?? []).filter((_, at) => at !== index);
  const next = { ...doc };
  if (groups.length) next.groups = groups;
  else delete next.groups;
  return next;
}
