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
 * this change keeps every card and every arrow, laid out in the single-column order the list implied.
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
export const MAX_GROUP_TITLE_CHARS = 40;
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

/** The four edges of a card an arrow can attach to. */
export const WORKFLOW_SIDES = ['left', 'right', 'top', 'bottom'] as const;
export type WorkflowSide = (typeof WORKFLOW_SIDES)[number];

/**
 * What an arrow carries.
 *
 * In a mechatronics diagram not every arrow is control flow: a sensor feeds data, a supply feeds
 * power, a motor feeds a gearbox torque. Drawing all of them the same hides the one thing the
 * diagram is for, so an arrow names its kind and the canvas draws that kind differently — while
 * `flow` stays the meaning of an arrow nobody has classified, which is every arrow drawn before
 * this existed.
 */
export const WORKFLOW_EDGE_TYPES = [
  'flow',
  'data',
  'signal',
  'power',
  'mechanical',
  'communication',
] as const;
export type WorkflowEdgeType = (typeof WORKFLOW_EDGE_TYPES)[number];

/** The one word a chip, a swatch and both exports use for a kind. */
export const EDGE_TYPE_LABEL: Record<WorkflowEdgeType, string> = {
  flow: 'Control',
  data: 'Data',
  signal: 'Signal',
  power: 'Power',
  mechanical: 'Mechanical',
  communication: 'Comms',
};

/**
 * What a dot is for: the socket an arrow plugs into.
 *
 * A card's four dots are its hardware, so an arrow should be able to say it is plugged into an OUT or
 * a PWR, not merely into "the right edge". A port is opt-in and additive: an arrow that never names
 * one keeps the plain dot every diagram drawn before this had, so a stored document round-trips
 * unchanged and nothing on an old canvas moves.
 */
export const PORT_KINDS = ['in', 'out', 'data', 'power', 'mechanical'] as const;
export type PortKind = (typeof PORT_KINDS)[number];

/** The word on a socket's tooltip, in the short form a 200 px card can carry. */
export const PORT_LABEL: Record<PortKind, string> = {
  in: 'IN',
  out: 'OUT',
  data: 'DATA',
  power: 'PWR',
  mechanical: 'MECH',
};

/**
 * The sockets each kind of cable plugs into: what a kind means when nobody overrides it.
 *
 * Control flow has no row on purpose. Every diagram drawn before sockets existed is control flow,
 * and giving it OUT/IN by default would move every one of those dots; an unclassified arrow keeps
 * the plain dot it always had, and OUT/IN are chosen like any other socket.
 */
const EDGE_PORTS: Record<Exclude<WorkflowEdgeType, 'flow'>, { from: PortKind; to: PortKind }> = {
  data: { from: 'data', to: 'data' },
  signal: { from: 'data', to: 'data' },
  power: { from: 'power', to: 'power' },
  mechanical: { from: 'mechanical', to: 'mechanical' },
  communication: { from: 'data', to: 'data' },
};

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
  /** A branch card's condition; it labels that card's outgoing arrows (`edgeLabelFor`). */
  condition?: string;
  x: number;
  y: number;
}

/** One directed arrow, attached to a named side of each card. */
export interface WorkflowEdge {
  id: string;
  from: string;
  to: string;
  /** Which edge of the source card the arrow leaves from. */
  fromSide: WorkflowSide;
  /** Which edge of the target card it lands on. */
  toSide: WorkflowSide;
  /** A restored document's label for the arrow; a branch card's own condition outranks it. */
  label?: string;
  /** What the arrow carries; absent means control flow, which is what it meant before kinds. */
  type?: WorkflowEdgeType;
  /** The socket it leaves from, when that is not the one its kind implies. */
  fromPort?: PortKind;
  /** The socket it lands on, when that is not the one its kind implies. */
  toPort?: PortKind;
}

/**
 * A named frame around cards: "these four are the motor subsystem".
 *
 * A frame stores no rectangle. Its box is read from the cards it holds
 * (`groupRect` in `components/workflow/canvasGeometry.ts`), so a group cannot contain no card, cannot
 * disagree with what is drawn inside it, and moving, dragging or deleting a card needs no second
 * bookkeeping. One card belongs to one frame; grouping cards that already sit in one moves them.
 *
 * A frame has no id of its own: it is read, moved and named by its place in the list, the way a
 * paragraph is. Nothing outside the document ever refers to a frame by a key that could be stale.
 */
export interface WorkflowGroup {
  title: string;
  /** The cards inside it, in document order. */
  nodeIds: string[];
}

export interface WorkflowDoc {
  version: typeof WORKFLOW_VERSION;
  mode: WorkflowMode;
  title: string;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  /** Named frames; absent when the diagram has none, so an ungrouped document is unchanged. */
  groups?: WorkflowGroup[];
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

function isSide(value: unknown): value is WorkflowSide {
  return typeof value === 'string' && (WORKFLOW_SIDES as readonly string[]).includes(value);
}

function isEdgeType(value: unknown): value is WorkflowEdgeType {
  return typeof value === 'string' && (WORKFLOW_EDGE_TYPES as readonly string[]).includes(value);
}

export function isPortKind(value: unknown): value is PortKind {
  return typeof value === 'string' && (PORT_KINDS as readonly string[]).includes(value);
}

/**
 * The socket an arrow's end plugs into, or `null` for a plain dot.
 *
 * A control arrow nobody classified, and an arrow that never named a socket, both read `null`: the
 * classic dot. A typed arrow reads its kind's socket unless the learner has moved that end, which is
 * the one override this model keeps.
 */
export function edgePortOf(edge: WorkflowEdge, end: 'from' | 'to'): PortKind | null {
  const chosen = end === 'from' ? edge.fromPort : edge.toPort;
  if (chosen) return chosen;
  const type = edgeTypeOf(edge);
  return type === 'flow' ? null : EDGE_PORTS[type][end];
}

/**
 * The same arrow with one end moved to a socket, or cleared back to the kind's own.
 *
 * Choosing the socket the kind already implies stores nothing, for the same reason `flow` is an
 * absent field: an arrow nobody moved and one moved back to the same place must read, draw and
 * round-trip identically.
 */
export function withEdgePort(
  edge: WorkflowEdge,
  end: 'from' | 'to',
  kind: PortKind | null
): WorkflowEdge {
  const next = { ...edge };
  const field = end === 'from' ? 'fromPort' : 'toPort';
  const type = edgeTypeOf(edge);
  if (!kind || (type !== 'flow' && kind === EDGE_PORTS[type][end])) delete next[field];
  else next[field] = kind;
  return next;
}

/** A card's four dots and the kind plugged into each; null is an empty dot or a contested one. */
export type SocketKinds = Record<WorkflowSide, PortKind | null>;

/**
 * What is plugged into each dot of each card.
 *
 * Read off the arrows rather than stored twice: an arrow is the thing that knows its socket, so a
 * dot cannot disagree with the cable in it. A dot nothing is plugged into is null, and a dot fed by
 * two different kinds is null too — the card draws the plain dot then, because a socket cannot be
 * two things at once.
 */
export function socketKinds(doc: WorkflowDoc): Map<string, SocketKinds> {
  // A set per dot, not one value rewritten as the arrows are read: null already means "nothing is
  // plugged in" and "two kinds are", so it cannot also be the progress of the scan — kinds A, B, A
  // would otherwise come back as A rather than as a contested dot.
  const found = new Map<string, Record<WorkflowSide, Set<PortKind>>>();
  const add = (nodeId: string, side: WorkflowSide, kind: PortKind | null) => {
    if (!kind) return;
    const record =
      found.get(nodeId) ?? { left: new Set(), right: new Set(), top: new Set(), bottom: new Set() };
    record[side].add(kind);
    found.set(nodeId, record);
  };
  for (const edge of doc.edges) {
    add(edge.from, edge.fromSide, edgePortOf(edge, 'from'));
    add(edge.to, edge.toSide, edgePortOf(edge, 'to'));
  }
  /** One kind reads, more than one is contested, none is empty — all three are null to the card. */
  const one = (kinds: Set<PortKind>): PortKind | null => (kinds.size === 1 ? [...kinds][0] : null);
  return new Map(
    [...found].map(([id, record]) => [
      id,
      {
        left: one(record.left),
        right: one(record.right),
        top: one(record.top),
        bottom: one(record.bottom),
      },
    ])
  );
}

/** The kind an arrow carries; `flow` is the meaning of an arrow that never named one. */
export function edgeTypeOf(edge: WorkflowEdge): WorkflowEdgeType {
  return edge.type ?? 'flow';
}

/**
 * The same arrow with a different kind.
 *
 * `flow` is written as an absent field rather than a stored `'flow'`: an unclassified arrow and a
 * deliberately control-flow one draw, export and round-trip the same, so nothing in a document
 * changes when this feature is not used.
 */
export function withEdgeType(edge: WorkflowEdge, type: WorkflowEdgeType): WorkflowEdge {
  const next = { ...edge };
  if (type === 'flow') delete next.type;
  else next.type = type;
  // The kind decides the sockets: a cable moved to PWR and then changed to Data must follow its new
  // kind rather than keep a socket nothing on the canvas implies.
  delete next.fromPort;
  delete next.toPort;
  return next;
}

/** The next `<prefix><n>` id, past every id of that shape still in the document. */
function nextId(prefix: string, ids: readonly string[]): string {
  let highest = 0;
  for (const id of ids) {
    if (!id.startsWith(prefix)) continue;
    const number = Number(id.slice(prefix.length));
    if (number > highest) highest = number;
  }
  return `${prefix}${highest + 1}`;
}

/** The next free card id: `s1`, `s2`, … A removed id is not reused within one session's edits. */
export function nextStepId(nodes: WorkflowNode[]): string {
  return nextId(
    's',
    nodes.map((node) => node.id)
  );
}

/** The next free arrow id, past every id still in the document. */
export function nextEdgeId(edges: WorkflowEdge[]): string {
  return nextId(
    'e',
    edges.map((edge) => edge.id)
  );
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
  const condition = clean(record.condition, MAX_BRANCH_CONDITION_CHARS);
  if (condition) node.condition = condition;
  const branch = asRecord(record.branch);
  const to = branch ? clean(branch.to, 40) : '';
  return {
    node,
    branch: to ? { to, label: branch ? clean(branch.when, MAX_BRANCH_CONDITION_CHARS) : '' } : null,
  };
}

function readEdge(
  value: unknown
): {
  from: string;
  to: string;
  label: string;
  type: WorkflowEdgeType | undefined;
  fromPort: PortKind | undefined;
  toPort: PortKind | undefined;
  fromSide: WorkflowSide;
  toSide: WorkflowSide;
} | null {
  const record = asRecord(value);
  if (!record) return null;
  const from = clean(record.from, 40);
  const to = clean(record.to, 40);
  if (!from || !to) return null;
  return {
    from,
    to,
    label: clean(record.label, MAX_BRANCH_CONDITION_CHARS),
    type: isEdgeType(record.type) ? record.type : undefined,
    fromPort: isPortKind(record.fromPort) ? record.fromPort : undefined,
    toPort: isPortKind(record.toPort) ? record.toPort : undefined,
    // A version-2 document written before cards had four points carries no side. Right-to-left is
    // the arrow it drew then, so that is what it keeps.
    fromSide: isSide(record.fromSide) ? record.fromSide : 'right',
    toSide: isSide(record.toSide) ? record.toSide : 'left',
  };
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
  const branches: {
    from: string;
    to: string;
    label: string;
    type: undefined;
    fromPort: undefined;
    toPort: undefined;
    fromSide: WorkflowSide;
    toSide: WorkflowSide;
  }[] = [];
  const seen = new Set<string>();
  for (const entry of source) {
    if (nodes.length >= MAX_STEPS) break;
    const read = readNode(entry, mode, `s${nodes.length + 1}`, nodes.length);
    if (!read || seen.has(read.node.id)) continue;
    seen.add(read.node.id);
    nodes.push(read.node);
    if (read.branch) {
      branches.push({
        from: read.node.id,
        to: read.branch.to,
        label: read.branch.label,
        type: undefined,
        fromPort: undefined,
        toPort: undefined,
        // A v1 branch jumped forward; the side curve says "this is not the next step".
        fromSide: 'right',
        toSide: 'left',
      });
    }
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
    type: undefined,
    fromPort: undefined,
    toPort: undefined,
    // The v1 list became a single column, so its implied arrow now runs down the paper.
    fromSide: 'bottom' as WorkflowSide,
    toSide: 'top' as WorkflowSide,
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
    // One arrow per ordered pair: two paths between the same cards would say the same thing twice.
    const key = `${candidate.from}->${candidate.to}`;
    if (drawn.has(key)) continue;
    drawn.add(key);
    const edge: WorkflowEdge = {
      id: `e${edges.length + 1}`,
      from: candidate.from,
      to: candidate.to,
      fromSide: candidate.fromSide,
      toSide: candidate.toSide,
    };
    if (candidate.label) edge.label = candidate.label;
    if (candidate.type && candidate.type !== 'flow') edge.type = candidate.type;
    if (candidate.fromPort) edge.fromPort = candidate.fromPort;
    if (candidate.toPort) edge.toPort = candidate.toPort;
    edges.push(edge);
  }

  // Frames are read after the cards and arrows, because a frame is a claim about which cards exist.
  // A card named by two frames is kept by the first: "drag the motor subsystem" must have one
  // answer. A frame whose cards are all gone is dropped, one with a single card is not — a name on
  // one card is still what the learner said.
  const groups: WorkflowGroup[] = [];
  const claimed = new Set<string>();
  if (rawNodes && Array.isArray(record.groups)) {
    for (const entry of record.groups) {
      const stored = asRecord(entry);
      if (!stored || !Array.isArray(stored.nodeIds)) continue;
      const nodeIds = stored.nodeIds.filter((id): id is string => {
        if (typeof id !== 'string' || !seen.has(id) || claimed.has(id)) return false;
        claimed.add(id);
        return true;
      });
      if (!nodeIds.length) continue;
      groups.push({ title: clean(stored.title, MAX_GROUP_TITLE_CHARS), nodeIds });
    }
  }

  const updatedAt =
    typeof record.updatedAt === 'number' && Number.isFinite(record.updatedAt) && record.updatedAt > 0
      ? record.updatedAt
      : Date.now();
  const doc: WorkflowDoc = {
    version: WORKFLOW_VERSION,
    mode,
    title: clean(record.title, MAX_WORKFLOW_TITLE_CHARS),
    nodes,
    edges,
    updatedAt,
  };
  if (groups.length) doc.groups = groups;
  return doc;
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
/**
 * The number each card wears, read from the one order.
 *
 * The badge on a card, the "Step 3" in a checklist sentence and the "3." in the Markdown are the
 * same fact, so they all come from `workflowOrder`. A canvas has no intrinsic order, and letting the
 * badge count the insertion array while the advice counted the arrows is how a learner is sent to
 * the wrong card.
 */
export function workflowNumbers(doc: WorkflowDoc): Map<string, number> {
  return new Map(workflowOrder(doc).map((node, index) => [node.id, index + 1]));
}

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

/**
 * The text an arrow carries on screen and in an export.
 *
 * A branch card owns its condition, so the arrow follows that card: changing the condition renames
 * every arrow leaving it, and an arrow drawn before the condition was typed shows it too. A restored
 * document may carry a label with no branch card behind it; that label stays the fallback.
 */
export function edgeLabelFor(from: WorkflowNode, edge: WorkflowEdge): string {
  const condition = from.kind === 'branch' ? from.condition ?? '' : '';
  return condition || edge.label || '';
}

/**
 * What the chip over an arrow says: its label, or the kind when the label is still empty.
 *
 * A typed arrow with nothing written on it would otherwise be a line with no word at all, and the
 * kind is the first thing a reader needs from it. `flow` stays silent, because an unclassified
 * arrow is the default and a chip on every one of them would be noise.
 */
export function edgeCaption(from: WorkflowNode, edge: WorkflowEdge): string {
  const label = edgeLabelFor(from, edge);
  if (label) return label;
  const type = edgeTypeOf(edge);
  return type === 'flow' ? '' : EDGE_TYPE_LABEL[type];
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

/** The Mermaid operator each kind draws with; a cable, a wire and a condition are not one line. */
const MERMAID_LINK: Record<WorkflowEdgeType, string> = {
  flow: '-->',
  data: '-.->',
  signal: '-.->',
  power: '==>',
  mechanical: '-->',
  communication: '-.->',
};

/**
 * The workflow as a Mermaid `flowchart`, for a note, a report or a lesson page.
 *
 * Node ids are positional (`n1`, `n2`) rather than the learner's own ids, because a card id is not a
 * safe Mermaid identifier the moment a document is hand-edited. A labelled control arrow is dotted —
 * the branch a person would draw by hand — and an arrow that carries something other than control
 * flow says so in its link text (`data · RPM`), because Mermaid has no second dash to spend.
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
    const type = edgeTypeOf(edge);
    const label = edgeLabelFor(order[from], edge);
    const text = type === 'flow' ? label : [EDGE_TYPE_LABEL[type].toLowerCase(), label].filter(Boolean).join(' · ');
    if (!text) {
      lines.push(`  n${from + 1} ${MERMAID_LINK[type]} n${to + 1}`);
      continue;
    }
    const link = type === 'flow' ? '-.->' : MERMAID_LINK[type];
    lines.push(`  n${from + 1} ${link}|"${mermaidText(text, 40)}"| n${to + 1}`);
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
      const label = edgeLabelFor(node, edge);
      const type = edgeTypeOf(edge);
      // The plain arrow to the next card is the reading order itself; a typed arrow carries something
      // the order does not, so it is always written down.
      if (next && edge.to === next.id && type === 'flow' && !label) continue;
      const to = number.get(edge.to);
      if (to === undefined) continue;
      if (type !== 'flow') {
        const kind = EDGE_TYPE_LABEL[type].toLowerCase();
        lines.push(label ? `   - ${kind}: ${label} → step ${to}` : `   - ${kind} → step ${to}`);
      } else {
        lines.push(label ? `   - if ${label} → step ${to}` : `   - → step ${to}`);
      }
    }
  });
  return lines.join('\n');
}
