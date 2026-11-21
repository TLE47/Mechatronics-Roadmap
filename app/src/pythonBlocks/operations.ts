/**
 * Edits to a block program (`app/src/pythonBlocks/operations.ts`).
 *
 * Every operation returns a new `BlockProgram` and marks it dirty; none mutates the program it was
 * given. That is what makes undo a list of programs rather than a second edit log, and it is why the
 * visual editor can hand the same model to React without cloning it on every render.
 *
 * Ids are unique across a parse and the edits that follow because insertion reads `program.seq` and
 * writes the next number back; a duplicate deep-copies its subtree with fresh ids so two cards can
 * never answer to the same handler.
 */

import {
  type BlockFields,
  type BlockKind,
  type BlockNode,
  type BlockProgram,
} from './ast.ts';

/** A place a toolbox statement can be inserted: the end of the root by default. */
export interface InsertionPoint {
  /** The node whose body receives the statement, or null for the program's own body. */
  bodyId: string | null;
  index: number;
}

export const ROOT_INSERTION: InsertionPoint = { bodyId: null, index: 0 };

/** A fresh statement with no ids in its body; callers insert through `insertNode` to assign them. */
export function newNode(
  kind: BlockKind,
  fields: BlockFields = {},
  body: BlockNode[] = [],
  lines: string[] = []
): BlockNode {
  return { id: '', kind, fields: { ...fields }, body, lines: [...lines] };
}

/** Deep-copy a node, numbering its ids from `start`; returns the next free number. */
function withIds(node: BlockNode, start: number): { node: BlockNode; seq: number } {
  const id = start + 1;
  let seq = id;
  const body: BlockNode[] = [];
  for (const child of node.body) {
    const copied = withIds(child, seq);
    seq = copied.seq;
    body.push(copied.node);
  }
  return {
    node: {
      id: `b${id}`,
      kind: node.kind,
      fields: { ...node.fields },
      body,
      lines: [...node.lines],
    },
    seq,
  };
}

function findNode(nodes: BlockNode[], id: string): BlockNode | null {
  for (const node of nodes) {
    if (node.id === id) return node;
    const found = findNode(node.body, id);
    if (found) return found;
  }
  return null;
}

/** The body an insertion point names, or the root when it names no node. */
export function bodyOf(program: BlockProgram, bodyId: string | null): BlockNode[] | null {
  if (bodyId === null) return program.nodes;
  return findNode(program.nodes, bodyId)?.body ?? null;
}

/** Replace one body anywhere in the tree, leaving every other node object alone. */
function mapBody(
  nodes: BlockNode[],
  bodyId: string | null,
  update: (body: BlockNode[]) => BlockNode[]
): BlockNode[] {
  if (bodyId === null) return update(nodes);
  let done = false;
  return nodes.map((node) => {
    if (done) return node;
    // The body is checked before the empty-body shortcut: an empty suite is exactly the body a
    // toolbox tap is trying to fill, so skipping it would make "add inside" do nothing.
    if (node.id === bodyId) {
      done = true;
      return { ...node, body: update(node.body) };
    }
    if (node.body.length === 0) return node;
    const body = mapBody(node.body, bodyId, update);
    return body === node.body ? node : { ...node, body };
  });
}

/** Insert a template and return the program plus the new statement's id. */
export function insertNode(
  program: BlockProgram,
  at: InsertionPoint,
  template: BlockNode
): { program: BlockProgram; id: string } {
  const copied = withIds(template, program.seq);
  // A point that names a statement the last edit removed falls back to the program's own body,
  // rather than inserting into a body no card will ever draw.
  const target = at.bodyId !== null && findNode(program.nodes, at.bodyId) ? at.bodyId : null;
  const body = bodyOf(program, target) ?? program.nodes;
  const index = Math.max(0, Math.min(at.index, body.length));
  const nodes = mapBody(program.nodes, target, (current) =>
    [...current.slice(0, index), copied.node, ...current.slice(index)]
  );
  return {
    program: { ...program, nodes, dirty: true, seq: copied.seq },
    id: copied.node.id,
  };
}

/** Change one statement's fields. The node stays where it is; its body is untouched. */
export function updateNode(
  program: BlockProgram,
  id: string,
  fields: Partial<BlockFields>
): BlockProgram {
  let found = false;
  const walk = (nodes: BlockNode[]): BlockNode[] =>
    nodes.map((node) => {
      if (node.id === id) {
        found = true;
        return { ...node, fields: { ...node.fields, ...fields } };
      }
      if (!node.body.length) return node;
      return { ...node, body: walk(node.body) };
    });
  const nodes = walk(program.nodes);
  return found ? { ...program, nodes, dirty: true } : program;
}

function removeIn(
  nodes: BlockNode[],
  id: string
): { nodes: BlockNode[]; removed: boolean } {
  const index = nodes.findIndex((node) => node.id === id);
  if (index !== -1) {
    return { nodes: [...nodes.slice(0, index), ...nodes.slice(index + 1)], removed: true };
  }
  let removed = false;
  const next = nodes.map((node) => {
    if (removed || node.body.length === 0) return node;
    const result = removeIn(node.body, id);
    if (!result.removed) return node;
    removed = true;
    return { ...node, body: result.nodes };
  });
  return { nodes: next, removed };
}

/** Remove one statement. A suite left empty renders `pass`, so the program still runs. */
export function removeNode(program: BlockProgram, id: string): BlockProgram {
  const result = removeIn(program.nodes, id);
  return result.removed ? { ...program, nodes: result.nodes, dirty: true } : program;
}

/** Swap a statement with its neighbour in the same body; `-1` is up, `1` is down. */
export function moveNode(program: BlockProgram, id: string, direction: -1 | 1): BlockProgram {
  let moved = false;
  const walk = (nodes: BlockNode[]): BlockNode[] => {
    const index = nodes.findIndex((node) => node.id === id);
    if (index !== -1) {
      const target = index + direction;
      if (target < 0 || target >= nodes.length) return nodes;
      const next = [...nodes];
      [next[index], next[target]] = [next[target], next[index]];
      moved = true;
      return next;
    }
    return nodes.map((node) =>
      node.body.length === 0 ? node : { ...node, body: walk(node.body) }
    );
  };
  const nodes = walk(program.nodes);
  return moved ? { ...program, nodes, dirty: true } : program;
}

/** Copy a statement directly under itself, with fresh ids for the whole subtree. */
export function duplicateNode(
  program: BlockProgram,
  id: string
): { program: BlockProgram; id: string } | null {
  const found = findNode(program.nodes, id);
  if (!found) return null;
  const copied = withIds(found, program.seq);
  let done = false;
  const insertAfter = (nodes: BlockNode[]): BlockNode[] => {
    const index = nodes.findIndex((node) => node.id === id);
    if (index !== -1) {
      done = true;
      return [...nodes.slice(0, index + 1), copied.node, ...nodes.slice(index + 1)];
    }
    return nodes.map((node) =>
      node.body.length === 0 ? node : { ...node, body: insertAfter(node.body) }
    );
  };
  const nodes = insertAfter(program.nodes);
  if (!done) return null;
  return {
    program: { ...program, nodes, dirty: true, seq: copied.seq },
    id: copied.node.id,
  };
}
