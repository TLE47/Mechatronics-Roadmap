/**
 * Concurrency and activity partitions for a learner's workflow
 * (`app/src/workflowProcesses.ts`).
 *
 * UML's activity vocabulary has two ideas the basic node graph could not say, and both matter for
 * mechatronics work: a **fork** starts actions that run at the same time and a **join** waits for
 * them, and an **activity partition** names who owns a card — mechanical, electronics, firmware.
 * They live here rather than in `workflow.ts` because they are a layer on top of the graph: the
 * model adds two kinds and one optional document field, while the arithmetic, normalization and
 * export rules for the partition live beside the partition.
 *
 * A fork or join is a card rather than a special edge shape. That keeps one id space, one selection
 * model, one delete path and one set of arrows for every element, and it lets both exports name the
 * bar (`Fork`, `Join`) instead of drawing an unlabelled line.
 *
 * A lane stores only a name and the cards in it. Its rectangle is derived from those cards by
 * `canvasGeometry.laneRect`, so moving or deleting a card moves the band and the last card gone takes
 * the lane with it — the same rule a named frame follows. A card belongs to at most one lane; a lane
 * in a stored document that names a card twice, or a card that is gone, keeps the first usable
 * claim. No field is written for a document that has no lanes, so every diagram saved before this
 * module existed opens unchanged.
 */

import type {
  KindMeta,
  NodeShape,
  StepKind,
  WorkflowDoc,
  WorkflowIssue,
  WorkflowNode,
} from './workflow.ts';

/** The two bars of a parallel split: a fork opens it, a join closes it. */
export const PROCESS_KINDS = ['fork', 'join'] as const;
export type ProcessKind = (typeof PROCESS_KINDS)[number];

export function isForkJoin(kind: StepKind): kind is ProcessKind {
  return (PROCESS_KINDS as readonly string[]).includes(kind);
}

/** The one description of each bar; kept out of `KIND_META`'s literal for the reason in the header. */
export const PROCESS_KIND_META: Record<ProcessKind, KindMeta> = {
  fork: {
    label: 'Fork',
    hint: 'Splits into actions that run at the same time — one arrow to each.',
    mode: 'both',
    icon: 'branch',
  },
  join: {
    label: 'Join',
    hint: 'Waits for every parallel branch to finish, then continues once.',
    mode: 'both',
    icon: 'merge',
  },
};

/** A bar is the one plate no action, decision or terminator uses. */
export const PROCESS_SHAPES: Record<ProcessKind, NodeShape> = {
  fork: 'bar',
  join: 'bar',
};

export const MAX_LANES = 6;
export const MAX_LANE_TITLE_CHARS = 32;

/** One named partition: who owns these cards. */
export interface WorkflowLane {
  title: string;
  nodeIds: string[];
}

function text(value: unknown, max: number): string {
  return typeof value === 'string' ? value.replace(/^\s+|\s+$/g, '').slice(0, max) : '';
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/**
 * Lanes from a stored value, made usable.
 *
 * The first lane to name a card keeps it, a lane whose cards are all gone is dropped rather than
 * left empty, and junk is ignored one entry at a time — the same tolerant read frames get, so one
 * hand-edited lane cannot cost the document its other partitions.
 */
export function readLanes(value: unknown, exists: ReadonlySet<string>): WorkflowLane[] {
  if (!Array.isArray(value)) return [];
  const lanes: WorkflowLane[] = [];
  const claimed = new Set<string>();
  for (const entry of value) {
    if (lanes.length >= MAX_LANES) break;
    const stored = record(entry);
    if (!stored || !Array.isArray(stored.nodeIds)) continue;
    const nodeIds = stored.nodeIds.filter((id): id is string => {
      if (typeof id !== 'string' || !exists.has(id) || claimed.has(id)) return false;
      claimed.add(id);
      return true;
    });
    if (nodeIds.length) lanes.push({ title: text(stored.title, MAX_LANE_TITLE_CHARS), nodeIds });
  }
  return lanes;
}

/**
 * Put cards in one lane, taking them out of any lane they were in.
 *
 * Returning a new array (and dropping a lane that lost its last card) is the whole mutation: the
 * panel writes the result once, and no lane can list a card another lane also claims.
 */
export function withLane(
  lanes: readonly WorkflowLane[],
  nodeIds: readonly string[],
  title: string
): WorkflowLane[] {
  const wanted = new Set(nodeIds);
  const kept = lanes
    .map((lane) => ({ ...lane, nodeIds: lane.nodeIds.filter((id) => !wanted.has(id)) }))
    .filter((lane) => lane.nodeIds.length);
  return [...kept, { title: text(title, MAX_LANE_TITLE_CHARS), nodeIds: [...wanted] }];
}

export function renameLane(
  lanes: readonly WorkflowLane[],
  index: number,
  title: string
): WorkflowLane[] {
  return lanes.map((lane, at) =>
    at === index ? { ...lane, title: text(title, MAX_LANE_TITLE_CHARS) } : lane
  );
}

export function removeLane(lanes: readonly WorkflowLane[], index: number): WorkflowLane[] {
  return lanes.filter((_, at) => at !== index);
}

/** The name of the lane a card belongs to, or '' for a card that sits outside every partition. */
export function laneTitleFor(lanes: readonly WorkflowLane[] | undefined, nodeId: string): string {
  return lanes?.find((lane) => lane.nodeIds.includes(nodeId))?.title ?? '';
}

/**
 * What the two bars ask of the graph, as advice and never a gate.
 *
 * A fork with one exit is not splitting anything, and a join with one entry is not waiting for
 * anything; both are the shape a learner draws while still building the diagram, so the sentence
 * names the missing arrows rather than refusing the flow.
 */
export function forkJoinIssues(
  doc: Pick<WorkflowDoc, 'nodes' | 'edges'>,
  number: Map<string, number>
): WorkflowIssue[] {
  const outgoing = new Map<string, number>();
  const incoming = new Map<string, number>();
  for (const edge of doc.edges) {
    outgoing.set(edge.from, (outgoing.get(edge.from) ?? 0) + 1);
    incoming.set(edge.to, (incoming.get(edge.to) ?? 0) + 1);
  }
  const issues: WorkflowIssue[] = [];
  for (const node of doc.nodes) {
    const where = `Step ${number.get(node.id) ?? '?'}`;
    if (node.kind === 'fork' && (outgoing.get(node.id) ?? 0) < 2) {
      issues.push({
        code: 'fork-without-branches',
        stepId: node.id,
        severity: 'hint',
        message: `${where} is a fork — draw an arrow to each action that runs at the same time.`,
      });
    }
    if (node.kind === 'join' && (incoming.get(node.id) ?? 0) < 2) {
      issues.push({
        code: 'join-without-branches',
        stepId: node.id,
        severity: 'hint',
        message: `${where} is a join — draw every parallel branch into it before the flow continues.`,
      });
    }
  }
  return issues;
}

/** Mermaid's escape rule for a subgraph label, shared by every lane. */
function label(value: string): string {
  return value.replace(/"/g, "'").replace(/\s+/g, ' ').trim();
}

/**
 * Activity partitions as Mermaid subgraphs.
 *
 * A partition is a named box around its cards, exactly what a `subgraph` is, so the export carries
 * the name and the membership instead of flattening them. A card can also sit in a frame; the lane
 * claims it first and the caller's frame skips it, because Mermaid has no legal way to write one card
 * into two subgraphs. `claimed` is returned so the frame pass can honour that precedence.
 */
export function laneBlocks(
  lanes: readonly WorkflowLane[] | undefined,
  index: Map<string, number>,
  card: (position: number) => string
): { lines: string[]; claimed: Set<string> } {
  const lines: string[] = [];
  const claimed = new Set<string>();
  (lanes ?? []).forEach((lane, at) => {
    const members = lane.nodeIds
      .filter((id) => index.has(id) && !claimed.has(id))
      .sort((a, b) => (index.get(a) ?? 0) - (index.get(b) ?? 0));
    if (!members.length) return;
    members.forEach((id) => claimed.add(id));
    lines.push(`  subgraph lane${at + 1}["${label(lane.title || `Lane ${at + 1}`)}"]`);
    for (const id of members) lines.push(`  ${card(index.get(id) ?? 0)}`);
    lines.push('  end');
  });
  return { lines, claimed };
}

/** The one-line lane suffix Markdown puts after a card, or '' when the card has no partition. */
export function laneMarkdown(lanes: readonly WorkflowLane[] | undefined, node: WorkflowNode): string {
  const title = laneTitleFor(lanes, node.id);
  return title ? ` · lane ${label(title).slice(0, 40)}` : '';
}
