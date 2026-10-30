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
 *
 * Run: node --experimental-strip-types scripts/test_workflow.mjs
 */

import assert from 'node:assert/strict';
import { Window } from 'happy-dom';
import {
  MAX_BRANCH_CONDITION_CHARS,
  MAX_EDGES,
  MAX_NODE_COORD,
  MAX_STEPS,
  MAX_STEP_DETAIL_CHARS,
  MAX_STEP_TITLE_CHARS,
  MAX_STEP_UNIT_CHARS,
  MAX_WORKFLOW_TITLE_CHARS,
  EDGE_TYPE_LABEL,
  KIND_META,
  STEP_KINDS,
  WORKFLOW_EDGE_TYPES,
  WORKFLOW_SIDES,
  STEPS_BY_MODE,
  addWorkflowNode,
  autoNodePosition,
  edgeCaption,
  edgeLabelFor,
  edgeTypeOf,
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
import {
  WORKFLOW_TEMPLATES,
  templateById,
  templateForLesson,
  templatesForMode,
} from '../app/src/workflowTemplates.ts';
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
      },
      { id: 's2', kind: 'answer', title: 'end', detail: '' },
    ],
    edges: [{ from: 's1', to: 's2', label: 'w'.repeat(MAX_BRANCH_CONDITION_CHARS + 5) }],
  });
  assert.equal(normalized.title.length, MAX_WORKFLOW_TITLE_CHARS);
  assert.equal(normalized.nodes[0].title.length, MAX_STEP_TITLE_CHARS);
  assert.equal(normalized.nodes[0].detail.length, MAX_STEP_DETAIL_CHARS);
  assert.equal(normalized.nodes[0].unit.length, MAX_STEP_UNIT_CHARS);
  assert.equal(normalized.edges[0].label.length, MAX_BRANCH_CONDITION_CHARS);
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
      '  n1["Given · Supply"]',
      '  n2["Compute · Divide"]',
      '  n3["Answer · Result"]',
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

section('5. Templates are usable at birth');

check('every kind has a label and a sentence', () => {
  assert.equal(STEP_KINDS.length, 12);
  for (const kind of STEP_KINDS) {
    assert.ok(KIND_META[kind].label, kind);
    assert.ok(KIND_META[kind].hint.length > 20, kind);
  }
  assert.deepEqual(STEPS_BY_MODE.analysis, ['given', 'unknown', 'model', 'compute', 'check', 'answer']);
  assert.deepEqual(STEPS_BY_MODE.code, ['input', 'transform', 'branch', 'loop', 'test', 'output']);
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

section('6. One workflow per lesson survives the store');

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
