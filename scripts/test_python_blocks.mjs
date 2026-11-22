#!/usr/bin/env node
/**
 * The visual Python editor's model, pinned without a browser (`scripts/test_python_blocks.mjs`).
 *
 * The editor can fail in ways a screenshot will not show, so this suite grades the promises the
 * component is built on:
 *
 * - **Opening visual mode is not an edit.** An untouched program renders byte-for-byte, blank
 *   lines, comments, triple-quoted strings, multi-line calls and all.
 * - **The first edit is a real rewrite, and it is valid Python.** Blocks generate the program, the
 *   result parses with CPython's own `ast.parse`, and parsing it back renders the same text.
 * - **Raw Python survives.** A class, a decorated suite and a multi-line statement keep their
 *   indentation after an unrelated block changes; they are never flattened into the root.
 * - **The toolbox is the plan's nine categories**, every item inserts a complete statement, search
 *   reads every category, and the four sorts are deterministic.
 *
 * Run: node --experimental-strip-types scripts/test_python_blocks.mjs
 */

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { KIND_LABELS, nodeHeader, renderProgram } from '../app/src/pythonBlocks/ast.ts';
import { blockColors } from '../app/src/pythonBlocks/appearance.ts';
import {
  duplicateNode,
  insertNode,
  moveNode,
  moveNodeTo,
  newNode,
  removeNode,
  updateNode,
} from '../app/src/pythonBlocks/operations.ts';
import { parseProgram } from '../app/src/pythonBlocks/parser.ts';
import {
  TOOLBOX_CATEGORIES,
  TOOLBOX_ITEMS,
  filterItems,
  itemById,
  sortItems,
  toolboxItems,
} from '../app/src/pythonBlocks/registry.ts';
import { normalizeBlockSettings } from '../app/src/pythonBlocks/settings.ts';

let passed = 0;
let failed = 0;
function check(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`  ok ${name}`);
  } catch (error) {
    failed += 1;
    console.error(`  FAIL ${name}\n    ${error.message}`);
  }
}

const MVP = 'name = "Alex"\nage = 20\nif age >= 18:\n    print(name)\n';
const atEnd = (program) => ({ bodyId: null, index: program.nodes.length });
const insertAtEnd = (program, template) =>
  insertNode(program, atEnd(program), template);
const kinds = (nodes) => nodes.map((node) => node.kind);
const item = (id) => {
  const found = itemById(id);
  assert.ok(found, `the toolbox has no ${id} item`);
  return found;
};

/** The built-in CPython says whether generated text is a program. */
function assertPython(source, label) {
  const run = spawnSync('python3', ['-c', 'import ast,sys; ast.parse(sys.stdin.read())'], {
    input: source,
    encoding: 'utf8',
  });
  assert.equal(run.status, 0, `${label} does not parse:\n${source}\n${run.stderr}`);
}

check('an untouched program renders byte-for-byte', () => {
  assert.equal(renderProgram(parseProgram(MVP)), MVP);
});

check('the MVP parses as two assignments with a conditional and a nested print', () => {
  const program = parseProgram(MVP);
  assert.deepEqual(kinds(program.nodes), ['assign', 'assign', 'if']);
  assert.deepEqual(kinds(program.nodes[2].body), ['call']);
  assert.equal(program.nodes[0].fields.name, 'name');
  assert.equal(program.nodes[0].fields.value, '"Alex"');
  assert.equal(program.nodes[2].fields.condition, 'age >= 18');
  assert.equal(program.nodes[2].body[0].fields.callee, 'print');
  assert.equal(program.unit, '    ');
});

check('comments, blank lines, docstrings and a multi-line call are untouched', () => {
  const source = [
    '# Dock the arm',
    '',
    '"""Read the joint before moving it."""',
    'from mechalab_plant import fk',
    '',
    'total = sum([',
    '    1,',
    '    2,',
    '])',
    '',
    'print(f"{total}")',
    '',
  ].join('\n');
  assert.equal(renderProgram(parseProgram(source)), source);
});

check('a program without a trailing newline keeps not having one', () => {
  const source = 'value = 1';
  assert.equal(renderProgram(parseProgram(source)), source);
});

check('the first block edit marks the program dirty, and the original is untouched', () => {
  const original = parseProgram(MVP);
  const edited = updateNode(original, original.nodes[0].id, { value: '"Sam"' });
  assert.equal(original.dirty, false);
  assert.equal(edited.dirty, true);
  assert.equal(original.source, MVP);
  assert.equal(renderProgram(original), MVP);
});

check('adding an assignment, a print and a conditional generates valid Python', () => {
  let program = parseProgram('');
  program = insertAtEnd(program, item('assignment').template).program;
  assert.equal(renderProgram(program), 'name = "Alex"');
  program = insertAtEnd(program, item('print').template).program;
  assert.equal(renderProgram(program), 'name = "Alex"\nprint("Hello")');
  const withIf = insertAtEnd(program, item('if').template);
  program = withIf.program;
  assert.equal(
    renderProgram(program),
    'name = "Alex"\nprint("Hello")\nif age >= 18:\n    pass'
  );
  assertPython(renderProgram(program), 'three inserted statements');
});

check('an incomplete suite is completed with pass on the first edit', () => {
  const program = parseProgram('if True:\n');
  assert.equal(program.nodes[0].kind, 'if');
  assert.equal(program.nodes[0].body.length, 0);
  const edited = updateNode(program, program.nodes[0].id, { condition: 'False' });
  assert.equal(renderProgram(edited), 'if False:\n    pass\n');
  assertPython(renderProgram(edited), 'a completed empty suite');
});

check('a statement nests inside a condition at the file’s own indent', () => {
  const ifNode = insertAtEnd(parseProgram(''), item('if').template);
  const nested = insertNode(ifNode.program, { bodyId: ifNode.id, index: 0 }, item('print').template);
  assert.equal(renderProgram(nested.program), 'if age >= 18:\n    print("Hello")');
  const edited = updateNode(nested.program, nested.id, { args: '"Hi"' });
  assert.equal(renderProgram(edited), 'if age >= 18:\n    print("Hi")');
});

check('a two-space file gets two-space bodies for inserted statements', () => {
  const program = parseProgram('if True:\n  print("x")\n');
  const nested = insertNode(
    program,
    { bodyId: program.nodes[0].id, index: 0 },
    item('assignment').template
  );
  assert.equal(
    renderProgram(nested.program),
    'if True:\n  name = "Alex"\n  print("x")\n'
  );
});

check('a tab-indented file keeps tabs for inserted statements', () => {
  const program = parseProgram('if True:\n\tprint("x")\n');
  assert.equal(program.unit, '\t');
  const nested = insertNode(
    program,
    { bodyId: program.nodes[0].id, index: 0 },
    item('assignment').template
  );
  assert.equal(
    renderProgram(nested.program),
    'if True:\n\tname = "Alex"\n\tprint("x")\n'
  );
});

check('editing a variable changes only its value', () => {
  const program = parseProgram(MVP);
  const edited = updateNode(program, program.nodes[1].id, { value: '21' });
  assert.equal(
    renderProgram(edited),
    'name = "Alex"\nage = 21\nif age >= 18:\n    print(name)\n'
  );
});

check('editing a condition rewrites the header, not the suite', () => {
  const program = parseProgram(MVP);
  const edited = updateNode(program, program.nodes[2].id, { condition: 'age > 20' });
  assert.equal(
    renderProgram(edited),
    'name = "Alex"\nage = 20\nif age > 20:\n    print(name)\n'
  );
});

check('move up and down swap siblings inside the same body', () => {
  const program = parseProgram(MVP);
  const moved = moveNode(program, program.nodes[0].id, 1);
  assert.deepEqual(kinds(moved.nodes), ['assign', 'assign', 'if']);
  assert.equal(moved.nodes[0].fields.name, 'age');
  const back = moveNode(moved, moved.nodes[1].id, -1);
  assert.equal(back.nodes[0].fields.name, 'name');
  assert.equal(renderProgram(back), MVP);
});

check('a drag lands a statement exactly where it was released', () => {
  const program = parseProgram(MVP);
  const [name, age, ifNode] = program.nodes;
  // Root to root: the release names one point, and the statement keeps its id there.
  const last = moveNodeTo(program, name.id, { bodyId: null, index: 3 });
  assert.deepEqual(
    last.nodes.map((node) => node.id),
    [age.id, ifNode.id, name.id]
  );
  assert.equal(renderProgram(last), 'age = 20\nif age >= 18:\n    print(name)\nname = "Alex"\n');
  // Root into a suite: the drop names the suite's own body, not a sibling position.
  const inside = moveNodeTo(program, name.id, { bodyId: ifNode.id, index: 0 });
  assert.deepEqual(
    inside.nodes[1].body.map((node) => node.id),
    [name.id, ifNode.body[0].id]
  );
  assert.equal(
    renderProgram(inside),
    'age = 20\nif age >= 18:\n    name = "Alex"\n    print(name)\n'
  );
  // A suite's statement dragged out becomes a root statement.
  const out = moveNodeTo(program, ifNode.body[0].id, { bodyId: null, index: 0 });
  assert.equal(out.nodes[0].id, ifNode.body[0].id);
  assert.equal(out.nodes[2].body.length, 0);
});

check('a drag refuses the drops that would break the program', () => {
  const program = parseProgram(MVP);
  const ifNode = program.nodes[2];
  // Into itself: the statement's own subtree would be deleted with it.
  assert.equal(moveNodeTo(program, ifNode.id, { bodyId: ifNode.id, index: 0 }), program);
  // Where it already is, and directly after itself: no edit, and therefore no undo step.
  assert.equal(moveNodeTo(program, ifNode.id, { bodyId: null, index: 2 }), program);
  assert.equal(moveNodeTo(program, ifNode.id, { bodyId: null, index: 3 }), program);
  // A body the program does not contain is not a target.
  assert.equal(moveNodeTo(program, ifNode.id, { bodyId: 'missing', index: 0 }), program);
});

check('a duplicate gets fresh ids, copies the suite, and sits under its original', () => {
  const program = parseProgram(MVP);
  const copy = duplicateNode(program, program.nodes[2].id);
  assert.ok(copy);
  assert.equal(copy.program.nodes.length, 4);
  assert.notEqual(copy.program.nodes[3].id, program.nodes[2].id);
  assert.equal(copy.program.nodes[3].body.length, 1);
  assert.notEqual(copy.program.nodes[3].body[0].id, program.nodes[2].body[0].id);
  assert.ok(renderProgram(copy.program).includes('if age >= 18:\n    print(name)'));
});

check('deleting a statement removes its whole suite', () => {
  const program = parseProgram(MVP);
  const removed = removeNode(program, program.nodes[2].id);
  assert.deepEqual(kinds(removed.nodes), ['assign', 'assign']);
  assert.equal(renderProgram(removed), 'name = "Alex"\nage = 20\n');
});

check('a class body keeps its indentation after an unrelated edit', () => {
  const source = [
    'class Arm:',
    '    def __init__(self):',
    '        self.pos = 0.0',
    '',
    'name = "Alex"',
    '',
  ].join('\n');
  const program = parseProgram(source);
  const assignment = program.nodes.find((node) => node.kind === 'assign');
  const edited = updateNode(program, assignment.id, { value: '"Sam"' });
  const out = renderProgram(edited);
  assert.ok(
    out.includes('class Arm:\n    def __init__(self):\n        self.pos = 0.0'),
    `the class body moved:\n${out}`
  );
  assert.ok(out.includes('name = "Sam"'), out);
});

check('a decorated function keeps its decorator after an edit', () => {
  const source = '@decorator\ndef move(joint):\n    return joint\n\nspeed = 1\n';
  const program = parseProgram(source);
  const speed = program.nodes.find((node) => node.kind === 'assign');
  const edited = updateNode(program, speed.id, { value: '2' });
  const out = renderProgram(edited);
  assert.ok(out.startsWith('@decorator\ndef move(joint):\n    return joint'), out);
  assert.ok(out.includes('speed = 2'), out);
});

check('generated Python parses, and parsing it back renders the same text', () => {
  let program = parseProgram(MVP);
  program = insertAtEnd(program, item('for').template).program;
  const loop = program.nodes[program.nodes.length - 1];
  program = insertNode(program, { bodyId: loop.id, index: 0 }, item('print').template).program;
  program = insertAtEnd(program, item('def').template).program;
  const fn = program.nodes[program.nodes.length - 1];
  program = insertNode(program, { bodyId: fn.id, index: 0 }, item('return').template).program;
  const text = renderProgram(program);
  assertPython(text, 'a composed program');
  assert.equal(renderProgram(parseProgram(text)), text);
});

check('a dropped block lands at the index the drop target named', () => {
  // A drag names a body and an index, not "the last tap's spot": the statement appears between
  // its neighbours, the library under it stays where it was, and the rendered code says so.
  const program = parseProgram('first = 1\nsecond = 2\nthird = 3\n');
  const dropped = insertNode(program, { bodyId: null, index: 1 }, item('print').template);
  const lines = renderProgram(dropped.program).trim().split('\n');
  assert.deepEqual(lines, ['first = 1', 'print("Hello")', 'second = 2', 'third = 3']);
  assert.ok(dropped.id, 'the dropped statement gets a fresh id');
  assertPython(renderProgram(dropped.program), 'a dropped root statement');

  // Dropping into a suite goes into that suite, at its own index, not at the program's end.
  const loop = parseProgram('items = [1]\nfor item in items:\n    print(item)\n');
  const suite = loop.nodes[1];
  const inside = insertNode(loop, { bodyId: suite.id, index: 0 }, item('print').template);
  assert.equal(inside.program.nodes.length, 2, 'the suite is still one root statement');
  assert.equal(inside.program.nodes[1].body.length, 2, 'the suite gained one statement');
  const nested = renderProgram(inside.program);
  assert.ok(nested.includes('for item in items:\n    print("Hello")\n    print(item)'), nested);
  assertPython(nested, 'a dropped statement inside a suite');
});

check('all nine toolbox categories exist in the plan’s order', () => {
  assert.deepEqual(
    TOOLBOX_CATEGORIES.map((category) => category.label),
    [
      'Variables',
      'Data Types',
      'Operators',
      'Conditions',
      'Loops',
      'Functions',
      'Input / Output',
      'Exceptions',
      'Modules',
    ]
  );
});

check('the initial elements the plan names are all present', () => {
  for (const id of [
    'assignment',
    'number',
    'text',
    'boolean',
    'decimal',
    'add',
    'subtract',
    'compare',
    'logic',
    'if',
    'elif',
    'else',
    'for',
    'while',
    'range',
    'def',
    'return',
    'print',
    'input',
    'try',
    'except',
    'import',
    'from-import',
  ]) {
    assert.ok(itemById(id), `missing toolbox element ${id}`);
  }
});

check('every toolbox item is unique and inserts a non-empty complete statement', () => {
  const ids = new Set();
  for (const entry of TOOLBOX_ITEMS) {
    assert.ok(!ids.has(entry.id), `duplicate toolbox id ${entry.id}`);
    ids.add(entry.id);
    assert.ok(entry.label.length > 0, `${entry.id} has no label`);
    assert.ok(entry.snippet.trim().length > 0, `${entry.id} has no snippet`);
    assert.ok(nodeHeader(entry.template) !== null || entry.template.lines.length > 0, entry.id);
    assert.ok(itemById(entry.id), `${entry.id} is not in the by-id map`);
  }
});

check('the composed toolbox program is valid Python', () => {
  const lines = ['age = 18', 'items = [1, 2, 3]', 'ready = True', 'armed = True', 'a = 1', 'b = 2', 'size = 4'];
  for (const entry of TOOLBOX_ITEMS) {
    // Clauses need the statement before them, `try` needs a handler, and `return` needs a function:
    // they are legal Python only inside a host, which the two lines below provide.
    if (['elif', 'else', 'except', 'finally', 'try', 'return'].includes(entry.id)) continue;
    lines.push(renderProgram(insertAtEnd(parseProgram(''), entry.template).program));
  }
  lines.push('def greet(name):\n    return result');
  lines.push('if size > 100:\n    pass\nelif size > 10:\n    pass\nelse:\n    pass');
  lines.push('try:\n    pass\nexcept ValueError:\n    pass\nfinally:\n    pass');
  assertPython(`${lines.join('\n')}\n`, 'every toolbox template');
});

check('search reads labels, Python, keywords and categories', () => {
  const printHits = filterItems(TOOLBOX_ITEMS, 'print').map((entry) => entry.id);
  assert.ok(printHits.includes('print'), printHits.join(','));
  assert.ok(filterItems(TOOLBOX_ITEMS, 'range').some((entry) => entry.id === 'range'));
  assert.ok(filterItems(TOOLBOX_ITEMS, 'exception').length > 0);
  assert.equal(filterItems(TOOLBOX_ITEMS, 'zzzzz').length, 0);
  assert.deepEqual(filterItems(TOOLBOX_ITEMS, ''), [...TOOLBOX_ITEMS]);
});

check('a category filter returns only that category, and search reads past it', () => {
  const loops = toolboxItems({ category: 'loops', query: '', sort: 'recommended' });
  assert.ok(loops.length >= 3);
  assert.ok(loops.every((entry) => entry.category === 'loops'));
  const printFromLoops = toolboxItems({ category: 'loops', query: 'print', sort: 'recommended' });
  assert.ok(printFromLoops.some((entry) => entry.id === 'print'));
});

check('the four sorts are deterministic and mean what they say', () => {
  const az = sortItems(TOOLBOX_ITEMS, 'az');
  const labels = az.map((entry) => entry.label.toLowerCase());
  assert.deepEqual(labels, [...labels].sort((a, b) => a.localeCompare(b)));

  const recommended = sortItems(TOOLBOX_ITEMS, 'recommended');
  assert.equal(recommended[0].id, 'assignment');
  const ranks = recommended.map((entry) => entry.rank);
  assert.deepEqual(ranks, [...ranks].sort((a, b) => a - b));

  const grouped = sortItems(TOOLBOX_ITEMS, 'categories');
  const categoryIndexes = grouped.map((entry) =>
    TOOLBOX_CATEGORIES.findIndex((category) => category.id === entry.category)
  );
  assert.deepEqual(categoryIndexes, [...categoryIndexes].sort((a, b) => a - b));

  const recent = sortItems(TOOLBOX_ITEMS, 'recent', ['print', 'def']);
  assert.deepEqual(recent.slice(0, 2).map((entry) => entry.id), ['print', 'def']);
});

check('every kind has its own Colorful ink and its own Normal rule', () => {
  const kinds = Object.keys(KIND_LABELS);
  const inks = new Set(kinds.map((kind) => blockColors(kind, 'colorful').ink));
  const rules = new Set(kinds.map((kind) => blockColors(kind, 'normal').rule));
  assert.equal(inks.size, kinds.length, 'Colorful should give every statement kind a distinct ink');
  assert.equal(rules.size, kinds.length, 'Normal should give every statement kind a distinct rule');
});

check('a stored preference is normalized field by field', () => {
  assert.deepEqual(normalizeBlockSettings(null), {
    mode: 'code',
    appearance: 'normal',
    sort: 'recommended',
    recent: [],
  });
  assert.deepEqual(
    normalizeBlockSettings({
      mode: 'visual',
      appearance: 'colorful',
      sort: 'az',
      recent: ['print', 'print', 7, 'def'],
    }),
    { mode: 'visual', appearance: 'colorful', sort: 'az', recent: ['print', 'def'] }
  );
  assert.equal(normalizeBlockSettings({ mode: 'blocks' }).mode, 'code');
  assert.equal(normalizeBlockSettings({ appearance: 'rainbow' }).appearance, 'normal');
  assert.equal(normalizeBlockSettings({ sort: 'popular' }).sort, 'recommended');
});

check('a raw statement is its own node, not a deletion', () => {
  const program = parseProgram('del items[0]\n');
  assert.equal(program.nodes.length, 1);
  assert.equal(program.nodes[0].kind, 'raw');
  assert.equal(renderProgram(program), 'del items[0]\n');
  const edited = insertAtEnd(program, item('print').template).program;
  assert.ok(renderProgram(edited).startsWith('del items[0]\nprint("Hello")'));
});

check('the assignment operators keep their identity, comparisons do not', () => {
  const program = parseProgram('count += 1\ncount %= 2\nage >= 18\nflag = a == b\n');
  assert.deepEqual(kinds(program.nodes), ['assign', 'assign', 'raw', 'assign']);
  assert.equal(program.nodes[0].fields.op, '+=', 'augmented assignment keeps its operator');
  assert.equal(program.nodes[1].fields.op, '%=', 'the modulo assignment is an assignment too');
  assert.equal(program.nodes[3].fields.value, 'a == b');
});

check('a new node helper never shares fields or bodies with its template', () => {
  const template = newNode('call', { callee: 'print', args: '"Hi"' });
  const copy = newNode(template.kind, template.fields, template.body, template.lines);
  copy.fields.args = '"Bye"';
  assert.equal(template.fields.args, '"Hi"');
  assert.notEqual(copy.fields, template.fields);
});

console.log(`\npython blocks: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
