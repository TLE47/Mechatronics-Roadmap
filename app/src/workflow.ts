/**
 * A learner's workflow for one problem (`app/src/workflow.ts`).
 *
 * The workbench can say what was run and what is due; it could not say *how the learner decided to
 * approach a question*. That is the part an analysis course is for, and it is invisible in a correct
 * answer: a right number reached by skipping the units check is a habit that will be wrong next week.
 *
 * The shape is a **node graph**: cards a learner drags around a grid, with arrows they draw between
 * them. The two palettes are the kinds a card can be — analysis (given, unknown, model, compute,
 * check, answer) and code (input, transform, branch, loop, test, output) — and a card's position is
 * part of the document, because a plan a person arranged is easier to read than one the app arranged
 * for them. Every stored value still goes through `normalizeWorkflow`, the same rule
 * `editorPanes.ts` follows: junk must not render half a card, duplicate ids must not make React
 * render two nodes for one key, and an arrow must never point at a card that is not there.
 *
 * Version 2 replaced the ordered list. Version 1 documents (a `steps` array with one optional
 * `branch` per step) are migrated on read rather than rejected: a learner who drew a flow before
 * this change keeps every card and every arrow, laid out in the two-column order the list implied.
 *
 * `workflowOrder` is the one reading order: breadth-first from the start cards, so numbering,
 * validation messages, Markdown and Mermaid all agree on which card is "3". A canvas has no single
 * order, and pretending it does is how an arrow ends up labelled "step 5" on a screen that shows it
 * as 2.
 *
 * `validateWorkflow` is advice, never a gate: it names what is missing in a sentence a beginner can
 * act on, and nothing in the app blocks a run or a lesson because a checklist item is open.
 */

export const WORKFLOW_VERSION = 2;
export const MAX_STEPS = 24;
export const MAX_EDGES = 48;
export const MAX_WORKFLOW_TITLE_CHARS = 80;
export const MAX_STEP_TITLE_CHARS = 80;
export const MAX_STEP_DETAIL_CHARS = 400;
export const MAX_STEP_UNIT_CHARS = 16;
export const MAX_BRANCH_CONDITION_CHARS = 60;
/** The furthest a card may be dragged, so a stray pointer cannot make an unscrollable canvas. */
export const MAX_NODE_COORD = 4000;
/** The width a card is laid out at; also the width the canvas reserves for it. */
export const NODE_WIDTH = 200;
export const NODE_ROW = 172;
export const CANVAS_PAD = 16;

export const STEP_KINDS = [
  'given',
  'unknown',
  'model',
  'compute',
  'check',
  'answer',
  'input',
  'transform',
  'branch',
  'loop',
  'test',
  'output',
] as const;

export type StepKind = (typeof STEP_KINDS)[number];
export type WorkflowMode = 'analysis' | 'code';

export const MODE_LABEL: Record<WorkflowMode, string> = { analysis: 'Analysis', code: 'Code' };

/** The glyph a card kind draws, named here so the model needs no UI package to describe it. */
export type WorkflowIcon =
  | 'clipboard'
  | 'help'
  | 'sigma'
  | 'calculator'
  | 'shield'
  | 'flag'
  | 'log-in'
  | 'wand'
  | 'branch'
  | 'repeat'
  | 'test-tube'
  | 'terminal';

export interface KindMeta {
  label: string;
  /** One line, in the second person: what belongs on this card. */
  hint: string;
  /** The palette this card belongs to. `STEPS_BY_MODE` is derived from it, never listed twice. */
  mode: WorkflowMode;
  /** The glyph, resolved to a component by `components/workflowIcons.ts`. */
  icon: WorkflowIcon;
  /** The card a flow may open on. */
  start?: boolean;
  /** The card a flow ends on. */
  terminal?: boolean;
  /** Details that read as arithmetic carry a unit. */
  measured?: boolean;
}

/** The one description of a card kind: label, help, palette, glyph and role. */
export const KIND_META: Record<StepKind, KindMeta> = {
  given: {
    label: 'Given',
    hint: 'What the problem hands you — each number with its unit.',
    mode: 'analysis',
    icon: 'clipboard',
    start: true,
    measured: true,
  },
  unknown: {
    label: 'Unknown',
    hint: 'What you have to find, named before the maths.',
    mode: 'analysis',
    icon: 'help',
    measured: true,
  },
  model: {
    label: 'Model',
    hint: 'The law or relation that connects them, written as a formula.',
    mode: 'analysis',
    icon: 'sigma',
  },
  compute: {
    label: 'Compute',
    hint: 'The arithmetic, with the unit it produces.',
    mode: 'analysis',
    icon: 'calculator',
    measured: true,
  },
  check: {
    label: 'Check',
    hint: 'One bound, sign or size that must hold — and what happens if it does not.',
    mode: 'analysis',
    icon: 'shield',
    measured: true,
  },
  answer: {
    label: 'Answer',
    hint: 'The result, with its unit and the caveat that goes with it.',
    mode: 'analysis',
    icon: 'flag',
    terminal: true,
    measured: true,
  },
  input: {
    label: 'Input',
    hint: 'What arrives — a file, a user, a sensor reading.',
    mode: 'code',
    icon: 'log-in',
    start: true,
  },
  transform: {
    label: 'Transform',
    hint: 'What turns the input into the next thing.',
    mode: 'code',
    icon: 'wand',
  },
  branch: {
    label: 'Branch',
    hint: 'A condition that changes the path.',
    mode: 'code',
    icon: 'branch',
  },
  loop: {
    label: 'Loop',
    hint: 'Repeats until a condition holds — say which condition.',
    mode: 'code',
    icon: 'repeat',
  },
  test: {
    label: 'Test',
    hint: 'A check that can fail, with the value it expects.',
    mode: 'code',
    icon: 'test-tube',
  },
  output: {
    label: 'Output',
    hint: 'What leaves the program — printed, returned, reported.',
    mode: 'code',
    icon: 'terminal',
    terminal: true,
  },
};

/** Each palette, in card order, read off the single table above. */
export const STEPS_BY_MODE: Record<WorkflowMode, StepKind[]> = {
  analysis: STEP_KINDS.filter((kind) => KIND_META[kind].mode === 'analysis'),
  code: STEP_KINDS.filter((kind) => KIND_META[kind].mode === 'code'),
};

/** One card on the canvas. `x`/`y` are canvas pixels from the top-left of the grid. */
export interface WorkflowNode {
  id: string;
  kind: StepKind;
  title: string;
  detail: string;
  /** A unit for a measured card (`A`, `rad/s`, `%`); absent when the card does not need one. */
  unit?: string;
  x: number;
  y: number;
}

/** One directed arrow. `label` is the condition a branch edge carries, when it has one. */
export interface WorkflowEdge {
  id: string;
  from: string;
  to: string;
  label?: string;
}

export interface WorkflowDoc {
  version: typeof WORKFLOW_VERSION;
  mode: WorkflowMode;
  title: string;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  updatedAt: number;
}

export type IssueCode =
  | 'empty-step'
  | 'no-start'
  | 'no-answer'
  | 'unconnected'
  | 'missing-unit'
  | 'model-without-equation'
  | 'check-without-comparison'
  | 'no-check';

export interface WorkflowIssue {
  code: IssueCode;
  stepId: string | null;
  /** `open` is something missing; `hint` is a quality nudge. Neither ever blocks a run. */
  severity: 'open' | 'hint';
  message: string;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function clean(value: unknown, max: number): string {
  if (typeof value !== 'string') return '';
  return value.replace(/^\s+|\s+$/g, '').slice(0, max);
}

function isKind(value: unknown): value is StepKind {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(KIND_META, value);
}

/** The next free card id: `s1`, `s2`, … A removed id is not reused within one session's edits. */
export function nextStepId(nodes: WorkflowNode[]): string {
  let highest = 0;
  for (const node of nodes) {
    const match = /^s(\d+)$/.exec(node.id);
    if (match) highest = Math.max(highest, Number(match[1]));
  }
  return `s${highest + 1}`;
}

/** The next free arrow id, past every id still in the document. */
export function nextEdgeId(edges: WorkflowEdge[]): string {
  let highest = 0;
  for (const edge of edges) {
    const match = /^e(\d+)$/.exec(edge.id);
    if (match) highest = Math.max(highest, Number(match[1]));
  }
  return `e${highest + 1}`;
}

/**
 * Where the card at `index` sits when the app lays it out: one column, top to bottom.
 *
 * A single 200 px column is the only default that survives every surface the tab appears on — a
 * 380 px split, a 390 px phone — without asking the learner to scroll sideways to find the second
 * half of their own flow. Templates and migrated v1 documents use it, and a spawned card takes the
 * first slot still free, so a new card never lands on top of one the learner has dragged.
 */
export function autoNodePosition(index: number): { x: number; y: number } {
  return {
    x: CANVAS_PAD,
    y: CANVAS_PAD + index * NODE_ROW,
  };
}

/** The first grid slot no card already occupies, or a small cascade when every slot is taken. */
export function freeNodePosition(nodes: WorkflowNode[]): { x: number; y: number } {
  for (let index = 0; index < MAX_STEPS * 2; index += 1) {
    const slot = autoNodePosition(index);
    const taken = nodes.some(
      (node) => Math.abs(node.x - slot.x) < NODE_WIDTH + 8 && Math.abs(node.y - slot.y) < 120
    );
    if (!taken) return slot;
  }
  return autoNodePosition(nodes.length);
}

/**
 * Add one card, or refuse at the cap.
 *
 * The bound has to hold at the interaction, not only in `normalizeWorkflow`: a 25th card that renders
 * and is then trimmed on the way to the store is a card the learner watched disappear after a reload.
 * `null` is the refusal, and callers say why rather than adding a card that will not be saved.
 */
export function addWorkflowNode(doc: WorkflowDoc, kind: StepKind): WorkflowDoc | null {
  if (doc.nodes.length >= MAX_STEPS) return null;
  const node: WorkflowNode = {
    id: nextStepId(doc.nodes),
    kind,
    title: '',
    detail: '',
    ...freeNodePosition(doc.nodes),
  };
  return { ...doc, nodes: [...doc.nodes, node] };
}

/** A one-card flow: the smallest thing a learner can start editing, never a blank card. */
export function emptyWorkflow(mode: WorkflowMode, title = '', now: number = Date.now()): WorkflowDoc {
  const start = STEPS_BY_MODE[mode][0];
  return {
    version: WORKFLOW_VERSION,
    mode,
    title: clean(title, MAX_WORKFLOW_TITLE_CHARS),
    nodes: [{ id: 's1', kind: start, title: '', detail: '', ...autoNodePosition(0) }],
    edges: [],
    updatedAt: now,
  };
}

function coord(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return Math.min(MAX_NODE_COORD, Math.max(0, Math.round(value)));
}

interface ReadNode {
  node: WorkflowNode;
  /** The v1 branch this card carried, before arrows were first-class. */
  branch: { to: string; label: string } | null;
}

function readNode(value: unknown, mode: WorkflowMode, fallbackId: string, index: number): ReadNode | null {
  const record = asRecord(value);
  if (!record) return null;
  const rawId = clean(record.id, 40);
  const id = /^[A-Za-z0-9_-]+$/.test(rawId) ? rawId : fallbackId;
  const kind = isKind(record.kind) ? record.kind : STEPS_BY_MODE[mode][0];
  const fallback = autoNodePosition(index);
  const node: WorkflowNode = {
    id,
    kind,
    title: clean(record.title, MAX_STEP_TITLE_CHARS),
    detail: clean(record.detail, MAX_STEP_DETAIL_CHARS),
    x: coord(record.x) ?? fallback.x,
    y: coord(record.y) ?? fallback.y,
  };
  const unit = clean(record.unit, MAX_STEP_UNIT_CHARS);
  if (unit) node.unit = unit;
  const branch = asRecord(record.branch);
  const to = branch ? clean(branch.to, 40) : '';
  return {
    node,
    branch: to ? { to, label: branch ? clean(branch.when, MAX_BRANCH_CONDITION_CHARS) : '' } : null,
  };
}

function readEdge(value: unknown): { from: string; to: string; label: string } | null {
  const record = asRecord(value);
  if (!record) return null;
  const from = clean(record.from, 40);
  const to = clean(record.to, 40);
  if (!from || !to) return null;
  return { from, to, label: clean(record.label, MAX_BRANCH_CONDITION_CHARS) };
}

/**
 * A usable workflow from anything: a v2 graph, a v1 list, a half-written document, or nothing.
 *
 * Junk is dropped card by card rather than taking the whole document's default, so one bad card does
 * not also forget the other nine. Duplicate ids keep the first card, because two nodes with one key
 * is how React renders a stale second copy. An arrow whose ends are gone, points at itself, or
 * repeats one already drawn is dropped here rather than flagged forever: a dangling arrow helps
 * nobody. `null` means "no workflow", which is what a lesson with nothing drawn should show.
 */
export function normalizeWorkflow(value: unknown): WorkflowDoc | null {
  const record = asRecord(value);
  if (!record) return null;
  const mode: WorkflowMode = record.mode === 'code' ? 'code' : 'analysis';
  // A v1 document stores an ordered `steps` list; a v2 one stores `nodes`. Reading both is the
  // migration: the old cards arrive with arrows derived from their branches and positions from the
  // order the list had.
  const rawNodes = Array.isArray(record.nodes) ? record.nodes : null;
  const rawSteps = Array.isArray(record.steps) ? record.steps : [];
  const source = rawNodes ?? rawSteps;

  const nodes: WorkflowNode[] = [];
  const branches: { from: string; to: string; label: string }[] = [];
  const seen = new Set<string>();
  for (const entry of source) {
    if (nodes.length >= MAX_STEPS) break;
    const read = readNode(entry, mode, `s${nodes.length + 1}`, nodes.length);
    if (!read || seen.has(read.node.id)) continue;
    seen.add(read.node.id);
    nodes.push(read.node);
    if (read.branch) branches.push({ from: read.node.id, to: read.branch.to, label: read.branch.label });
  }
  if (nodes.length === 0) return null;

  const rawEdges = rawNodes && Array.isArray(record.edges) ? record.edges : [];
  // A v1 list implied an arrow between consecutive cards, and the old Mermaid drew it. Migration
  // has to keep that arrow, or every card arrives unconnected. Branches go first so a labelled
  // branch to the next card survives the duplicate check with its condition intact.
  const chain = nodes.slice(0, -1).map((node, index) => ({
    from: node.id,
    to: nodes[index + 1].id,
    label: '',
  }));
  const candidates = rawNodes
    ? rawEdges.map(readEdge).filter((edge): edge is NonNullable<typeof edge> => Boolean(edge))
    : [...branches, ...chain];
  const edges: WorkflowEdge[] = [];
  const drawn = new Set<string>();
  for (const candidate of candidates) {
    if (edges.length >= MAX_EDGES) break;
    if (!seen.has(candidate.from) || !seen.has(candidate.to)) continue;
    if (candidate.from === candidate.to) continue;
    const key = `${candidate.from}->${candidate.to}`;
    if (drawn.has(key)) continue;
    drawn.add(key);
    const edge: WorkflowEdge = { id: `e${edges.length + 1}`, from: candidate.from, to: candidate.to };
    if (candidate.label) edge.label = candidate.label;
    edges.push(edge);
  }

  const updatedAt =
    typeof record.updatedAt === 'number' && Number.isFinite(record.updatedAt) && record.updatedAt > 0
      ? record.updatedAt
      : Date.now();
  return {
    version: WORKFLOW_VERSION,
    mode,
    title: clean(record.title, MAX_WORKFLOW_TITLE_CHARS),
    nodes,
    edges,
    updatedAt,
  };
}

/**
 * The order a reader follows the graph: start cards first, then each card an arrow reaches, then
 * anything left over.
 *
 * A canvas has no intrinsic order, but numbering, issue messages, Markdown and Mermaid all need one,
 * and disagreeing about it is worse than any particular choice. Breadth-first from the cards that
 * begin a flow matches how a person reads a diagram left to right, and an unconnected card still
 * appears — at the end — so the checklist can talk about it instead of hiding it.
 */
export function workflowOrder(doc: WorkflowDoc): WorkflowNode[] {
  const byId = new Map(doc.nodes.map((node) => [node.id, node]));
  const outgoing = new Map<string, string[]>();
  const incoming = new Set<string>();
  for (const edge of doc.edges) {
    if (!byId.has(edge.from) || !byId.has(edge.to)) continue;
    incoming.add(edge.to);
    const list = outgoing.get(edge.from);
    if (list) list.push(edge.to);
    else outgoing.set(edge.from, [edge.to]);
  }
  const roots: string[] = [];
  const rooted = new Set<string>();
  for (const node of doc.nodes) {
    if (KIND_META[node.kind].start && !rooted.has(node.id)) {
      roots.push(node.id);
      rooted.add(node.id);
    }
  }
  for (const node of doc.nodes) {
    if (!incoming.has(node.id) && !rooted.has(node.id)) {
      roots.push(node.id);
      rooted.add(node.id);
    }
  }
  for (const node of doc.nodes) {
    if (!rooted.has(node.id)) roots.push(node.id);
  }

  const order: WorkflowNode[] = [];
  const seen = new Set<string>();
  // One component at a time: breadth-first from a root, then the next root. Draining a shared queue
  // would interleave an unconnected card into the middle of a connected flow.
  for (const root of roots) {
    if (seen.has(root)) continue;
    const queue = [root];
    while (queue.length) {
      const id = queue.shift() ?? '';
      if (seen.has(id)) continue;
      const node = byId.get(id);
      if (!node) continue;
      seen.add(id);
      order.push(node);
      for (const next of outgoing.get(id) ?? []) {
        if (!seen.has(next)) queue.push(next);
      }
    }
  }
  for (const node of doc.nodes) {
    if (!seen.has(node.id)) {
      seen.add(node.id);
      order.push(node);
    }
  }
  return order;
}

function hasNumber(text: string): boolean {
  return /\d/.test(text);
}

/**
 * What is missing or worth saying, in the order a learner reads the graph.
 *
 * The rules are deliberately about the *shape* of a worked problem rather than its content: a check
 * that names no comparison is a wish, a compute with a number and no unit is the mistake this course
 * exists to break, and a model written as prose hides the law it is supposed to teach. Nothing here
 * looks at the lesson or the code, so the same advice holds for any problem a learner brings.
 */
export function validateWorkflow(doc: WorkflowDoc): WorkflowIssue[] {
  const issues: WorkflowIssue[] = [];
  const order = workflowOrder(doc);
  const number = new Map(order.map((node, index) => [node.id, index + 1]));
  const connected = new Set<string>();
  for (const edge of doc.edges) {
    connected.add(edge.from);
    connected.add(edge.to);
  }

  if (!doc.nodes.some((node) => KIND_META[node.kind].start)) {
    issues.push({
      code: 'no-start',
      stepId: null,
      severity: 'open',
      message: 'Start with a Given card (or Input in a code flow): the numbers the problem hands you.',
    });
  }

  if (!doc.nodes.some((node) => KIND_META[node.kind].terminal)) {
    issues.push({
      code: 'no-answer',
      stepId: null,
      severity: 'open',
      message:
        doc.mode === 'code'
          ? 'No Output card yet: say what leaves the program.'
          : 'No Answer card yet: state the result, with its unit.',
    });
  }

  for (const node of order) {
    const where = `Step ${number.get(node.id) ?? '?'}`;
    if (!node.title) {
      issues.push({
        code: 'empty-step',
        stepId: node.id,
        severity: 'open',
        message: `${where} needs a title — one idea per card.`,
      });
    }
    if (doc.nodes.length > 1 && !connected.has(node.id)) {
      issues.push({
        code: 'unconnected',
        stepId: node.id,
        severity: 'open',
        message: `${where} is not connected — drag from its dot to the card it feeds.`,
      });
    }
    if (KIND_META[node.kind].measured && hasNumber(node.detail) && !node.unit) {
      issues.push({
        code: 'missing-unit',
        stepId: node.id,
        severity: 'open',
        message: `${where} has a number but no unit — A, V, rad/s, %.`,
      });
    }
    if (node.kind === 'model' && !/[=≈→]/.test(node.detail) && !/[+\-*/×÷]/.test(node.detail)) {
      issues.push({
        code: 'model-without-equation',
        stepId: node.id,
        severity: 'open',
        message: `${where} is the model: write the law or relation, e.g. I = V / R.`,
      });
    }
    if (
      (node.kind === 'check' || node.kind === 'test') &&
      !/[<>=≤≥±]/.test(node.detail) &&
      !/(tolerance|within|fits|pass|fail|assert|equals|clamp)/i.test(node.detail)
    ) {
      issues.push({
        code: 'check-without-comparison',
        stepId: node.id,
        severity: 'hint',
        message: `${where} is a check: say what it compares — <, >, ±, or a tolerance.`,
      });
    }
  }

  const hasCompute = doc.nodes.some((node) => node.kind === 'compute');
  const hasCheck = doc.nodes.some((node) => node.kind === 'check');
  if (hasCompute && !hasCheck) {
    issues.push({
      code: 'no-check',
      stepId: null,
      severity: 'hint',
      message: 'There is a compute but no check — add one bound, sign or size that must hold.',
    });
  }

  return issues;
}

export interface WorkflowSummary {
  steps: number;
  /** Missing things. These are what the panel calls "open". */
  open: number;
  /** Nudges that make a flow better without being missing. */
  hints: number;
}

export function workflowSummary(doc: WorkflowDoc): WorkflowSummary {
  const issues = validateWorkflow(doc);
  return {
    steps: doc.nodes.length,
    open: issues.filter((issue) => issue.severity === 'open').length,
    hints: issues.filter((issue) => issue.severity === 'hint').length,
  };
}

function mermaidText(text: string, max = 64): string {
  return text.replace(/"/g, "'").replace(/\s+/g, ' ').trim().slice(0, max);
}

/**
 * The workflow as a Mermaid `flowchart`, for a note, a report or a lesson page.
 *
 * Node ids are positional (`n1`, `n2`) rather than the learner's own ids, because a card id is not a
 * safe Mermaid identifier the moment a document is hand-edited. A labelled arrow is dotted —
 * the branch a person would draw by hand.
 */
export function workflowToMermaid(doc: WorkflowDoc): string {
  const order = workflowOrder(doc);
  const index = new Map(order.map((node, position) => [node.id, position]));
  const lines = ['flowchart TD'];
  order.forEach((node, position) => {
    const label = `${KIND_META[node.kind].label} · ${node.title || 'untitled'}`;
    lines.push(`  n${position + 1}["${mermaidText(label)}"]`);
  });
  for (const edge of doc.edges) {
    const from = index.get(edge.from);
    const to = index.get(edge.to);
    if (from === undefined || to === undefined) continue;
    if (edge.label) {
      lines.push(`  n${from + 1} -.->|"${mermaidText(edge.label, 40)}"| n${to + 1}`);
    } else {
      lines.push(`  n${from + 1} --> n${to + 1}`);
    }
  }
  return lines.join('\n');
}

/**
 * The workflow as Markdown, one numbered card each.
 *
 * The arrow to the next card in reading order is the flow and is left implicit; every other arrow is
 * listed, because that is the branch or the jump a reader has to be told about. Numbers match the
 * screen, so "if it saturates, go to 5" in a note and on the canvas are the same card.
 */
export function workflowToMarkdown(doc: WorkflowDoc): string {
  const order = workflowOrder(doc);
  const number = new Map(order.map((node, position) => [node.id, position + 1]));
  const title = doc.title || 'Workflow';
  const lines = [`### Workflow — ${title}`];
  order.forEach((node, position) => {
    const label = KIND_META[node.kind].label;
    const unit = node.unit ? ` _(${node.unit})_` : '';
    const detail = node.detail ? ` — ${node.detail}` : '';
    lines.push(`${position + 1}. **${label}** — ${node.title || 'untitled'}${detail}${unit}`);
    const next = order[position + 1];
    for (const edge of doc.edges) {
      if (edge.from !== node.id) continue;
      if (next && edge.to === next.id && !edge.label) continue;
      const to = number.get(edge.to);
      if (to === undefined) continue;
      lines.push(edge.label ? `   - if ${edge.label} → step ${to}` : `   - → step ${to}`);
    }
  });
  return lines.join('\n');
}
