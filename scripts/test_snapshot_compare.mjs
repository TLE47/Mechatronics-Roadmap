#!/usr/bin/env node
/**
 * The surface comparator's contract without a browser (`scripts/test_snapshot_compare.mjs`,
 * run by `tests/test_snapshot_compare.py` through the unittest discovery `check:all --full` and CI
 * already run).
 *
 * The comparator is the part of `check:snapshot` that decides pass or fail; the browser sweep only
 * supplies its inputs. Its failure mode is silence: a tolerance raised by a pixel, a count compared
 * loosely, a surface dropped from either side or a box the recording never saw all exit 0, and a gate
 * that cannot fail is a screenshot. Each case below moves one number and names the row it must
 * produce; a boundary case holds the tolerance itself (2 px passes, 3 px fails).
 */

import assert from 'node:assert/strict';
import { compareSnapshot } from './snapshot_compare.mjs';

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

/** One recorded surface, in the shape the sweep produces. */
const surface = () => ({
  boxes: { header: [0, 0, 1440, 60], panel: [200, 0, 1200, 300] },
  counts: { buttons: 5, inputs: 2 },
  styles: { body: { display: 'block', background: 'rgb(0, 0, 0)' }, tokens: { bg: '#070b12' } },
});

/** A copy of the surface with one thing changed, so each case states only what moved. */
function changed(edit) {
  const copy = structuredClone(surface());
  edit(copy);
  return copy;
}

const rowNames = (result) => result.rows.map((row) => `${row.surface} ${row.part} ${row.field}`);

/**
 * name, recorded, measured, the rows that must name the drift, and the stale list. Every case keeps
 * `dark/tab` on both sides unless it is about a surface appearing or disappearing.
 */
const cases = [
  ['an unchanged surface passes', { 'dark/tab': surface() }, { 'dark/tab': surface() }, []],
  [
    'a box moved exactly the tolerance passes',
    { 'dark/tab': surface() },
    { 'dark/tab': changed((s) => (s.boxes.header[1] += 2)) },
    [],
  ],
  [
    'a box moved past the tolerance fails',
    { 'dark/tab': surface() },
    { 'dark/tab': changed((s) => (s.boxes.header[1] += 3)) },
    ['dark/tab boxes header'],
  ],
  [
    'a width change fails',
    { 'dark/tab': surface() },
    { 'dark/tab': changed((s) => (s.boxes.header[2] += 3)) },
    ['dark/tab boxes header'],
  ],
  [
    'a height change fails',
    { 'dark/tab': surface() },
    { 'dark/tab': changed((s) => (s.boxes.panel[3] -= 4)) },
    ['dark/tab boxes panel'],
  ],
  [
    'a count change fails',
    { 'dark/tab': surface() },
    { 'dark/tab': changed((s) => (s.counts.buttons += 1)) },
    ['dark/tab counts buttons'],
  ],
  [
    'a count the measurement lost fails',
    { 'dark/tab': surface() },
    { 'dark/tab': changed((s) => delete s.counts.inputs) },
    ['dark/tab counts inputs'],
  ],
  [
    'a resolved style that changed fails',
    { 'dark/tab': surface() },
    { 'dark/tab': changed((s) => (s.styles.body.display = 'flex')) },
    ['dark/tab styles body.display'],
  ],
  [
    'a palette token that changed fails',
    { 'dark/tab': surface() },
    { 'dark/tab': changed((s) => (s.styles.tokens.bg = '#000000')) },
    ['dark/tab styles tokens.bg'],
  ],
  [
    'a measured box with no recorded counterpart fails',
    { 'dark/tab': surface() },
    { 'dark/tab': changed((s) => (s.boxes['wf-port-left-0'] = [486, 227, 20, 20])) },
    ['dark/tab boxes wf-port-left-0'],
  ],
  [
    'a recorded box that did not appear fails',
    { 'dark/tab': changed((s) => (s.boxes['wf-chip-0'] = [491, 484, 162, 26])) },
    { 'dark/tab': surface() },
    ['dark/tab boxes wf-chip-0'],
  ],
  [
    'a measured surface with no recording fails',
    { 'dark/tab': surface() },
    { 'dark/tab': surface(), 'light/tab': surface() },
    ['light/tab surface new'],
  ],
  [
    'a recorded surface the sweep did not produce is stale',
    { 'dark/tab': surface(), 'light/tab': surface() },
    { 'dark/tab': surface() },
    [],
    ['light/tab'],
  ],
  [
    'a narrowed run does not report the unmeasured surfaces as stale',
    { 'dark/tab': surface(), 'light/tab': surface() },
    { 'dark/tab': surface() },
    [],
    [],
    { checkStale: false },
  ],
  [
    'a zero tolerance rejects a one-pixel move',
    { 'dark/tab': surface() },
    { 'dark/tab': changed((s) => (s.boxes.header[0] += 1)) },
    ['dark/tab boxes header'],
    [],
    { tolerance: 0 },
  ],
  [
    'a ten-pixel tolerance accepts a three-pixel move',
    { 'dark/tab': surface() },
    { 'dark/tab': changed((s) => (s.boxes.header[0] += 3)) },
    [],
    [],
    { tolerance: 10 },
  ],
];

for (const [name, recorded, measured, rows, stale = [], options = {}] of cases) {
  check(name, () => {
    const result = compareSnapshot(recorded, measured, { tolerance: 2, ...options });
    assert.deepEqual(rowNames(result), rows);
    assert.deepEqual(result.stale, stale);
  });
}

check('a moved box names the field and both boxes, not just a count', () => {
  const recorded = { 'dark/workflow': surface() };
  const measured = { 'dark/workflow': changed((s) => (s.boxes.panel[0] += 9)) };
  const [row] = compareSnapshot(recorded, measured, { tolerance: 2 }).rows;
  assert.equal(row.surface, 'dark/workflow');
  assert.equal(row.part, 'boxes');
  assert.equal(row.field, 'panel');
  assert.deepEqual(row.expected, [200, 0, 1200, 300]);
  assert.deepEqual(row.actual, [209, 0, 1200, 300]);
});

check('an empty sweep against a recording reports every surface stale', () => {
  const result = compareSnapshot({ 'dark/tab': surface(), 'light/tab': surface() }, {}, { tolerance: 2 });
  assert.deepEqual(result.rows, []);
  assert.deepEqual(result.stale.sort(), ['dark/tab', 'light/tab']);
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exitCode = failed ? 1 : 0;
