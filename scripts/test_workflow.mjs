#!/usr/bin/env node
/**
 * The learner's workflow without a browser (`scripts/test_workflow.mjs`, `npm run test:workflow`).
 *
 * Four kinds of rule, and each one is invisible until it bites:
 *
 * 1. **A stored document is validated, not trusted.** A card with no id, a repeated key, an arrow
 *    pointing at a card that was deleted, a document with 300 cards: all of them either come back as
 *    something the canvas can draw or as no workflow at all. A version-1 list migrates to version-2
 *    nodes and arrows with every card kept.
 * 2. **The advice is advice.** Every issue names the card it is about in a sentence a beginner can
 *    act on, and a wrong diagram never becomes an error that blocks a run.
 * 3. **The graph leaves the panel as Mermaid and Markdown.** Both read the same order the numbering
 *    uses, so a branch that says "step 3" is card 3 on screen.
 * 4. **Authored work survives.** One workflow per lesson, a refused write reported rather than
 *    swallowed, and a merge that adds and updates but never deletes.
 * 5. **A frame is a claim about which cards exist.** Restoring a document drops a frame whose cards
 *    are gone, keeps a card in only one frame, and adds nothing to a document that had no frames.
 *
 * Run: node --experimental-strip-types scripts/test_workflow.mjs
 */

import assert from 'node:assert/strict';
import { Window } from 'happy-dom';
import {
  HISTORY_BURST_MS,
  MAX_HISTORY,
  emptyHistory,
  recordHistory,
  stepHistory,
} from '../app/src/workflowHistory.ts';
import {
  MAX_GROUP_TITLE_CHARS,
  MAX_BRANCH_CONDITION_CHARS,
  MAX_EDGES,
  MAX_FONT_SIZE,
  MAX_NODE_COORD,
  MAX_STEPS,
  MIN_FONT_SIZE,
  MAX_STEP_DETAIL_CHARS,
  MAX_STEP_LESSON_CHARS,
  MAX_STEP_NOTE_CHARS,
  MAX_STEP_TITLE_CHARS,
  MAX_STEP_UNIT_CHARS,
  MAX_WORKFLOW_TITLE_CHARS,
  EDGE_ROUTES,
  EDGE_ROUTE_LABEL,
  EDGE_TYPE_LABEL,
  KIND_META,
  NODE_SHAPE,
  STEP_KINDS,
  WORKFLOW_EDGE_TYPES,
  WORKFLOW_SIDES,
  STEPS_BY_MODE,
  addWorkflowNode,
  autoNodePosition,
  edgeCaption,
  edgeLabelFor,
  edgePortOf,
  edgeRouteOf,
  edgeTypeOf,
  socketKinds,
  withEdgePort,
  withEdgeRoute,
  emptyWorkflow,
  nextEdgeId,
  nextStepId,
  normalizeWorkflow,
  validateWorkflow,
  workflowNumbers,
  workflowOrder,
  workflowSummary,
  workflowToMarkdown,
  workflowToMermaid,
  withEdgeType,
} from '../app/src/workflow.ts';
import { cardType } from '../app/src/components/workflow/cardStyle.ts';
import {
  annotateNode,
  connectNodes,
  groupCards,
  linkNewNode,
  moveNodes,
  removeGroup,
  removeNode,
  renameGroup,
} from '../app/src/workflowEdits.ts';
import { clipCard, pasteCard } from '../app/src/workflowClipboard.ts';
import {
  WORKFLOW_TEMPLATES,
  templateById,
  templateForLesson,
  templatesForMode,
} from '../app/src/workflowTemplates.ts';
import {
  MAX_LANES,
  PROCESS_KINDS,
  forkJoinIssues,
  isForkJoin,
  laneBlocks,
  laneIndexOf,
  laneMarkdown,
  moveNodeToLane,
  readLanes,
  removeLane,
  renameLane,
  withLane,
  withoutNodeFromLanes,
} from '../app/src/workflowProcesses.ts';
import {
  STORAGE_KEY_WORKFLOW,
  WORKFLOW_GUIDE_KEY,
  clearWorkflow,
  markWorkflowGuideSeen,
  mergeWorkflows,
  parseWorkflowStore,
  readWorkflow,
  readWorkflowGuideSeen,
  readWorkflowStore,
  replaceWorkflows,
  saveWorkflow,
  workflowCounts,
} from '../app/src/workflowStore.ts';

let passed = 0;
let failed = 0;
const entries = [];

function section(title) {
  entries.push({ section: title });
}

function check(name, fn) {
  entries.push({ name, fn });
}

/** A fresh browser, a bucket that throws on access, or a bucket that refuses the write. */
function freshBrowser({ store = 'works' } = {}) {
  const window = new Window({ url: 'https://example.test/' });
  globalThis.window = window;
  globalThis.document = window.document;
  if (store === 'throws') {
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      get() {
        throw new Error('SecurityError: localStorage is disabled');
      },
    });
  } else if (store === 'full') {
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      writable: true,
      value: {
        getItem: () => null,
        setItem() {
          throw new Error('QuotaExceededError');
        },
        removeItem() {},
        clear() {},
        key: () => null,
        length: 0,
      },
    });
  } else {
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      writable: true,
      value: window.localStorage,
    });
  }
  return window;
}

/** A v2 document built by hand, for the cases `normalizeWorkflow` would repair away. */
function graph(nodes, edges = [], { mode = 'analysis', title = 'Test' } = {}) {
  return {
    version: 2,
    mode,
    title,
    nodes: nodes.map((node, index) => ({
      id: `s${index + 1}`,
      kind: 'given',
      title: '',
      detail: '',
      ...autoNodePosition(index),
      ...node,
    })),
    edges: edges.map((edge, index) => ({ id: `e${index + 1}`, ...edge })),
    updatedAt: 1000,
  };
}

/** A v1 document: an ordered list with at most one branch per card. */
function v1(steps, { mode = 'analysis', title = 'Test' } = {}) {
  return {
    version: 1,
    mode,
    title,
    steps: steps.map((step, index) => ({ id: `s${index + 1}`, kind: 'given', title: '', detail: '', ...step })),
    updatedAt: 1000,
  };
}

function chain(length) {
  return Array.from({ length }, (_, index) => ({ from: `s${index + 1}`, to: `s${index + 2}` })).slice(
    0,
    length - 1
  );
}

const good = graph(
  [
    { kind: 'given', title: 'Numbers', detail: '12.0 V, 2.4 ohm', unit: 'V, ohm' },
    { kind: 'unknown', title: 'Find it', detail: 'the stall current', unit: 'A' },
    { kind: 'model', title: 'Law', detail: 'I = V / R' },
    { kind: 'compute', title: 'Divide', detail: '12.0 / 2.4 = 5.00', unit: 'A' },
    { kind: 'check', title: 'Limit', detail: '5.00 A > 3.20 A peak', unit: 'A' },
    { kind: 'answer', title: 'Say it', detail: 'limit to 3.2 A', unit: 'A' },
  ],
  chain(6)
);

section('1. A stored document is validated, not trusted');

check('nothing and junk are no workflow, not an empty card', () => {
  for (const value of [null, undefined, 0, 'given', [], {}, { nodes: [] }, { steps: [] }, { steps: 's1' }]) {
    assert.equal(normalizeWorkflow(value), null, `junk ${JSON.stringify(value)}`);
  }
});

check('a good graph round-trips with its ids, units, positions and timestamp', () => {
  const normalized = normalizeWorkflow(good);
  assert.equal(normalized.version, 2);
  assert.equal(normalized.nodes.length, 6);
  assert.equal(normalized.edges.length, 5);
  assert.equal(normalized.nodes[0].id, 's1');
  assert.equal(normalized.nodes[3].unit, 'A');
  assert.deepEqual({ x: normalized.nodes[1].x, y: normalized.nodes[1].y }, autoNodePosition(1));
  assert.equal(normalized.updatedAt, 1000);
  assert.equal(normalized.mode, 'analysis');
});

check('a version-1 list migrates: every card kept, its branch becomes a labelled arrow', () => {
  const normalized = normalizeWorkflow(
    v1([
      { kind: 'given', title: 'a', detail: '12 V', unit: 'V' },
      { kind: 'compute', title: 'b', detail: '5 A', unit: 'A' },
      { kind: 'branch', title: 'c', detail: 'if hot', branch: { when: '5 A > 3.2 A', to: 's2' } },
      { kind: 'answer', title: 'd', detail: 'limit', unit: 'A' },
    ])
  );
  assert.equal(normalized.version, 2);
  assert.deepEqual(
    normalized.nodes.map((node) => node.title),
    ['a', 'b', 'c', 'd']
  );
  assert.deepEqual(
    normalized.nodes.map((node) => node.kind),
    ['given', 'compute', 'branch', 'answer']
  );
  assert.deepEqual(normalized.nodes[2].y, autoNodePosition(2).y, 'positions follow the old order');
  const branch = normalized.edges.find((edge) => edge.from === 's3');
  assert.equal(branch.to, 's2');
  assert.equal(branch.label, '5 A > 3.2 A');
  assert.equal(
    normalized.edges.some((edge) => edge.from === 's1' && edge.to === 's2'),
    true,
    'the list’s implied chain must survive as real arrows'
  );
  assert.equal(normalized.edges.length, 4, 'three chain arrows and the one branch');
});

check('an old version-2 arrow keeps the right-to-left attachment it was drawn with', () => {
  const normalized = normalizeWorkflow(good);
  for (const edge of normalized.edges) {
    assert.equal(edge.fromSide, 'right', `${edge.from}->${edge.to} lost its source side`);
    assert.equal(edge.toSide, 'left', `${edge.from}->${edge.to} lost its target side`);
  }
  assert.equal(normalized.edges.length, 5);
});

check('a side the editor never offered is repaired instead of rendering off the card', () => {
  const normalized = normalizeWorkflow(
    graph(
      [{ title: 'a' }, { title: 'b' }],
      [{ from: 's1', to: 's2', fromSide: 'sideways', toSide: 'bottom' }]
    )
  );
  assert.equal(normalized.edges[0].fromSide, 'right');
  assert.equal(normalized.edges[0].toSide, 'bottom');
});

check('a version-1 column migrates with its chain down the paper, and branches around it', () => {
  const normalized = normalizeWorkflow(
    v1([
      { kind: 'given', title: 'a' },
      { kind: 'compute', title: 'b' },
      { kind: 'answer', title: 'c', branch: { when: 'wrong', to: 's1' } },
    ])
  );
  const chain = normalized.edges.filter((edge) => !edge.label);
  assert.deepEqual(
    chain.map((edge) => `${edge.fromSide}->${edge.toSide}`),
    ['bottom->top', 'bottom->top'],
    'the implied chain must read down the one-column migration'
  );
  const branch = normalized.edges.find((edge) => edge.label);
  assert.deepEqual([branch.fromSide, branch.toSide], ['right', 'left']);
  for (const edge of normalized.edges) {
    assert.ok(WORKFLOW_SIDES.includes(edge.fromSide), edge.fromSide);
    assert.ok(WORKFLOW_SIDES.includes(edge.toSide), edge.toSide);
  }
});

check('a junk card is dropped and the rest kept', () => {
  const normalized = normalizeWorkflow({
    nodes: [good.nodes[0], null, 'nope', { kind: 'model', title: 'Law', detail: 'I = V / R' }],
  });
  assert.equal(normalized.nodes.length, 2);
  assert.equal(normalized.nodes[1].title, 'Law');
});

check('a duplicate id keeps the first card', () => {
  const normalized = normalizeWorkflow({
    nodes: [
      { id: 's1', kind: 'given', title: 'first', detail: '' },
      { id: 's1', kind: 'given', title: 'second', detail: '' },
    ],
  });
  assert.deepEqual(
    normalized.nodes.map((node) => node.title),
    ['first']
  );
});

check('an id that cannot be a key is replaced, and a missing one is numbered', () => {
  const normalized = normalizeWorkflow({
    nodes: [
      { id: 'has space', kind: 'given', title: 'a', detail: '' },
      { kind: 'given', title: 'b', detail: '' },
    ],
  });
  assert.deepEqual(
    normalized.nodes.map((node) => node.id),
    ['s1', 's2']
  );
});

check('text is cut to its own bound, never skipped', () => {
  const normalized = normalizeWorkflow({
    title: 't'.repeat(MAX_WORKFLOW_TITLE_CHARS + 20),
    nodes: [
      {
        id: 's1',
        kind: 'compute',
        title: 'x'.repeat(MAX_STEP_TITLE_CHARS + 20),
        detail: 'd'.repeat(MAX_STEP_DETAIL_CHARS + 20),
        unit: 'u'.repeat(MAX_STEP_UNIT_CHARS + 5),
        note: 'n'.repeat(MAX_STEP_NOTE_CHARS + 5),
        lesson: 'l'.repeat(MAX_STEP_LESSON_CHARS + 5),
      },
      { id: 's2', kind: 'answer', title: 'end', detail: '' },
    ],
    edges: [{ from: 's1', to: 's2', label: 'w'.repeat(MAX_BRANCH_CONDITION_CHARS + 5) }],
  });
  assert.equal(normalized.title.length, MAX_WORKFLOW_TITLE_CHARS);
  assert.equal(normalized.nodes[0].title.length, MAX_STEP_TITLE_CHARS);
  assert.equal(normalized.nodes[0].detail.length, MAX_STEP_DETAIL_CHARS);
  assert.equal(normalized.nodes[0].unit.length, MAX_STEP_UNIT_CHARS);
  assert.equal(normalized.nodes[0].note.length, MAX_STEP_NOTE_CHARS);
  assert.equal(normalized.nodes[0].lesson.length, MAX_STEP_LESSON_CHARS);
  assert.equal(normalized.edges[0].label.length, MAX_BRANCH_CONDITION_CHARS);
});

check('a card’s fill, ink and size are theme tokens; junk and absence add no field', () => {
  const styled = normalizeWorkflow(
    graph([
      { title: 'tinted', fill: 'amber', ink: 'rose', size: 'lg' },
      { title: 'junk', fill: '#ff0000', ink: 'nonsense', size: 'xl' },
    ])
  );
  assert.equal(styled.nodes[0].fill, 'amber');
  assert.equal(styled.nodes[0].ink, 'rose');
  assert.equal(styled.nodes[0].size, 'lg');
  for (const field of ['fill', 'ink', 'size']) {
    assert.equal(field in styled.nodes[1], false, `an unknown ${field} is dropped, not stored`);
  }
  for (const node of normalizeWorkflow(good).nodes) {
    for (const field of ['fill', 'ink', 'size']) {
      assert.equal(field in node, false, `a document saved before styling gains no ${field}`);
    }
  }
  const small = normalizeWorkflow(graph([{ title: 'a', size: 'sm', fill: 'purple' }]));
  assert.equal(small.nodes[0].size, 'sm');
  assert.equal(small.nodes[0].fill, 'purple');
  // Size is any whole pixel in the model's own range, not only the two steps an older document can
  // hold: a number is kept as itself, one outside the range is dropped like any other junk.
  const sized = normalizeWorkflow(
    graph([
      { title: 'free', size: 17 },
      { title: 'too big', size: MAX_FONT_SIZE + 1 },
      { title: 'too small', size: MIN_FONT_SIZE - 1 },
      { title: 'rounded', size: 9.6 },
      { title: 'not a number', size: '17' },
    ])
  );
  assert.equal(sized.nodes[0].size, 17);
  assert.equal('size' in sized.nodes[1], false, 'a size above the range is dropped');
  assert.equal('size' in sized.nodes[2], false, 'and one below it');
  assert.equal(sized.nodes[3].size, 10, 'a fractional size is rounded to the scale the slider offers');
  assert.equal('size' in sized.nodes[4], false, 'a string size is not a number');
  // The two named steps and the free scale draw from one mapping: a chosen pixel size keeps the
  // detail one pixel under its title, and an unset card draws exactly where it always did.
  assert.deepEqual(cardType(undefined), { title: 12, detail: 11 });
  assert.deepEqual(cardType('lg'), { title: 14, detail: 12.5 });
  assert.deepEqual(cardType(17), { title: 17, detail: 16 });
});

check('a copied card pastes with its words and look, as a new card and without its arrows', () => {
  const source = normalizeWorkflow(
    graph(
      [
        { kind: 'branch', title: 'Load $F$ ok?', detail: 'read the rail', condition: 'draw > 3 A', fill: 'amber', ink: 'rose', size: 15, note: 'check the supply', lesson: 'P.15' },
        { kind: 'answer', title: 'done' },
      ],
      [{ from: 's1', to: 's2' }]
    )
  );
  const clip = clipCard(source.nodes[0]);
  const pasted = pasteCard(source, clip);
  assert.ok(pasted, 'a document with room must paste');
  assert.equal(pasted.nodes.length, source.nodes.length + 1, 'pasting adds one card');
  const added = pasted.nodes[pasted.nodes.length - 1];
  assert.notEqual(added.id, source.nodes[0].id, 'the copy takes an id of its own');
  for (const field of ['kind', 'title', 'detail', 'condition', 'fill', 'ink', 'size', 'note', 'lesson']) {
    assert.deepEqual(added[field], source.nodes[0][field], `the copy keeps ${field}`);
  }
  assert.deepEqual(pasted.edges, source.edges, 'and copies no arrow, which would have no second end');
  const at = pasteCard(source, clip, { x: 400, y: 480 });
  const centred = at.nodes[at.nodes.length - 1];
  assert.ok(centred.x < 400 && centred.x + 200 > 400, 'a paste on paper centres the card on the press');
  assert.ok(centred.y >= 440 && centred.y <= 480, 'and drops it under the pointer');
  // Nothing on the clip carries the source's id or position into the new card.
  assert.equal(pasted.nodes.filter((node) => node.id === added.id).length, 1, 'one card holds the new id');
});

check('an unknown kind becomes the mode’s opening card', () => {
  assert.equal(normalizeWorkflow({ nodes: [{ kind: 'nonsense', title: 'a' }] }).nodes[0].kind, 'given');
  assert.equal(
    normalizeWorkflow({ mode: 'code', nodes: [{ kind: 'nonsense', title: 'a' }] }).nodes[0].kind,
    'input'
  );
});

check('an arrow to a card that is gone, to itself, or drawn twice is dropped', () => {
  const normalized = normalizeWorkflow(
    graph(
      [
        { id: 's1', title: 'a' },
        { id: 's2', title: 'b' },
      ],
      [
        { from: 's1', to: 's9', label: 'gone' },
        { from: 's1', to: 's1' },
        { from: 's1', to: 's2', label: 'hot' },
        { from: 's1', to: 's2', label: 'cold' },
      ]
    )
  );
  assert.deepEqual(
    normalized.edges.map((edge) => `${edge.from}->${edge.to}:${edge.label ?? ''}`),
    ['s1->s2:hot'],
    'only the first real arrow survives, with its label'
  );
});

check('a document is capped at 24 cards and 48 arrows', () => {
  const many = Array.from({ length: MAX_STEPS + 10 }, (_, index) => ({
    kind: 'given',
    title: `card ${index}`,
  }));
  assert.equal(normalizeWorkflow({ nodes: many }).nodes.length, MAX_STEPS);
  const pairs = [];
  for (let offset = 1; offset <= 3; offset += 1) {
    for (let index = 0; index < MAX_STEPS; index += 1) {
      pairs.push({
        from: `s${index + 1}`,
        to: `s${((index + offset) % MAX_STEPS) + 1}`,
      });
    }
  }
  const dense = graph(
    Array.from({ length: MAX_STEPS }, (_, index) => ({ id: `s${index + 1}`, title: `card ${index}` })),
    pairs
  );
  assert.equal(normalizeWorkflow(dense).edges.length, MAX_EDGES);
});

check('the next ids are past the highest one, and an empty flow starts at s1', () => {
  assert.equal(nextStepId([]), 's1');
  assert.equal(nextStepId([{ id: 's1' }, { id: 's7' }]), 's8');
  assert.equal(nextStepId([{ id: 'custom' }]), 's1', 'a hand-named card does not block the counter');
  assert.equal(nextEdgeId([]), 'e1');
  assert.equal(nextEdgeId([{ id: 'e1' }, { id: 'e4' }]), 'e5');
  assert.equal(nextEdgeId([{ id: 'e1' }, { id: 'e3' }]), 'e4', 'a removed id is not reused');
});

check('an empty workflow is one opening card, never zero', () => {
  const start = emptyWorkflow('analysis', 'My problem', 500);
  assert.equal(start.nodes.length, 1);
  assert.equal(start.nodes[0].kind, 'given');
  assert.deepEqual({ x: start.nodes[0].x, y: start.nodes[0].y }, autoNodePosition(0));
  assert.equal(start.title, 'My problem');
  assert.equal(start.updatedAt, 500);
  assert.deepEqual(start.edges, []);
  assert.equal(emptyWorkflow('code').nodes[0].kind, 'input');
});

check('a card is added up to the cap, and the 25th is refused without touching the document', () => {
  let doc = emptyWorkflow('analysis', 'Cap');
  for (let i = 1; i < MAX_STEPS; i += 1) {
    const next = addWorkflowNode(doc, 'given');
    assert.ok(next, `card ${i + 1} must be accepted`);
    doc = next;
  }
  assert.equal(doc.nodes.length, MAX_STEPS);
  const before = JSON.stringify(doc);
  assert.equal(
    addWorkflowNode(doc, 'given'),
    null,
    'the card past the cap must be refused, not added and trimmed on the way to the store'
  );
  assert.equal(JSON.stringify(doc), before, 'a refusal must not mutate the document it was given');
  assert.equal(normalizeWorkflow(doc).nodes.length, MAX_STEPS, 'and what the store keeps is the same 24');
  const room = addWorkflowNode({ ...doc, nodes: doc.nodes.slice(0, 3) }, 'answer');
  assert.equal(room.nodes.length, 4, 'removing one makes room again');
  assert.equal(room.nodes[3].id, 's4', 'the new id is past the highest, not the length plus one');
  assert.equal(room.nodes[3].kind, 'answer');
});

check('a spawned card lands on a free slot, never on top of one already placed', () => {
  const doc = emptyWorkflow('analysis', 'Slots');
  const second = addWorkflowNode(doc, 'compute');
  const third = addWorkflowNode(second, 'check');
  assert.deepEqual({ x: third.nodes[2].x, y: third.nodes[2].y }, autoNodePosition(2));
  // The learner parks the first card on the third slot; the next spawn must take the slot that
  // opened up, not lay a card under the one they just moved.
  const moved = {
    ...third,
    nodes: third.nodes.map((node, index) =>
      index === 0 ? { ...node, ...autoNodePosition(2) } : node
    ),
  };
  const fourth = addWorkflowNode(moved, 'model');
  assert.deepEqual({ x: fourth.nodes[3].x, y: fourth.nodes[3].y }, autoNodePosition(0));
});

check('a dragged card is clamped to the canvas and rounded to a pixel', () => {
  const normalized = normalizeWorkflow(
    graph([
      { id: 's1', title: 'a', x: -20, y: MAX_NODE_COORD + 500 },
      { id: 's2', title: 'b', x: 123.6, y: 'far' },
    ])
  );
  assert.equal(normalized.nodes[0].x, 0);
  assert.equal(normalized.nodes[0].y, MAX_NODE_COORD);
  assert.equal(normalized.nodes[1].x, 124);
  assert.deepEqual({ x: normalized.nodes[1].x, y: normalized.nodes[1].y }, {
    x: 124,
    y: autoNodePosition(1).y,
  });
});

section('2. The advice names the card and never blocks');

check('a well-shaped analysis has nothing to say', () => {
  assert.deepEqual(validateWorkflow(good), []);
  assert.deepEqual(workflowSummary(good), { steps: 6, open: 0, hints: 0 });
});

check('a flow that opens on the model has no start', () => {
  const issues = validateWorkflow(graph([{ kind: 'model', title: 'Law', detail: 'I = V / R' }]));
  assert.equal(issues.find((issue) => issue.code === 'no-start').severity, 'open');
});

check('a flow with no answer says so, and an unconnected card is named', () => {
  const issues = validateWorkflow(
    graph([
      { kind: 'given', title: 'a', detail: '12 V', unit: 'V' },
      { kind: 'compute', title: 'b', detail: '5 A', unit: 'A' },
    ])
  );
  assert.ok(issues.some((issue) => issue.code === 'no-answer'));
  const loose = validateWorkflow(
    graph(
      [
        { kind: 'given', title: 'a', detail: '12 V', unit: 'V' },
        { kind: 'answer', title: 'b', detail: '5 A', unit: 'A' },
        { kind: 'check', title: 'c', detail: '5 A > 3.2 A', unit: 'A' },
      ],
      chain(2)
    )
  );
  const unconnected = loose.find((issue) => issue.code === 'unconnected');
  assert.equal(unconnected.severity, 'open');
  assert.equal(unconnected.stepId, 's3');
  assert.match(unconnected.message, /^Step 3 is not connected/);
  const joined = { ...good, edges: [...good.edges, { id: 'e99', from: 's5', to: 's1' }] };
  assert.equal(validateWorkflow(joined).some((issue) => issue.code === 'unconnected'), false);
});

check('a number without a unit is open, and the sentence names the card', () => {
  const issues = validateWorkflow(
    graph(
      [
        { kind: 'given', title: 'a', detail: '12 V', unit: 'V' },
        { kind: 'compute', title: 'b', detail: '12 / 2.4 = 5.0' },
        { kind: 'answer', title: 'c', detail: '5.0 A', unit: 'A' },
      ],
      chain(3)
    )
  );
  const missing = issues.filter((issue) => issue.code === 'missing-unit');
  assert.equal(missing.length, 1);
  assert.equal(missing[0].stepId, 's2');
  assert.match(missing[0].message, /^Step 2 /);
});

check('a model written as prose is open; one with a relation is not', () => {
  const prose = validateWorkflow(
    graph(
      [
        { kind: 'given', title: 'a', detail: '12 V', unit: 'V' },
        { kind: 'model', title: 'b', detail: 'use the voltage and the resistance' },
        { kind: 'answer', title: 'c', detail: '5 A', unit: 'A' },
      ],
      chain(3)
    )
  );
  assert.ok(prose.some((issue) => issue.code === 'model-without-equation'));
  const formula = validateWorkflow(
    graph(
      [
        { kind: 'given', title: 'a', detail: '12 V', unit: 'V' },
        { kind: 'model', title: 'b', detail: 'I = V / R' },
        { kind: 'answer', title: 'c', detail: '5 A', unit: 'A' },
      ],
      chain(3)
    )
  );
  assert.equal(formula.length, 0);
});

check('a check with nothing to compare is a hint, not a missing piece', () => {
  const issues = validateWorkflow(
    graph(
      [
        { kind: 'given', title: 'a', detail: '12 V', unit: 'V' },
        { kind: 'compute', title: 'b', detail: '5 A', unit: 'A' },
        { kind: 'check', title: 'c', detail: 'make sure the driver is happy' },
        { kind: 'answer', title: 'd', detail: '5 A or limit', unit: 'A' },
      ],
      chain(4)
    )
  );
  const vague = issues.find((issue) => issue.code === 'check-without-comparison');
  assert.equal(vague.severity, 'hint');
  const named = validateWorkflow(
    graph(
      [
        { kind: 'given', title: 'a', detail: '12 V', unit: 'V' },
        { kind: 'compute', title: 'b', detail: '5 A', unit: 'A' },
        { kind: 'check', title: 'c', detail: '5 A > 3.2 A' },
        { kind: 'answer', title: 'd', detail: '5 A or limit', unit: 'A' },
      ],
      chain(4)
    )
  );
  assert.equal(named.some((issue) => issue.code === 'check-without-comparison'), false);
});

check('a compute with no check earns the one nudge', () => {
  const issues = validateWorkflow(
    graph(
      [
        { kind: 'given', title: 'a', detail: '12 V', unit: 'V' },
        { kind: 'compute', title: 'b', detail: '5 A', unit: 'A' },
        { kind: 'answer', title: 'c', detail: '5 A', unit: 'A' },
      ],
      chain(3)
    )
  );
  assert.ok(issues.some((issue) => issue.code === 'no-check' && issue.severity === 'hint'));
});

check('an untitled card is open, and the summary counts it', () => {
  const untitled = graph(
    [
      { kind: 'given', title: '' },
      { kind: 'answer', title: 'b', detail: '' },
    ],
    chain(2)
  );
  const issues = validateWorkflow(untitled);
  assert.ok(issues.some((issue) => issue.code === 'empty-step' && issue.stepId === 's1'));
  assert.equal(workflowSummary(untitled).open, 1);
});

check('a code flow is judged by its own start and terminal cards', () => {
  const code = graph(
    [
      { kind: 'input', title: 'in', detail: '' },
      { kind: 'test', title: 'check', detail: 'assert f(1) == 2' },
      { kind: 'output', title: 'out', detail: 'print(f(1))' },
    ],
    chain(3),
    { mode: 'code' }
  );
  assert.deepEqual(validateWorkflow(code), []);
});

section('3. One reading order for numbering, exports and advice');

check('the order starts at a start card, follows the arrows, and puts loose cards last', () => {
  const doc = graph(
    [
      { id: 's1', kind: 'unknown', title: 'loose' },
      { id: 's2', kind: 'given', title: 'start' },
      { id: 's3', kind: 'compute', title: 'middle' },
      { id: 's4', kind: 'answer', title: 'end' },
    ],
    [
      { from: 's2', to: 's3' },
      { from: 's3', to: 's4' },
    ]
  );
  assert.deepEqual(
    workflowOrder(doc).map((node) => node.id),
    ['s2', 's3', 's4', 's1'],
    'the start card comes first even when it was drawn last'
  );
});

check('the number a card wears is its place in the one reading order', () => {
  // Insertion order is s1, s2, s3; the arrows read s1 → s3 → s2. The badge and the advice have to
  // agree with the arrows, or "Step 3" names a different card on screen.
  const doc = graph(
    [
      { id: 's1', kind: 'given', title: 'start' },
      { id: 's2', kind: 'answer', title: '' },
      { id: 's3', kind: 'compute', title: 'middle' },
    ],
    [
      { from: 's1', to: 's3' },
      { from: 's3', to: 's2' },
    ]
  );
  const numbers = workflowNumbers(doc);
  assert.deepEqual([...numbers.entries()], [
    ['s1', 1],
    ['s3', 2],
    ['s2', 3],
  ]);
  const issue = validateWorkflow(doc).find((entry) => entry.code === 'empty-step');
  assert.equal(issue.stepId, 's2');
  assert.match(issue.message, /^Step 3 needs a title/);
  assert.equal(numbers.get(issue.stepId), 3, 'the sentence and the badge name the same number');
  assert.match(workflowToMarkdown(doc), /^3\. \*\*Answer\*\* — untitled$/m);
});

check('a branch is followed before a card no arrow reaches', () => {
  const doc = graph(
    [
      { id: 's1', kind: 'given', title: 'start' },
      { id: 's2', kind: 'check', title: 'hot path' },
      { id: 's3', kind: 'answer', title: 'end' },
      { id: 's4', kind: 'unknown', title: 'loose' },
    ],
    [
      { from: 's1', to: 's3' },
      { from: 's1', to: 's2' },
      { from: 's2', to: 's3' },
    ]
  );
  assert.deepEqual(
    workflowOrder(doc).map((node) => node.id),
    ['s1', 's3', 's2', 's4'],
    'breadth-first, so the numbering never jumps backwards through a branch'
  );
});

section('4. The workflow leaves the panel as Mermaid and Markdown');

const exporting = graph(
  [
    { kind: 'given', title: 'Supply', detail: '' },
    { kind: 'compute', title: 'Divide', detail: '12 / 2.4', unit: 'A' },
    { kind: 'answer', title: 'Result', detail: '5 A', unit: 'A' },
  ],
  [
    { from: 's1', to: 's2' },
    { from: 's2', to: 's3' },
    { from: 's2', to: 's3', label: 'hot "now"' },
  ]
);

check('Mermaid is every card and every arrow, the labelled one dotted', () => {
  assert.equal(
    workflowToMermaid(exporting),
    [
      'flowchart TD',
      '  n1[/"Given · Supply"/]',
      '  n2["Compute · Divide"]',
      '  n3(["Answer · Result"])',
      '  n1 --> n2',
      '  n2 --> n3',
      '  n2 -.->|"hot \'now\'"| n3',
    ].join('\n')
  );
});

check('every kind is drawn on the plate its meaning implies, and Mermaid draws it', () => {
  // Derived from the kind, never stored: an old document gains shapes without a migration.
  assert.deepEqual(
    STEP_KINDS.map((kind) => `${kind}:${NODE_SHAPE[kind]}`),
    [
      'given:data',
      'unknown:data',
      'model:rect',
      'compute:rect',
      'check:gate',
      'answer:stadium',
      'input:data',
      'transform:rect',
      'branch:diamond',
      'loop:gate',
      'test:gate',
      'output:stadium',
      'merge:diamond',
      'text:rect',
      'fork:bar',
      'join:bar',
    ]
  );
  const doc = {
    ...emptyWorkflow('analysis', 'Shapes'),
    nodes: [
      { id: 's1', kind: 'given', title: 'Supply', detail: '', ...autoNodePosition(0) },
      { id: 's2', kind: 'branch', title: 'Test it', detail: '', ...autoNodePosition(1) },
      { id: 's3', kind: 'answer', title: '5 A', detail: '', ...autoNodePosition(2) },
      { id: 's4', kind: 'model', title: 'Plant', detail: '', ...autoNodePosition(3) },
      { id: 's5', kind: 'merge', title: 'Paths meet', detail: '', ...autoNodePosition(4) },
      { id: 's6', kind: 'fork', title: '', detail: '', ...autoNodePosition(5) },
      { id: 's7', kind: 'join', title: '', detail: '', ...autoNodePosition(6) },
      { id: 's8', kind: 'text', title: 'Look here', detail: '', ...autoNodePosition(7) },
    ],
  };
  const mermaid = workflowToMermaid(doc);
  for (const line of [
    '  n1[/"Given · Supply"/]',
    '  n2{"Branch · Test it"}',
    '  n3(["Answer · 5 A"])',
    '  n4["Model · Plant"]',
    '  n5{"Merge · Paths meet"}',
    '  n6[["Fork"]]',
    '  n7[["Join"]]',
    // A text card is a label, so the export writes its words alone — no kind prefix on bare words.
    '  n8["Look here"]',
  ]) {
    assert.ok(mermaid.includes(line), `${line} missing from\n${mermaid}`);
  }
});

check('a frame leaves as a subgraph, its cards inside and every arrow outside', () => {
  // Not re-normalized: this is the export's own rule, and a stale id must not empty the frame.
  const doc = { ...exporting, groups: [{ title: 'Supply chain', nodeIds: ['s1', 's2', 'gone'] }] };
  assert.equal(
    workflowToMermaid(doc),
    [
      'flowchart TD',
      '  subgraph g1["Supply chain"]',
      '    n1[/"Given · Supply"/]',
      '    n2["Compute · Divide"]',
      '  end',
      '  n3(["Answer · Result"])',
      '  n1 --> n2',
      '  n2 --> n3',
      '  n2 -.->|"hot \'now\'"| n3',
    ].join('\n')
  );
});

check('Markdown numbers the cards and points a branch at the number on screen', () => {
  assert.equal(
    workflowToMarkdown(exporting),
    [
      '### Workflow — Test',
      '1. **Given** — Supply',
      '2. **Compute** — Divide — 12 / 2.4 _(A)_',
      '   - if hot "now" → step 3',
      '3. **Answer** — Result — 5 A _(A)_',
    ].join('\n')
  );
});

check('a note and a lesson link are card metadata, exported without becoming another node', () => {
  const annotated = normalizeWorkflow({
    ...exporting,
    nodes: exporting.nodes.map((node, index) =>
      index === 0
        ? { ...node, note: '  read the supply first  ', lesson: 'P.15' }
        : node
    ),
  });
  assert.equal(annotated.nodes[0].note, 'read the supply first');
  assert.equal(annotated.nodes[0].lesson, 'P.15');
  assert.equal('note' in annotated.nodes[1], false, 'a card without a note gains no field');
  assert.equal('lesson' in annotated.nodes[1], false, 'a card without a link gains no field');
  const mermaid = workflowToMermaid(annotated);
  assert.match(mermaid, /^  %% note n1: read the supply first$/m);
  assert.match(mermaid, /^  %% lesson n1: P\.15$/m);
  // A node declaration opens a bracket (`[`, `([[`, `{[`); an arrow line never does.
  assert.equal(
    mermaid.split('\n').filter((line) => /^  n\d+[[({]/.test(line)).length,
    3,
    'metadata adds no node'
  );
  const markdown = workflowToMarkdown(annotated);
  assert.match(markdown, /^1\. \*\*Given\*\* — Supply$/m);
  assert.match(markdown, /^ {3}- note: read the supply first$/m);
  assert.match(markdown, /^ {3}- lesson: P\.15$/m);
  assert.equal(
    normalizeWorkflow(exporting).nodes[0].note,
    undefined,
    'a document saved before notes gains no field'
  );
});

check('maths in a card’s words is carried into both exports unchanged', () => {
  const withMath = normalizeWorkflow(
    graph(
      [
        { title: 'Force $F = ma$', detail: 'so $a = F/m$' },
        { kind: 'answer', title: 'done' },
      ],
      [{ from: 's1', to: 's2' }]
    )
  );
  assert.match(workflowToMermaid(withMath), /\$F = ma\$/);
  const markdown = workflowToMarkdown(withMath);
  assert.match(markdown, /\$F = ma\$/);
  assert.match(markdown, /\$a = F\/m\$/);
  // The source stays the document's text: a card is not rewritten when it is exported.
  assert.equal(withMath.nodes[0].title, 'Force $F = ma$');
});

check('an unlabelled arrow that is not the next card is still written down', () => {
  const jump = graph(
    [
      { kind: 'given', title: 'a', detail: '' },
      { kind: 'answer', title: 'b', detail: '' },
      { kind: 'unknown', title: 'c', detail: '' },
    ],
    [
      { from: 's1', to: 's2' },
      { from: 's1', to: 's3' },
    ]
  );
  assert.match(workflowToMarkdown(jump), /^ {3}- → step 3$/m);
});

check('a document with no title still names itself', () => {
  assert.equal(workflowToMarkdown({ ...exporting, title: '' }).split('\n')[0], '### Workflow — Workflow');
});

check('a branch card’s condition is what its arrows say on screen and in both exports', () => {
  const labelled = graph(
    [
      { kind: 'input', title: 'read' },
      { kind: 'branch', title: 'limit', condition: `  ${'x'.repeat(MAX_BRANCH_CONDITION_CHARS + 5)}  ` },
      { kind: 'answer', title: 'clamp' },
    ],
    [
      { from: 's1', to: 's2', fromSide: 'bottom', toSide: 'top' },
      { from: 's2', to: 's3', fromSide: 'bottom', toSide: 'top' },
    ],
    { mode: 'code' }
  );
  const normalized = normalizeWorkflow(labelled);
  assert.equal(normalized.nodes[1].condition, 'x'.repeat(MAX_BRANCH_CONDITION_CHARS));
  const branch = { ...normalized.nodes[1], condition: 'draw > 3.2 A' };
  const edge = normalized.edges[1];
  assert.equal(edgeLabelFor(branch, edge), 'draw > 3.2 A');
  const doc = { ...normalized, nodes: [normalized.nodes[0], branch, normalized.nodes[2]] };
  assert.match(workflowToMermaid(doc), /n2 -\.->\|"draw > 3\.2 A"\| n3/);
  assert.match(workflowToMarkdown(doc), /^ {3}- if draw > 3\.2 A → step 3$/m);
});

check('a restored edge label shows until the branch card types its own condition', () => {
  const doc = normalizeWorkflow(
    graph(
      [
        { kind: 'input', title: 'read' },
        { kind: 'branch', title: 'limit' },
        { kind: 'answer', title: 'clamp' },
      ],
      [
        { from: 's1', to: 's2', fromSide: 'bottom', toSide: 'top' },
        { from: 's2', to: 's3', fromSide: 'bottom', toSide: 'top', label: 'hot' },
      ],
      { mode: 'code' }
    )
  );
  const branch = doc.nodes[1];
  const edge = doc.edges[1];
  assert.equal(edgeLabelFor(branch, edge), 'hot', 'a restored label is the fallback');
  assert.equal(edgeLabelFor({ ...branch, condition: 'cold' }, edge), 'cold', 'the card’s condition wins');
  assert.equal(
    edgeLabelFor({ ...branch, kind: 'compute', condition: 'cold' }, edge),
    'hot',
    'a non-branch card does not borrow a condition'
  );
  assert.equal(edgeLabelFor(branch, { ...edge, label: undefined }), '');
});

check('an arrow kind survives a round trip, and a junk kind falls back to control flow', () => {
  const normalized = normalizeWorkflow(
    graph(
      [
        { kind: 'input', title: 'Encoder' },
        { kind: 'compute', title: 'RPM' },
        { kind: 'output', title: 'Drive' },
      ],
      [
        { from: 's1', to: 's2', type: 'data' },
        { from: 's2', to: 's3', type: 'torque-ish' },
      ],
      { mode: 'code' }
    )
  );
  assert.equal(normalized.edges[0].type, 'data');
  assert.equal(edgeTypeOf(normalized.edges[0]), 'data');
  assert.equal(normalized.edges[1].type, undefined, 'a kind outside the union is not stored');
  assert.equal(edgeTypeOf(normalized.edges[1]), 'flow', 'and the arrow still means control flow');
  assert.deepEqual([...WORKFLOW_EDGE_TYPES], [
    'flow',
    'data',
    'signal',
    'power',
    'mechanical',
    'communication',
  ]);
  for (const type of WORKFLOW_EDGE_TYPES) assert.ok(EDGE_TYPE_LABEL[type], type);
});

check('control flow is stored as an absent field, so a kind-less document does not change', () => {
  const edge = { id: 'e1', from: 's1', to: 's2', fromSide: 'right', toSide: 'left' };
  assert.equal(withEdgeType({ ...edge, type: 'power' }, 'flow').type, undefined);
  assert.equal(withEdgeType(edge, 'power').type, 'power');
  assert.deepEqual(
    normalizeWorkflow(graph([{ kind: 'given', title: 'a' }, { kind: 'answer', title: 'b' }], [edge])).edges[0],
    { ...edge, id: 'e1' },
    'an arrow nobody classified carries no extra field'
  );
});

check('a route is stored only off the default curve, and junk reads as curved', () => {
  const edge = { id: 'e1', from: 's1', to: 's2', fromSide: 'right', toSide: 'left' };
  assert.equal(edgeRouteOf(edge), 'curved', 'an arrow drawn before routes keeps the cubic it had');
  assert.deepEqual([...EDGE_ROUTES], ['curved', 'rounded', 'elbow', 'straight']);
  for (const route of EDGE_ROUTES) assert.ok(EDGE_ROUTE_LABEL[route], route);
  assert.equal(withEdgeRoute({ ...edge, route: 'elbow' }, 'curved').route, undefined);
  assert.equal(withEdgeRoute(edge, 'rounded').route, 'rounded');
  const nodes = [{ kind: 'given', title: 'a' }, { kind: 'answer', title: 'b' }];
  assert.equal(
    normalizeWorkflow(graph(nodes, [{ from: 's1', to: 's2', route: 'diagonal' }])).edges[0].route,
    undefined,
    'a route this build does not draw is not stored'
  );
  assert.equal(
    normalizeWorkflow(graph(nodes, [{ from: 's1', to: 's2', route: 'elbow' }])).edges[0].route,
    'elbow'
  );
});

check('a typed arrow names its kind in Mermaid, Markdown and on the chip', () => {
  const doc = normalizeWorkflow(
    graph(
      [
        { kind: 'input', title: 'Encoder' },
        { kind: 'compute', title: 'RPM' },
        { kind: 'output', title: 'Drive' },
      ],
      [
        { from: 's1', to: 's2', type: 'data', label: 'RPM' },
        { from: 's2', to: 's3', type: 'power' },
      ],
      { mode: 'code' }
    )
  );
  const mermaid = workflowToMermaid(doc);
  assert.match(mermaid, /n1 -\.->\|"data · RPM"\| n2/, 'data is dotted and says so');
  assert.match(mermaid, /n2 ==>\|"power"\| n3/, 'a power run is a thick arrow that names itself');
  const markdown = workflowToMarkdown(doc);
  assert.match(markdown, /^ {3}- data: RPM → step 2$/m);
  assert.match(markdown, /^ {3}- power → step 3$/m);
  assert.equal(edgeCaption(doc.nodes[0], doc.edges[0]), 'RPM', 'the label is what the chip says');
  assert.equal(edgeCaption(doc.nodes[1], doc.edges[1]), 'Power', 'an unlabelled typed arrow wears its kind');
  assert.equal(
    edgeCaption(doc.nodes[0], { ...doc.edges[0], label: undefined, type: 'flow' }),
    '',
    'an unlabelled control arrow stays silent'
  );
});

section('5. A dot says what it is for');

check('a socket follows the arrow’s kind, and a chosen socket wins', () => {
  // The one table both the canvas and the card read: which end of a cable plugs into what.
  const table = ['flow', 'data', 'signal', 'power', 'mechanical', 'communication'].map((type) => {
    const edge = { id: 'e1', from: 's1', to: 's2', fromSide: 'right', toSide: 'left', type };
    return [type, edgePortOf(edge, 'from'), edgePortOf(edge, 'to')];
  });
  assert.deepEqual(table, [
    ['flow', null, null],
    ['data', 'data', 'data'],
    ['signal', 'data', 'data'],
    ['power', 'power', 'power'],
    ['mechanical', 'mechanical', 'mechanical'],
    ['communication', 'data', 'data'],
  ]);
  const power = { id: 'e1', from: 's1', to: 's2', fromSide: 'right', toSide: 'left', type: 'power' };
  const moved = withEdgePort(power, 'from', 'in');
  assert.equal(moved.fromPort, 'in');
  assert.equal(edgePortOf(moved, 'from'), 'in', 'what the learner chose beats the kind’s default');
  assert.equal(edgePortOf(moved, 'to'), 'power', 'and moving one end leaves the other on its default');
  assert.equal(withEdgePort(moved, 'from', null).fromPort, undefined, 'clearing returns it to the kind');
  assert.equal(
    withEdgePort(power, 'to', 'power').toPort,
    undefined,
    'choosing the socket the kind already implies stores nothing, like a flow kind'
  );
});

check('a stored socket is read tolerantly, and junk draws a plain dot', () => {
  const doc = normalizeWorkflow(
    graph(
      [{ kind: 'input', title: 'Encoder' }, { kind: 'compute', title: 'MCU' }],
      [
        { from: 's1', to: 's2', fromPort: 'data', toPort: 'PWR' },
        { from: 's2', to: 's1', fromPort: 'banana', toSide: 'right' },
      ]
    )
  );
  assert.equal(doc.edges[0].fromPort, 'data');
  assert.equal(doc.edges[0].toPort, undefined, 'a socket outside the five is dropped, not drawn');
  assert.equal(doc.edges[1].fromPort, undefined);
  assert.deepEqual(
    normalizeWorkflow(
      graph([{ kind: 'given', title: 'a' }, { kind: 'answer', title: 'b' }], [{ from: 's1', to: 's2' }])
    ).edges[0],
    { id: 'e1', from: 's1', to: 's2', fromSide: 'right', toSide: 'left' },
    'a diagram drawn before ports existed carries no extra field'
  );
});

check('a card reads its sockets off its arrows, and two kinds on one dot read plain', () => {
  const doc = normalizeWorkflow(
    graph(
      [
        { kind: 'input', title: 'Encoder' },
        { kind: 'compute', title: 'MCU' },
        { kind: 'given', title: 'PSU' },
        { kind: 'input', title: 'Bus' },
      ],
      [
        { from: 's1', to: 's2', fromSide: 'right', toSide: 'left', type: 'data' },
        { from: 's3', to: 's2', fromSide: 'right', toSide: 'left', type: 'power' },
        // Data again after power: the dot was contested on the second cable and stays contested,
        // rather than the last kind read winning.
        { from: 's4', to: 's2', fromSide: 'right', toSide: 'left', type: 'data' },
      ]
    )
  );
  const sockets = socketKinds(doc);
  assert.equal(sockets.get('s1').right, 'data', 'a DATA run leaves a DATA socket');
  assert.equal(sockets.get('s2').left, null, 'a dot two kinds feed draws as a plain dot');
  assert.equal(sockets.get('s2').right, null, 'and a dot nothing touches is empty');
});

section('6. A guard belongs to the exit, and a merge names where paths meet');

check('two exits of one decision carry their own guards, and Mermaid names each', () => {
  const doc = normalizeWorkflow(
    graph(
      [
        { kind: 'branch', title: 'Over current?', detail: '', condition: 'fallback condition' },
        { kind: 'answer', title: 'Clamp', detail: '' },
        { kind: 'answer', title: 'Run', detail: '' },
      ],
      [
        { from: 's1', to: 's2', guard: 'draw > 3.2 A' },
        { from: 's1', to: 's3', guard: 'draw ≤ 3.2 A' },
      ]
    )
  );
  const [first, second] = doc.edges;
  assert.equal(edgeLabelFor(doc.nodes[0], first), 'draw > 3.2 A');
  assert.equal(edgeLabelFor(doc.nodes[0], second), 'draw ≤ 3.2 A', 'one condition is not copied to both');
  const mermaid = workflowToMermaid(doc);
  for (const line of [
    '  n1{"Branch · Over current?"}',
    '  n1 -.->|"draw > 3.2 A"| n2',
    '  n1 -.->|"draw ≤ 3.2 A"| n3',
  ]) {
    assert.ok(mermaid.includes(line), `${line} missing from\n${mermaid}`);
  }
  const markdown = workflowToMarkdown(doc);
  assert.ok(markdown.includes('   - if draw > 3.2 A → step 2'), markdown);
  assert.ok(markdown.includes('   - if draw ≤ 3.2 A → step 3'), markdown);
});

check('an old card-level condition still labels every unguarded exit', () => {
  // The document a learner saved before guards were per-edge stores one condition on the branch
  // card. It must open saying exactly what it said, and a guard on one exit must not rename the other.
  const doc = normalizeWorkflow(
    graph(
      [
        { kind: 'branch', title: 'Too hot?', detail: '', condition: 'T > 80 °C' },
        { kind: 'answer', title: 'Fan', detail: '' },
        { kind: 'answer', title: 'Hold', detail: '' },
      ],
      [
        { from: 's1', to: 's2' },
        { from: 's1', to: 's3' },
      ]
    )
  );
  assert.deepEqual(
    doc.edges.map((edge) => edgeLabelFor(doc.nodes[0], edge)),
    ['T > 80 °C', 'T > 80 °C']
  );
  const edited = { ...doc, edges: doc.edges.map((edge, index) => (index ? edge : { ...edge, guard: 'T > 100 °C' })) };
  assert.deepEqual(
    edited.edges.map((edge) => edgeLabelFor(edited.nodes[0], edge)),
    ['T > 100 °C', 'T > 80 °C']
  );
});

check('a junk or empty guard is dropped, not drawn as half a port-style field', () => {
  const doc = normalizeWorkflow(
    graph([{ kind: 'branch', title: 'a' }, { kind: 'answer', title: 'b' }], [
      { from: 's1', to: 's2', guard: '   ' },
    ])
  );
  assert.equal(doc.edges[0].guard, undefined);
  assert.equal(
    normalizeWorkflow(
      graph([{ kind: 'branch', title: 'a' }, { kind: 'answer', title: 'b' }], [{ from: 's1', to: 's2' }])
    ).edges[0].guard,
    undefined,
    'an arrow saved before guards existed carries no extra field'
  );
});

check('a merge is a real kind in both palettes, drawn as a diamond, and takes two flows', () => {
  assert.equal(KIND_META.merge.mode, 'both');
  assert.ok(STEPS_BY_MODE.analysis.includes('merge'));
  assert.ok(STEPS_BY_MODE.code.includes('merge'));
  assert.equal(NODE_SHAPE.merge, 'diamond');
  assert.equal(NODE_SHAPE.branch, 'diamond');
  assert.ok(!KIND_META.merge.start && !KIND_META.merge.terminal, 'a merge neither starts nor ends a flow');
  const doc = normalizeWorkflow(
    graph(
      [
        { kind: 'given', title: 'Supply', detail: '' },
        { kind: 'branch', title: 'Which path?', detail: '' },
        { kind: 'compute', title: 'Long path', detail: '' },
        { kind: 'compute', title: 'Short path', detail: '' },
        { kind: 'merge', title: 'Meet', detail: '' },
        { kind: 'answer', title: 'Done', detail: '' },
      ],
      [
        { from: 's1', to: 's2' },
        { from: 's2', to: 's3' },
        { from: 's2', to: 's4' },
        { from: 's3', to: 's5' },
        { from: 's4', to: 's5' },
        { from: 's5', to: 's6' },
      ]
    )
  );
  assert.equal(doc.edges.filter((edge) => edge.to === 's5').length, 2, 'both flows land on the merge');
  assert.ok(workflowToMermaid(doc).includes('  n5{"Merge · Meet"}'));
});

section('7. A fork splits, a join waits, and a lane names who owns a card');

check('a fork and a join are bars in both palettes, named by both exports', () => {
  assert.deepEqual([...PROCESS_KINDS], ['fork', 'join']);
  for (const kind of PROCESS_KINDS) {
    assert.equal(KIND_META[kind].mode, 'both');
    assert.equal(isForkJoin(kind), true);
    assert.equal(NODE_SHAPE[kind], 'bar');
    assert.ok(!KIND_META[kind].start && !KIND_META[kind].terminal, kind);
  }
  const doc = normalizeWorkflow(
    graph(
      [
        { kind: 'given', title: 'Start', detail: '' },
        { kind: 'fork', title: '', detail: '' },
        { kind: 'transform', title: 'Sense', detail: '' },
        { kind: 'transform', title: 'Drive', detail: '' },
        { kind: 'join', title: '', detail: '' },
        { kind: 'answer', title: 'Done', detail: '' },
      ],
      [
        { from: 's1', to: 's2' },
        { from: 's2', to: 's3' },
        { from: 's2', to: 's4' },
        { from: 's3', to: 's5' },
        { from: 's4', to: 's5' },
        { from: 's5', to: 's6' },
      ]
    )
  );
  const mermaid = workflowToMermaid(doc);
  for (const line of ['  n2[["Fork"]]', '  n5[["Join"]]']) {
    assert.ok(mermaid.includes(line), `${line} missing from\n${mermaid}`);
  }
  assert.ok(!mermaid.includes('Fork · untitled'), 'a bar has no title field, so it must not export one');
  const markdown = workflowToMarkdown(doc);
  assert.ok(markdown.includes('2. **Fork**\n'), markdown);
  assert.ok(markdown.includes('5. **Join**\n'), markdown);
  assert.deepEqual(
    validateWorkflow(doc)
      .filter((issue) => issue.code === 'fork-without-branches' || issue.code === 'join-without-branches')
      .map((issue) => issue.code),
    [],
    'two exits from the fork and two entries to the join are the shape the hints ask for'
  );
  assert.deepEqual(
    forkJoinIssues(doc, new Map(doc.nodes.map((node, at) => [node.id, at + 1]))),
    [],
    'the shared helper agrees with validation'
  );
});

check('a fork with one exit and a join with one entry are named, not refused', () => {
  const cases = [
    {
      nodes: [{ kind: 'given', title: 'a' }, { kind: 'fork', title: '' }, { kind: 'transform', title: 'b' }],
      edges: [{ from: 's1', to: 's2' }, { from: 's2', to: 's3' }],
      code: 'fork-without-branches',
    },
    {
      nodes: [{ kind: 'given', title: 'a' }, { kind: 'join', title: '' }, { kind: 'answer', title: 'b' }],
      edges: [{ from: 's1', to: 's2' }, { from: 's2', to: 's3' }],
      code: 'join-without-branches',
    },
  ];
  for (const entry of cases) {
    const doc = normalizeWorkflow(graph(entry.nodes, entry.edges));
    const issue = validateWorkflow(doc).find((candidate) => candidate.code === entry.code);
    assert.ok(issue, `${entry.code} missing`);
    assert.equal(issue.severity, 'hint', 'a half-built parallel shape is advice, never a gate');
    assert.equal(
      forkJoinIssues(doc, new Map(doc.nodes.map((node, at) => [node.id, at + 1])))[0].code,
      entry.code
    );
  }
});

check('a lane keeps one card in one partition, drops junk, and leaves old documents alone', () => {
  assert.equal(normalizeWorkflow(good).lanes, undefined, 'a document saved before lanes gains no field');
  const doc = normalizeWorkflow({
    ...graph([
      { kind: 'given', title: 'Supply' },
      { kind: 'compute', title: 'Divide' },
      { kind: 'answer', title: 'Result' },
      { kind: 'transform', title: 'Loose' },
    ]),
    lanes: [
      { title: 'Mechanical', nodeIds: ['s1', 'gone', 's1'] },
      { title: 'Firmware', nodeIds: ['s1', 's2'] },
      { title: 'Empty', nodeIds: [] },
      { title: 'Junk' },
      'not a lane',
    ],
  });
  assert.deepEqual(doc.lanes, [
    { title: 'Mechanical', nodeIds: ['s1'] },
    { title: 'Firmware', nodeIds: ['s2'] },
  ]);
  assert.equal(
    normalizeWorkflow({ ...graph([{ kind: 'given', title: 'a' }]), lanes: [] }).lanes,
    undefined,
    'an empty lane list is written as no field, like an empty frame list'
  );
  assert.deepEqual(
    readLanes([{ title: 'A', nodeIds: ['s1', 's1'] }], new Set(['s1'])),
    [{ title: 'A', nodeIds: ['s1'] }],
    'the reader itself keeps the first claim on a card'
  );
});

check('moving cards between lanes leaves no card claimed twice, and a lane can be named or removed', () => {
  const lanes = [
    { title: 'Mechanical', nodeIds: ['s1', 's2'] },
    { title: 'Firmware', nodeIds: ['s3'] },
  ];
  assert.deepEqual(withLane(lanes, ['s2'], 'Electronics'), [
    { title: 'Mechanical', nodeIds: ['s1'] },
    { title: 'Firmware', nodeIds: ['s3'] },
    { title: 'Electronics', nodeIds: ['s2'] },
  ], 'the card leaves its old lane and the old lane keeps the rest');
  assert.deepEqual(withLane([{ title: 'Only', nodeIds: ['s1'] }], ['s1'], 'Moved'), [
    { title: 'Moved', nodeIds: ['s1'] },
  ], 'a lane that loses its last card goes');
  assert.deepEqual(renameLane(lanes, 1, '  Firm  ')[1], { title: 'Firm', nodeIds: ['s3'] });
  assert.deepEqual(removeLane(lanes, 0), [{ title: 'Firmware', nodeIds: ['s3'] }]);
  assert.equal(laneIndexOf(lanes, 's3'), 1);
  assert.equal(laneIndexOf(lanes, 'gone'), -1, 'a card outside every lane has no index');
  assert.deepEqual(
    withoutNodeFromLanes(lanes, 's2'),
    [
      { title: 'Mechanical', nodeIds: ['s1'] },
      { title: 'Firmware', nodeIds: ['s3'] },
    ],
    'taking a card out keeps the lane it left, because another card still owns it'
  );
  assert.deepEqual(
    moveNodeToLane(lanes, 's3', 0),
    [{ title: 'Mechanical', nodeIds: ['s1', 's2', 's3'] }],
    'moving the last card out drops the emptied source lane and does not duplicate the name'
  );
  assert.deepEqual(moveNodeToLane(lanes, 's1', 0), lanes, 'a card already in the target is unchanged');
  assert.ok(MAX_LANES >= 2);
});

check('a lane leaves as a named subgraph, outranks a frame for the same card, and names itself in Markdown', () => {
  const doc = normalizeWorkflow({
    ...graph(
      [
        { kind: 'given', title: 'Supply', detail: '' },
        { kind: 'compute', title: 'Divide', detail: '' },
        { kind: 'answer', title: 'Result', detail: '' },
      ],
      [
        { from: 's1', to: 's2' },
        { from: 's2', to: 's3' },
      ]
    ),
    lanes: [{ title: 'Mechanical', nodeIds: ['s1', 's2'] }],
    groups: [{ title: 'Motor', nodeIds: ['s2', 's3'] }],
  });
  const mermaid = workflowToMermaid(doc);
  for (const line of [
    '  subgraph lane1["Mechanical"]',
    '  subgraph g1["Motor"]',
    '    n1[/"Given · Supply"/]',
    '    n3(["Answer · Result"])',
  ]) {
    assert.ok(mermaid.includes(line), `${line} missing from\n${mermaid}`);
  }
  assert.equal(
    mermaid.split('n2["Compute · Divide"]').length - 1,
    1,
    'a card named by a lane and a frame is written once'
  );
  const index = new Map(doc.nodes.map((node, at) => [node.id, at]));
  const blocks = laneBlocks(doc.lanes, index, (position) => `n${position + 1}`);
  assert.deepEqual(blocks.lines.slice(0, 2), ['  subgraph lane1["Mechanical"]', '  n1']);
  assert.deepEqual([...blocks.claimed], ['s1', 's2'], 'the frame pass is told which cards are taken');
  assert.equal(laneMarkdown(doc.lanes, doc.nodes[0]), ' · lane Mechanical');
  assert.match(workflowToMarkdown(doc), /^1\. \*\*Given\*\* — Supply · lane Mechanical$/m);
  assert.doesNotMatch(workflowToMarkdown(doc), /^3\. .*lane Mechanical$/m);
});

section('8. A frame names the cards it holds');

check('a frame keeps only cards that exist, and one card belongs to one frame', () => {
  const doc = normalizeWorkflow({
    ...graph([
      { kind: 'given', title: 'a' },
      { kind: 'given', title: 'b' },
      { kind: 'given', title: 'c' },
      { kind: 'given', title: 'd' },
    ]),
    groups: [
      { title: 'Motor', nodeIds: ['s1', 's2', 'gone'] },
      // s2 is already in Motor, so Sensor keeps only s3.
      { title: 'Sensor', nodeIds: ['s2', 's3'] },
      // Nothing left: a name over no card is not a frame.
      { title: 'Empty', nodeIds: [] },
      // A name is a label, not a document: over-long text is cut, and the frame still exists.
      { title: `  ${'x'.repeat(MAX_GROUP_TITLE_CHARS + 20)}  `, nodeIds: ['s4'] },
    ],
  });
  assert.deepEqual(doc.groups, [
    { title: 'Motor', nodeIds: ['s1', 's2'] },
    { title: 'Sensor', nodeIds: ['s3'] },
    { title: 'x'.repeat(MAX_GROUP_TITLE_CHARS), nodeIds: ['s4'] },
  ]);
  // Through the store's JSON, which is the path a reload takes.
  assert.deepEqual(normalizeWorkflow(JSON.parse(JSON.stringify(doc))).groups, doc.groups);
  assert.deepEqual(
    normalizeWorkflow(graph([{ kind: 'given', title: 'a' }])).groups,
    undefined,
    'a document drawn before frames existed gains no `groups` field, so it round-trips unchanged'
  );
  assert.deepEqual(
    normalizeWorkflow({ ...graph([{ kind: 'given', title: 'a' }]), groups: [{ nodeIds: 's1' }, { title: 'x' }] })
      .groups,
    undefined,
    'junk frames are dropped rather than drawn as half a frame'
  );
});

section('9. Templates are usable at birth');

check('every kind has a label and a sentence', () => {
  assert.equal(STEP_KINDS.length, 16);
  for (const kind of STEP_KINDS) {
    assert.ok(KIND_META[kind].label, kind);
    assert.ok(KIND_META[kind].hint.length > 20, kind);
  }
  assert.deepEqual(STEPS_BY_MODE.analysis, [
    'given',
    'unknown',
    'model',
    'compute',
    'check',
    'answer',
    'merge',
    'text',
    'fork',
    'join',
  ]);
  assert.deepEqual(STEPS_BY_MODE.code, [
    'input',
    'transform',
    'branch',
    'loop',
    'test',
    'output',
    'merge',
    'text',
    'fork',
    'join',
  ]);
});

check('every template is a graph the canvas can draw, every card joined to the flow', () => {
  for (const template of WORKFLOW_TEMPLATES) {
    const built = template.build();
    const normalized = normalizeWorkflow(built);
    assert.ok(normalized, template.id);
    assert.equal(normalized.nodes.length, built.nodes.length, `${template.id} keeps every card`);
    assert.equal(new Set(normalized.nodes.map((node) => node.id)).size, built.nodes.length, template.id);
    assert.equal(normalized.edges.length, built.edges.length, `${template.id} keeps every arrow`);
    if (normalized.nodes.length === 1) continue; // the blank template is one card and no arrow
    const touched = new Set(normalized.edges.flatMap((edge) => [edge.from, edge.to]));
    assert.equal(
      normalized.nodes.every((node) => touched.has(node.id)),
      true,
      `${template.id} has a card with no arrow`
    );
  }
});

check('every template but the blank one has its cards filled in, and no open issue', () => {
  for (const template of WORKFLOW_TEMPLATES) {
    if (template.id === 'blank') continue;
    const built = template.build();
    const open = validateWorkflow(built).filter((issue) => issue.severity === 'open');
    assert.deepEqual(open, [], `${template.id}: ${open.map((issue) => issue.message).join('; ')}`);
  }
  const blank = validateWorkflow(templateById('blank').build());
  assert.ok(blank.some((issue) => issue.code === 'empty-step'), 'the blank template is an invitation');
});

check('templates attach their chain down the column and their branches around it', () => {
  for (const template of WORKFLOW_TEMPLATES) {
    for (const edge of template.build().edges) {
      assert.ok(WORKFLOW_SIDES.includes(edge.fromSide), `${template.id} has a bad source side`);
      assert.ok(WORKFLOW_SIDES.includes(edge.toSide), `${template.id} has a bad target side`);
      if (edge.label) {
        assert.deepEqual([edge.fromSide, edge.toSide], ['right', 'left'], template.id);
      } else {
        assert.deepEqual([edge.fromSide, edge.toSide], ['bottom', 'top'], template.id);
      }
    }
  }
});

check('a template branch that points at the next card keeps its condition', () => {
  const debug = templateById('debug-failing-run').build();
  const labelled = debug.edges.filter((edge) => edge.label);
  assert.equal(debug.edges.length, 4, 'the branch does not add a second arrow to the same card');
  assert.equal(labelled.length, 1, `${templateById('debug-failing-run').id} lost its condition`);
  assert.equal(labelled[0].from, 's3');
  assert.equal(labelled[0].to, 's4');
  assert.equal(labelled[0].label, 'reproduces every time');
  assert.match(workflowToMarkdown(debug), /if reproduces every time → step 4/);
});

check('the templates open as a connected flow in one column that fits a split pane', () => {
  const built = templateById('motor-stall').build();
  assert.equal(built.nodes[1].x, built.nodes[0].x, 'one column, so 380 px shows the whole flow');
  assert.equal(built.nodes[1].y, built.nodes[0].y + 172);
  assert.equal(built.nodes[2].y, built.nodes[1].y + 172);
  assert.equal(built.edges.length, built.nodes.length - 1);
});

check('there are both palettes, six seeded templates and one blank', () => {
  assert.equal(
    WORKFLOW_TEMPLATES.filter((template) => template.id !== 'blank').length,
    6,
    'the picker promises six worked shapes, three per palette'
  );
  assert.deepEqual(templatesForMode('analysis').map((template) => template.id), [
    'motor-stall',
    'sensor-scale',
    'pid-limits',
    'blank',
  ]);
  assert.deepEqual(templatesForMode('code').map((template) => template.id), [
    'function-from-examples',
    'debug-failing-run',
    'loop-accumulate',
  ]);
  assert.equal(templateById('nope'), null);
});

check('P.15 opens on the motor-stall example, and no other lesson claims one', () => {
  assert.equal(templateForLesson('P.15').id, 'motor-stall');
  assert.equal(templateForLesson('P.1'), null);
  assert.equal(templateForLesson(''), null);
});

section('10. One workflow per lesson survives the store');

check('a written workflow reads back with the timestamp the write set', () => {
  freshBrowser();
  assert.equal(readWorkflow('P.15'), null);
  assert.equal(saveWorkflow('P.15', good, 2000), true);
  const read = readWorkflow('P.15');
  assert.equal(read.updatedAt, 2000);
  assert.equal(read.nodes.length, 6);
  assert.equal(read.edges.length, 5);
  assert.equal(readWorkflow('P.1'), null, 'another lesson has nothing');
  assert.equal(workflowCounts().workflows, 1);
  assert.equal(workflowCounts().cards, 6);
});

check('a version-1 document in the bucket is read as a version-2 graph', () => {
  freshBrowser();
  globalThis.localStorage.setItem(
    STORAGE_KEY_WORKFLOW,
    JSON.stringify({
      'P.15': v1([
        { kind: 'given', title: 'a', detail: '12 V', unit: 'V' },
        { kind: 'answer', title: 'b', detail: '5 A', unit: 'A', branch: { when: 'hot', to: 's1' } },
      ]),
    })
  );
  const read = readWorkflow('P.15');
  assert.equal(read.version, 2);
  assert.equal(read.nodes.length, 2);
  assert.equal(read.edges.length, 2, 'the implied chain and the branch');
  const branch = read.edges.find((edge) => edge.from === 's2');
  assert.equal(branch.to, 's1');
  assert.equal(branch.label, 'hot');
});

check('a second lesson is a second entry, not a replacement', () => {
  freshBrowser();
  saveWorkflow('P.15', good, 1000);
  saveWorkflow('P.14', good, 1001);
  assert.deepEqual(Object.keys(readWorkflowStore()).sort(), ['P.14', 'P.15']);
});

check('a workflow with no cards clears the lesson instead of storing a blank', () => {
  freshBrowser();
  saveWorkflow('P.15', good, 1000);
  saveWorkflow('P.15', { ...good, nodes: [] }, 2000);
  assert.equal(readWorkflow('P.15'), null);
  assert.deepEqual(readWorkflowStore(), {});
});

check('clearing removes one lesson and leaves the others', () => {
  freshBrowser();
  saveWorkflow('P.15', good, 1000);
  saveWorkflow('P.14', good, 1000);
  clearWorkflow('P.15');
  assert.deepEqual(Object.keys(readWorkflowStore()), ['P.14']);
});

check('a bucket that throws on access reads as nothing and refuses the write', () => {
  freshBrowser({ store: 'throws' });
  assert.deepEqual(readWorkflowStore(), {});
  assert.equal(readWorkflow('P.15'), null);
  assert.equal(saveWorkflow('P.15', good, 1000), false);
});

check('a full bucket reports the refusal rather than pretending', () => {
  freshBrowser({ store: 'full' });
  assert.equal(saveWorkflow('P.15', good, 1000), false);
});

check('a store from a hand-edited file keeps the good entries only', () => {
  const parsed = parseWorkflowStore(JSON.stringify({ 'P.15': good, 'P.1': { nodes: [] }, junk: 4 }));
  assert.deepEqual(Object.keys(parsed), ['P.15']);
  assert.deepEqual(parseWorkflowStore('{not json'), {});
  assert.deepEqual(parseWorkflowStore(null), {});
});

check('a replace writes the whole store it is given', () => {
  freshBrowser();
  saveWorkflow('P.15', good, 1000);
  assert.equal(replaceWorkflows({ 'P.14': normalizeWorkflow(good) }), true);
  assert.deepEqual(Object.keys(readWorkflowStore()), ['P.14']);
});

check('a merge adds a lesson it does not have and keeps one it does', () => {
  const local = { 'P.15': { ...normalizeWorkflow(good), updatedAt: 2000 } };
  const incoming = {
    'P.15': { ...normalizeWorkflow(good), updatedAt: 1000 },
    'P.14': { ...normalizeWorkflow(good), updatedAt: 1500 },
  };
  const { store, added, updated } = mergeWorkflows(local, incoming);
  assert.equal(added, 1);
  assert.equal(updated, 0);
  assert.equal(store['P.15'].updatedAt, 2000, 'an older restore cannot undo this morning');
  assert.ok(store['P.14']);
});

check('a newer restored copy wins, and a merge never deletes', () => {
  const local = { 'P.15': { ...normalizeWorkflow(good), updatedAt: 1000 } };
  const incoming = { 'P.15': { ...normalizeWorkflow(good), updatedAt: 3000 } };
  const { store, updated } = mergeWorkflows(local, incoming);
  assert.equal(updated, 1);
  assert.equal(store['P.15'].updatedAt, 3000);
  assert.deepEqual(mergeWorkflows(local, {}).store, local);
});

check('the how-to is remembered once and read back through a blocked bucket as unseen', () => {
  freshBrowser();
  assert.equal(readWorkflowGuideSeen(), false);
  markWorkflowGuideSeen();
  assert.equal(readWorkflowGuideSeen(), true);
  assert.equal(globalThis.localStorage.getItem(WORKFLOW_GUIDE_KEY), 'seen');
  freshBrowser({ store: 'throws' });
  assert.equal(readWorkflowGuideSeen(), false);
  assert.doesNotThrow(() => markWorkflowGuideSeen());
});

check('the store key is the documented one', () => {
  assert.equal(STORAGE_KEY_WORKFLOW, 'mechalab_workflow_v1');
});

section('11. An edit is one step back, and a run of typing is one step');

check('undo returns the document before an edit, and redo the one after', () => {
  let history = emptyHistory();
  history = recordHistory(history, 'A', 1000);
  history = recordHistory(history, 'B', 2000);
  const back = stepHistory(history, 'C', true);
  assert.equal(back.value, 'B');
  const further = stepHistory(back.history, 'B', true);
  assert.equal(further.value, 'A');
  const forward = stepHistory(further.history, 'A', false);
  assert.equal(forward.value, 'B');
  assert.equal(stepHistory(further.history, 'A', false).value, 'B', 'redo walks forward in order');
});

check('a run of keystrokes is one undo step, and a pause starts another', () => {
  let history = emptyHistory();
  history = recordHistory(history, 'A', 0, true);
  history = recordHistory(history, 'AB', 100, true);
  history = recordHistory(history, 'ABC', 200, true);
  assert.equal(history.past.length, 1, 'three keystrokes, one entry');
  assert.equal(stepHistory(history, 'ABC', true).value, 'A');
  history = recordHistory(history, 'ABC', 200 + HISTORY_BURST_MS + 1, true);
  assert.equal(history.past.length, 2, 'a pause long enough to think starts another entry');
});

check('a structural edit always starts a step, and a new edit drops redo', () => {
  let history = emptyHistory();
  history = recordHistory(history, 'A', 0, true);
  history = recordHistory(history, 'AB', 50, true);
  assert.equal(history.past.length, 1);
  history = recordHistory(history, 'AB', 60);
  assert.equal(history.past.length, 2, 'a click is its own step, never merged into typing');
  const back = stepHistory(history, 'ABC', true);
  assert.equal(back.value, 'AB');
  const redone = stepHistory(back.history, 'AB', false);
  assert.equal(redone.value, 'ABC');
  assert.equal(
    recordHistory(back.history, 'AB', 70).future.length,
    0,
    'editing after an undo leaves nothing to redo'
  );
});

check('history is bounded, and says so when there is nowhere to go', () => {
  let history = emptyHistory();
  for (let index = 0; index < MAX_HISTORY + 5; index += 1) {
    history = recordHistory(history, `d${index}`, index * 1000);
  }
  assert.equal(history.past.length, MAX_HISTORY);
  assert.equal(history.past[0], 'd5', 'the oldest steps fall off, not the newest');
  assert.equal(stepHistory(emptyHistory(), 'A', true), null);
  assert.equal(stepHistory(emptyHistory(), 'A', false), null);
});

section('12. The editor\'s document algebra is pure');

check('removing a card takes its arrows, frames and lane with it, and the last card empties the lesson', () => {
  let doc = emptyWorkflow('analysis', 'Algebra');
  doc = addWorkflowNode(doc, STEPS_BY_MODE.analysis[1]);
  doc = addWorkflowNode(doc, STEPS_BY_MODE.analysis[2]);
  const [a, b, c] = doc.nodes;
  doc = {
    ...doc,
    edges: [
      { id: 'e1', from: a.id, to: b.id, fromSide: 'bottom', toSide: 'top' },
      { id: 'e2', from: b.id, to: c.id, fromSide: 'bottom', toSide: 'top' },
    ],
    groups: [{ title: 'Motor', nodeIds: [b.id] }],
    lanes: [{ title: 'Firmware', nodeIds: [b.id] }],
  };
  const cut = removeNode(doc, b.id);
  assert.equal(cut.lostEdges, 2, 'both arrows that touched the card are counted');
  assert.deepEqual(cut.doc.nodes.map((node) => node.id), [a.id, c.id]);
  assert.equal(cut.doc.edges.length, 0, 'an arrow without its card is not kept');
  assert.equal(cut.doc.groups, undefined, 'a frame that names only removed cards goes');
  assert.equal(cut.doc.lanes, undefined, 'a lane that names only removed cards goes');
  const framed = removeNode({ ...doc, groups: [{ title: 'Motor', nodeIds: [a.id, b.id, c.id] }] }, b.id);
  assert.deepEqual(framed.doc.groups[0].nodeIds, [a.id, c.id], 'a frame keeps the cards it still has');
  assert.equal(removeNode(cut.doc, a.id).doc.nodes.length, 1);
  assert.equal(
    removeNode(removeNode(cut.doc, a.id).doc, c.id).doc,
    null,
    'the last card returns the lesson to its empty state'
  );
});

check('a note or lesson link is dropped when cleared, never stored as an empty string', () => {
  const doc = emptyWorkflow('analysis');
  const id = doc.nodes[0].id;
  const noted = annotateNode(doc, id, 'note', 'because the gain is 4');
  assert.equal(noted.nodes[0].note, 'because the gain is 4');
  const cleared = annotateNode(noted, id, 'note', '');
  assert.ok(!('note' in cleared.nodes[0]), 'clearing removes the field');
});

check('a move is one document, and an unchanged move writes nothing', () => {
  const doc = emptyWorkflow('analysis');
  const node = doc.nodes[0];
  const moved = moveNodes(doc, [{ id: node.id, x: node.x + 24, y: node.y + 8 }]);
  assert.equal(moved.nodes[0].x, node.x + 24);
  assert.equal(moved.nodes[0].y, node.y + 8);
  assert.equal(moveNodes(doc, [{ id: node.id, x: node.x, y: node.y }]), null);
});

check('an arrow refuses itself and a duplicate, and carries a socket only where one was plugged in', () => {
  let doc = emptyWorkflow('analysis', 'Arrows');
  doc = addWorkflowNode(doc, STEPS_BY_MODE.analysis[1]);
  const [a, b] = doc.nodes;
  assert.equal(connectNodes(doc, a.id, a.id, 'bottom', 'top', null, null), 'self');
  const one = connectNodes(doc, a.id, b.id, 'bottom', 'top', 'power', null);
  assert.equal(one.doc.edges.length, 1);
  assert.equal(one.doc.edges[0].fromPort, 'power');
  assert.ok(!('toPort' in one.doc.edges[0]), 'an unplugged end writes no field');
  assert.equal(connectNodes(one.doc, a.id, b.id, 'bottom', 'top', null, null), 'duplicate');
});

check('a drag from a dot writes the card and its arrow together, entered from the facing side', () => {
  const doc = emptyWorkflow('analysis', 'Spawn');
  const from = doc.nodes[0];
  const result = linkNewNode(doc, STEPS_BY_MODE.analysis[1], { x: 480, y: 96 }, {
    nodeId: from.id,
    side: 'right',
    kind: null,
  });
  assert.equal(result.doc.nodes.length, 2);
  assert.equal(result.doc.edges.length, 1);
  const added = result.doc.nodes.find((node) => node.id === result.id);
  assert.ok(added, 'the returned id names the card that landed');
  assert.equal(result.doc.edges[0].to, result.id);
  assert.equal(result.doc.edges[0].fromSide, 'right');
  assert.equal(result.doc.edges[0].toSide, from.x > added.x ? 'right' : 'left');
});

check('frames take the cards out of the frame they were in, and the last frame removes the field', () => {
  const doc = emptyWorkflow('analysis', 'Frames');
  const first = doc.nodes[0].id;
  const grown = addWorkflowNode(doc, STEPS_BY_MODE.analysis[1]);
  const second = grown.nodes[1].id;
  const grouped = groupCards(grown, [first, second]);
  assert.equal(grouped.groups.length, 1);
  assert.equal(grouped.groups[0].title, 'Group 1', 'a new frame is named by its position');
  const renamed = renameGroup(grouped, 0, 'Motor');
  assert.equal(renamed.groups[0].title, 'Motor');
  const moved = groupCards(renamed, [second]);
  assert.deepEqual(moved.groups.map((group) => group.nodeIds), [[first], [second]]);
  assert.equal(moved.groups[1].title, 'Group 2', 'the new frame counts the ones that remain');
  assert.equal(removeGroup({ ...renamed, groups: [renamed.groups[0]] }, 0).groups, undefined);
});

for (const entry of entries) {
  if (entry.section) {
    console.log(`\n${entry.section}`);
    continue;
  }
  try {
    entry.fn();
    passed += 1;
    console.log(`  ok   ${entry.name}`);
  } catch (error) {
    failed += 1;
    console.error(`  FAIL ${entry.name}\n       ${error.message}`);
  }
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exitCode = 1;
