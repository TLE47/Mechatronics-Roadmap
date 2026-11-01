/**
 * Walking a workflow (`app/src/workflowRun.ts`).
 *
 * The canvas can say what the diagram is; this says what it *does*. One token starts on the first
 * start card, a step moves every token one control arrow forward, a decision pauses so the learner
 * chooses which guard wins, and a fork puts a token on each branch while its join consumes them
 * together. That is the activity semantics the cards already promise, made observable — and it is
 * pure, so the whole run is testable without a browser.
 *
 * Only **control** arrows are followed. A data, signal, power or mechanical arrow says something
 * about the system, not about what runs next, so a diagram whose actions are joined only by cables
 * stops the run with a sentence instead of pretending to execute.
 *
 * The state is a value: `stepRun` and `chooseRun` return the next state, and the caller owns it. No
 * timer, no mutation, and the same document plus the same choices always produce the same run.
 */

import {
  KIND_META,
  edgeLabelFor,
  edgeTypeOf,
  workflowNumbers,
  workflowOrder,
  type WorkflowDoc,
  type WorkflowEdge,
} from './workflow.ts';

/** Where the run is, in the smallest terms that can be drawn and stepped. */
export interface WorkflowRun {
  /** Card ids carrying a token; a fork may put several cards here at once. */
  at: string[];
  /** Arrows the run has followed, in order, so the canvas can draw the path. */
  taken: string[];
  /** The decision the run is paused on, if any; it cannot advance until an exit is chosen. */
  choice: string | null;
  done: boolean;
  steps: number;
}

/** One way out of a paused decision, as the run bar offers it. */
export interface WorkflowRunExit {
  id: string;
  label: string;
}

export interface WorkflowRunStatus {
  text: string;
  exits: WorkflowRunExit[];
  done: boolean;
}

function controlFrom(doc: WorkflowDoc): Map<string, WorkflowEdge[]> {
  const out = new Map<string, WorkflowEdge[]>();
  for (const edge of doc.edges) {
    if (edgeTypeOf(edge) !== 'flow') continue;
    const list = out.get(edge.from);
    if (list) list.push(edge);
    else out.set(edge.from, [edge]);
  }
  return out;
}

function incomingFrom(doc: WorkflowDoc): Map<string, number> {
  const count = new Map<string, number>();
  for (const edge of doc.edges) {
    if (edgeTypeOf(edge) !== 'flow') continue;
    count.set(edge.to, (count.get(edge.to) ?? 0) + 1);
  }
  return count;
}

/**
 * The run's first token: the first start card in reading order, or — for a diagram with none yet —
 * the first card, so Simulate always does something visible.
 */
export function startRun(doc: WorkflowDoc): WorkflowRun | null {
  if (!doc.nodes.length) return null;
  const order = workflowOrder(doc);
  const start = order.find((node) => KIND_META[node.kind].start) ?? order[0];
  return { at: [start.id], taken: [], choice: null, done: false, steps: 0 };
}

/**
 * One step: every waiting token moves one control arrow, except that a decision stops the run to be
 * answered, and a join holds its tokens until every branch has arrived.
 */
export function stepRun(doc: WorkflowDoc, run: WorkflowRun): WorkflowRun {
  if (run.done || run.choice) return run;
  const byId = new Map(doc.nodes.map((node) => [node.id, node]));
  const out = controlFrom(doc);
  const counts = new Map<string, number>();
  for (const id of run.at) counts.set(id, (counts.get(id) ?? 0) + 1);

  const decision = [...counts.keys()].find((id) => {
    const node = byId.get(id);
    return Boolean(
      node &&
        !KIND_META[node.kind].terminal &&
        node.kind !== 'fork' &&
        (out.get(id) ?? []).length > 1
    );
  });
  if (decision) return { ...run, choice: decision };

  const incoming = incomingFrom(doc);
  const next: string[] = [];
  const taken = new Set(run.taken);
  for (const [id, count] of counts) {
    const node = byId.get(id);
    if (!node || KIND_META[node.kind].terminal) continue;
    const exits = out.get(id) ?? [];
    if (node.kind === 'join' && count < Math.max(2, incoming.get(id) ?? 0)) {
      // The bar waits: keep exactly the tokens that have arrived, so the status can say so.
      for (let index = 0; index < count; index += 1) next.push(id);
      continue;
    }
    const emit = node.kind === 'join' ? 1 : count;
    for (let index = 0; index < emit; index += 1) {
      for (const edge of exits) {
        next.push(edge.to);
        taken.add(edge.id);
      }
    }
  }
  return {
    at: next,
    taken: [...taken],
    choice: null,
    done: next.length === 0,
    steps: run.steps + 1,
  };
}

/** Take one exit of the paused decision; `null` when that arrow is not one of its control exits. */
export function chooseRun(
  doc: WorkflowDoc,
  run: WorkflowRun,
  edgeId: string
): WorkflowRun | null {
  if (!run.choice) return null;
  const edge = (controlFrom(doc).get(run.choice) ?? []).find((entry) => entry.id === edgeId);
  const at = [...run.at];
  const token = at.indexOf(run.choice);
  if (!edge || token < 0) return null;
  at.splice(token, 1, edge.to);
  return {
    at,
    taken: [...run.taken, edge.id],
    choice: null,
    done: false,
    steps: run.steps + 1,
  };
}

/** What the run bar says, and — at a decision — the exits it offers. */
export function runStatus(doc: WorkflowDoc, run: WorkflowRun): WorkflowRunStatus {
  if (run.done) {
    return { text: `Done — ${run.steps} step${run.steps === 1 ? '' : 's'}`, exits: [], done: true };
  }
  const byId = new Map(doc.nodes.map((node) => [node.id, node]));
  const number = workflowNumbers(doc);
  if (run.choice) {
    const node = byId.get(run.choice);
    if (!node) return { text: 'The decision card is gone', exits: [], done: true };
    const exits = (controlFrom(doc).get(node.id) ?? []).map((edge) => ({
      id: edge.id,
      label: edgeLabelFor(node, edge) || 'no guard',
    }));
    return {
      text: `Decision at step ${number.get(node.id) ?? '?'} — which way?`,
      exits,
      done: false,
    };
  }
  const at = [...new Set(run.at)];
  if (!at.length) return { text: 'Done', exits: [], done: true };
  // A join holds the run: that is worth more than naming the bar's own step.
  const incoming = incomingFrom(doc);
  const waiting = at.some((id) => {
    if (byId.get(id)?.kind !== 'join') return false;
    const here = run.at.filter((token) => token === id).length;
    return here < Math.max(2, incoming.get(id) ?? 0);
  });
  if (waiting) return { text: 'Waiting at the join for the other branch', exits: [], done: false };
  const node = at.length === 1 ? byId.get(at[0]) : undefined;
  if (node) return { text: `Step ${number.get(node.id) ?? '?'} · ${KIND_META[node.kind].label}`, exits: [], done: false };
  return {
    text: `${at.length} branches running in parallel`,
    exits: [],
    done: false,
  };
}
