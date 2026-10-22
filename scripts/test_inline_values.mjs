#!/usr/bin/env node
/**
 * Inline values: the rules (`scripts/test_inline_values.mjs`, `npm run test:inline`)
 *
 * The value a run leaves in a name is drawn beside the line that bound it. What makes that honest is
 * not the drawing, it is the three rules `app/src/inlineValues.ts` states, and each fails in its own
 * way if it is wrong:
 *
 * 1. **Only a top-level assignment is a home.** A line inside a function runs many times with many
 *    values, so one of them drawn beside the source would be a lie with extra steps. `==`, `+=`, an
 *    indented line and a comment are not assignments, and a name with no line is dropped rather than
 *    guessed at.
 * 2. **The last binding wins.** `total = 0` at the top and `total = 12` at the bottom means 12
 *    belongs to the bottom line — the one whose value is still there when the program ends.
 * 3. **Nothing crosses the boundary untyped.** The payload comes out of `postMessage`, so a name that
 *    is not a string, a value that is not a string, a dunder and a malformed entry are all dropped;
 *    a long value is cut the same way the worker cut it, so the chip cannot sprawl across the line.
 *
 * Run: node --experimental-strip-types scripts/test_inline_values.mjs
 */

import assert from 'node:assert/strict';
import {
  MAX_INLINE_CHARS,
  assignmentLines,
  formatInlineValue,
  inlineValuesFor,
  readRunValues,
} from '../app/src/inlineValues.ts';

let passed = 0;
let failed = 0;

function check(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`  ok   ${name}`);
  } catch (error) {
    failed += 1;
    console.error(`  FAIL ${name}\n       ${error.message}`);
  }
}

console.log('inline values');

check('only a top-level assignment names a line', () => {
  const code = [
    'x = 1',                         // 1  yes
    'y: float = 2.0',                // 2  annotated, yes
    'if x == 1:',                    // 3  a comparison, not an assignment
    '    inner = 5',                 // 4  indented: inside something
    'x += 1',                        // 5  augmented, not a binding of a new value
    '# z = 9',                       // 6  a comment
    'while y != 0:',                 // 7  a loop condition
    '    y = y - 1',                 // 8  indented
    'last = x',                      // 9  yes
  ].join('\n');
  const lines = assignmentLines(code);
  assert.deepEqual([...lines.keys()], ['x', 'y', 'last'], `expected x, y, last; got ${[...lines.keys()]}`);
  assert.equal(lines.get('x'), 1, 'x is bound on line 1');
  assert.equal(lines.get('y'), 2, 'an annotated assignment is still an assignment');
  assert.equal(lines.get('last'), 9);
  assert.equal(lines.has('inner'), false, 'a name bound inside a block has no single value to draw');
});

check('the last binding is the one that holds the value', () => {
  const code = 'total = 0\nfor step in range(3):\n    total = total + step\ntotal = 12\n';
  const lines = assignmentLines(code);
  assert.equal(lines.get('total'), 4, 'expected the final top-level binding, not the first');
  const placed = inlineValuesFor(code, [{ name: 'total', value: '12' }]);
  assert.deepEqual(placed, [{ name: 'total', value: '12', line: 4 }]);
});

check('a value with no line in this text is dropped', () => {
  const code = 'a = 1\n';
  // The learner edited after running: `b` was in the run's namespace, `a` was renamed away.
  const placed = inlineValuesFor(code, [
    { name: 'b', value: '2' },
    { name: 'a', value: '1' },
  ]);
  assert.deepEqual(placed, [{ name: 'a', value: '1', line: 1 }], 'expected only the name the text still binds');
});

check('values are ordered by line, whatever order the worker sent', () => {
  const code = 'first = 1\nsecond = 2\nthird = 3\n';
  const placed = inlineValuesFor(code, [
    { name: 'third', value: '3' },
    { name: 'first', value: '1' },
    { name: 'second', value: '2' },
  ]);
  assert.deepEqual(
    placed.map((entry) => entry.name),
    ['first', 'second', 'third'],
    'the widget set is built in range order; an unsorted set is a CodeMirror range error',
  );
});

check('the worker payload is validated, not trusted', () => {
  const raw = [
    { name: 'kept', value: '3' },
    { name: '_private', value: '1' },
    { name: 'not a name', value: '2' },
    { name: 42, value: '3' },
    { name: 'novalue', value: 7 },
    null,
    'string',
    { name: 'also_kept', value: 'x' },
  ];
  assert.deepEqual(readRunValues(raw), [
    { name: 'kept', value: '3' },
    { name: 'also_kept', value: 'x' },
  ]);
  assert.deepEqual(readRunValues(undefined), [], 'a run with no payload draws nothing');
  assert.deepEqual(readRunValues({ name: 'x' }), [], 'a non-array is not a list of values');
});

check('a long value is flattened and cut, with an ellipsis that says so', () => {
  assert.equal(formatInlineValue('  [1, 2, 3]  '), '[1, 2, 3]', 'whitespace collapses to one line');
  assert.equal(formatInlineValue('a\nb\tc'), 'a b c', 'a repr with newlines must not break the line box');
  const long = formatInlineValue(`[${Array.from({ length: 40 }, (_, index) => index).join(', ')}]`);
  assert.ok(long.length <= MAX_INLINE_CHARS, `expected <= ${MAX_INLINE_CHARS} characters, got ${long.length}`);
  assert.ok(long.endsWith('…'), 'a cut value must say it was cut');
  assert.ok(!long.endsWith(' …'), 'no stray space before the ellipsis');
  const word = formatInlineValue('word '.repeat(30));
  assert.ok(word.endsWith('…'));
  // One unbroken token (a long string) has no space to cut at: it is cut where it must be.
  const token = formatInlineValue('x'.repeat(90));
  assert.equal(token.length, MAX_INLINE_CHARS);
});

check('the empty cases stay empty', () => {
  assert.deepEqual(inlineValuesFor('', []), []);
  assert.deepEqual(inlineValuesFor('x = 1\n', []), []);
  assert.equal(assignmentLines('').size, 0);
  assert.equal(assignmentLines('# nothing here\n').size, 0);
});

console.log(`\ninline values: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
