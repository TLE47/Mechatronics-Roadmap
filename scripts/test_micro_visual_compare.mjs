#!/usr/bin/env node
/**
 * The micro-visual comparator's contract without a browser
 * (`scripts/test_micro_visual_compare.mjs`, run by `tests/test_micro_visual_compare.py` through the
 * unittest discovery `check:all --full` and CI already run).
 *
 * The comparator is the part of `check:micro-visuals` that decides pass or fail; the browser sweep
 * only supplies its inputs. Its failure mode is silence: a dropped label, a moved text run, a
 * changed style fingerprint, a new element or an ignored measurement issue all exit 0 if the wrong
 * field is compared. Each case below moves exactly one thing and names the row it must produce.
 */

import assert from 'node:assert/strict';
import { compareMicroVisuals } from './micro_visual_compare.mjs';

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

/** One recorded render, in the shape the browser sweep produces. */
const render = () => ({
  width: 477,
  height: 140,
  frameStyle: 'frame-style',
  text: 'MICRO FOCUS A label 12.0',
  textRuns: [
    ['MICRO FOCUS', [14, 14, 100, 12]],
    ['A label', [14, 32, 60, 12]],
    ['12.0', [80, 32, 28, 12]],
  ],
  fallbacks: [],
  elements: [
    ['figure', [0, 0, 477, 140], 'figure-style'],
    ['div', [14, 14, 449, 112], 'scene-style'],
  ],
  svgs: ['svg-a'],
  issues: [],
});

const recorded = () => ({
  variables: { 477: render(), 966: { ...render(), width: 966 } },
  'int-float': { 477: render(), 966: { ...render(), width: 966 } },
});

const measured = () => recorded();

const rowNames = (result) => result.rows.map((row) => `${row.scene}@${row.width} ${row.part} ${row.field}`);

const cases = [
  ['an unchanged sweep passes', measured(), []],
  ['a missing label fails on visible text', (actual) => {
    actual.variables[477].text = 'MICRO FOCUS A label';
  }, ['variables@477 text visible']],
  ['a changed label fails on its text run', (actual) => {
    actual.variables[477].textRuns[1][0] = 'A label moved';
  }, ['variables@477 text-runs 1.text']],
  ['a label that disappeared fails on the run count', (actual) => {
    actual.variables[477].textRuns.pop();
  }, ['variables@477 text-runs count']],
  ['a text run moved exactly the tolerance passes', (actual) => {
    actual.variables[477].textRuns[0][1][0] += 2;
  }, []],
  ['a text run moved past the tolerance fails', (actual) => {
    actual.variables[477].textRuns[0][1][0] += 3;
  }, ['variables@477 text-runs 0.box']],
  ['a changed frame style fails', (actual) => {
    actual.variables[477].frameStyle = 'other-frame';
  }, ['variables@477 frame style']],
  ['a changed element style fingerprint fails', (actual) => {
    actual.variables[477].elements[1][2] = 'other-scene';
  }, ['variables@477 elements 1.style']],
  ['a new element fails on the count', (actual) => {
    actual.variables[477].elements.push(['span', [10, 10, 10, 10], 'new']);
  }, ['variables@477 elements count']],
  ['an element moved past the tolerance fails', (actual) => {
    actual.variables[477].elements[1][1][2] += 4;
  }, ['variables@477 elements 1.box']],
  ['a changed vector fingerprint fails', (actual) => {
    actual.variables[477].svgs[0] = 'svg-b';
  }, ['variables@477 svgs 0']],
  ['a scene height change within tolerance passes', (actual) => {
    actual.variables[477].height += 2;
  }, []],
  ['a scene height change past tolerance fails', (actual) => {
    actual.variables[477].height += 3;
  }, ['variables@477 height figure']],
  ['a width change fails', (actual) => {
    actual.variables[477].width = 476;
  }, ['variables@477 width figure']],
  ['a measured issue fails even when the recording matches', (actual) => {
    actual.variables[477].issues.push('text-clipped:A label');
  }, ['variables@477 issue text-clipped']],
  ['a changed stand-in glyph list fails', (actual) => {
    actual.variables[477].fallbacks = ['≈'];
  }, ['variables@477 font fallbacks']],
  ['a new scene fails', (actual) => {
    actual['datasheet-units'] = { 477: render(), 966: { ...render(), width: 966 } };
  }, ['datasheet-units@* scene new']],
];

for (const [name, mutate, rows] of cases) {
  check(name, () => {
    const actual = measured();
    if (typeof mutate === 'function') mutate(actual);
    assert.deepEqual(rowNames(compareMicroVisuals(recorded(), actual, { tolerance: 2 })), rows);
  });
}

check('a recorded scene the sweep did not produce is stale', () => {
  const actual = measured();
  delete actual['int-float'];
  const result = compareMicroVisuals(recorded(), actual, { tolerance: 2 });
  assert.deepEqual(result.rows, []);
  assert.deepEqual(result.stale, ['int-float']);
});

check('a recorded width the sweep did not produce is stale', () => {
  const actual = measured();
  delete actual.variables[966];
  const result = compareMicroVisuals(recorded(), actual, { tolerance: 2 });
  assert.deepEqual(result.rows, []);
  assert.deepEqual(result.stale, ['variables@966']);
});

check('a narrowed run does not report the unmeasured scenes as stale', () => {
  const actual = { variables: measured().variables };
  const result = compareMicroVisuals(recorded(), actual, { tolerance: 2, checkStale: false });
  assert.deepEqual(result.rows, []);
  assert.deepEqual(result.stale, []);
});

check('a row names both numbers, not just a count', () => {
  const actual = measured();
  actual.variables[477].textRuns[0][1][0] += 9;
  const [row] = compareMicroVisuals(recorded(), actual, { tolerance: 2 }).rows;
  assert.equal(row.scene, 'variables');
  assert.equal(row.width, '477');
  assert.equal(row.part, 'text-runs');
  assert.equal(row.field, '0.box');
  assert.deepEqual(row.expected, [14, 14, 100, 12]);
  assert.deepEqual(row.actual, [23, 14, 100, 12]);
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exitCode = failed ? 1 : 0;
