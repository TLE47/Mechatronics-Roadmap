/**
 * Copying one card (`app/src/workflowClipboard.ts`).
 *
 * The press menu offers Copy, Cut and Paste on the same card the canvas draws, and none of that needs
 * state beyond the card itself: a clip is the card's words and its look, without the id it was stored
 * under or the pixels it happened to sit at. Pasting reuses `addWorkflowNode`, so the new card takes
 * the next free id, lands on the paper's grid and obeys the document's card bound exactly as a card
 * added from the palette does — and its arrows are deliberately not copied, because an arrow without
 * its other end is not a flow.
 */

import { addWorkflowNode, type WorkflowDoc, type WorkflowNode } from './workflow.ts';

/** One card's content and style, ready to be pasted: everything except the id. */
export type CardClipboard = Omit<WorkflowNode, 'id'>;

/** What copying a card keeps. Fields the card never had stay absent, not empty strings. */
export function clipCard(node: WorkflowNode): CardClipboard {
  return {
    kind: node.kind,
    title: node.title,
    detail: node.detail,
    unit: node.unit,
    note: node.note,
    lesson: node.lesson,
    condition: node.condition,
    fill: node.fill,
    ink: node.ink,
    size: node.size,
    x: node.x,
    y: node.y,
  };
}

/**
 * Paste a clip as a new card: offset down and right of where it was copied, or centred on a pressed
 * paper point, whichever the caller names.
 */
export function pasteCard(
  doc: WorkflowDoc,
  clip: CardClipboard,
  at?: { x: number; y: number }
): WorkflowDoc | null {
  const grown = addWorkflowNode(doc, clip.kind, at ?? { x: clip.x + 168, y: clip.y + 48 });
  if (!grown) return null;
  const added = grown.nodes[grown.nodes.length - 1];
  const words: Partial<WorkflowNode> = { title: clip.title, detail: clip.detail };
  if (clip.unit) words.unit = clip.unit;
  if (clip.note) words.note = clip.note;
  if (clip.lesson) words.lesson = clip.lesson;
  if (clip.condition) words.condition = clip.condition;
  if (clip.fill) words.fill = clip.fill;
  if (clip.ink) words.ink = clip.ink;
  if (clip.size !== undefined) words.size = clip.size;
  return {
    ...grown,
    nodes: grown.nodes.map((node) => (node.id === added.id ? { ...node, ...words } : node)),
  };
}
