/**
 * Search inside one workflow (`app/src/workflowSearch.ts`).
 *
 * A diagram is searched by what its cards say, not by their ids: the learner types `torque`,
 * `stall`, or `given` and gets the card with the best matching field. The index is pure so the
 * panel can run it on every keystroke without touching storage or the canvas.
 */

import { KIND_META, type WorkflowDoc, type WorkflowNode } from './workflow.ts';

export type WorkflowSearchField = 'title' | 'detail' | 'note' | 'unit' | 'kind';

export interface WorkflowSearchHit {
  node: WorkflowNode;
  field: WorkflowSearchField;
  /** A short, single-line window around the match, with the query's words kept intact. */
  snippet: string;
  score: number;
}

const FIELD_WEIGHT: Record<WorkflowSearchField, number> = {
  title: 500,
  detail: 360,
  note: 280,
  unit: 200,
  kind: 120,
};

const FIELD_LABEL: Record<WorkflowSearchField, string> = {
  title: 'title',
  detail: 'detail',
  note: 'note',
  unit: 'unit',
  kind: 'kind',
};

function oneLine(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

/**
 * A window around the first matched term, kept to one readable line.
 *
 * A hit on the tail of a 400-character detail is useless if the result prints the first 60
 * characters. The snippet therefore starts a little before the match, and adds ellipses only where
 * text was actually cut.
 */
export function snippetAround(text: string, terms: readonly string[], width = 88): string {
  const flat = oneLine(text);
  if (!flat || !terms.length) return flat.slice(0, width);
  let at = -1;
  for (const term of terms) {
    const found = flat.toLowerCase().indexOf(term);
    if (found >= 0 && (at < 0 || found < at)) at = found;
  }
  if (at < 0) return flat.slice(0, width);
  const start = Math.max(0, at - Math.floor(width / 3));
  const end = Math.min(flat.length, start + width);
  return `${start > 0 ? '…' : ''}${flat.slice(start, end).trim()}${end < flat.length ? '…' : ''}`;
}

export function workflowFieldText(node: WorkflowNode, field: WorkflowSearchField): string {
  if (field === 'kind') return KIND_META[node.kind].label;
  return node[field] ?? '';
}

/**
 * Every card matching every word in the query, best field first.
 *
 * One row per card: a query that hits both title and detail should not offer the same destination
 * twice. `score` rewards a title hit, a word-start hit, and an exact whole-word hit; the caller only
 * needs the order, and card order is the stable tie-breaker.
 */
export function searchWorkflow(doc: WorkflowDoc | null, rawQuery: string): WorkflowSearchHit[] {
  if (!doc) return [];
  const query = oneLine(rawQuery).toLowerCase();
  if (!query) return [];
  const terms = query.split(' ').filter(Boolean);
  const hits: WorkflowSearchHit[] = [];

  doc.nodes.forEach((node, index) => {
    let best: WorkflowSearchHit | null = null;
    for (const field of Object.keys(FIELD_WEIGHT) as WorkflowSearchField[]) {
      const text = oneLine(workflowFieldText(node, field));
      if (!text) continue;
      const lower = text.toLowerCase();
      if (!terms.every((term) => lower.includes(term))) continue;
      let score = FIELD_WEIGHT[field];
      if (lower === query) score += 240;
      else if (lower.startsWith(query)) score += 160;
      else if (terms.every((term) => new RegExp(`(^|\\W)${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`).test(lower))) {
        score += 90;
      }
      // A shorter field is the more precise hit when two cards both contain the query.
      score -= Math.min(80, Math.max(0, Math.round(text.length / 12)));
      const hit: WorkflowSearchHit = {
        node,
        field,
        snippet: snippetAround(text, terms),
        score,
      };
      if (!best || hit.score > best.score) best = hit;
    }
    if (best) hits.push({ ...best, node, score: best.score - index / 1000 });
  });

  return hits.sort((a, b) => b.score - a.score);
}

export function searchFieldLabel(field: WorkflowSearchField): string {
  return FIELD_LABEL[field];
}
