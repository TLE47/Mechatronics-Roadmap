#!/usr/bin/env node
/**
 * The Scope accepts what a run can actually produce (`scripts/test_scope.mjs`).
 *
 * `app/src/scopeModel.ts` decides whether a worker payload is a plottable trace. The cases that matter
 * are the ones a working lesson hits at its edges: a diverging simulation emitting NaN, a `zip` of two
 * lists of different lengths, a loop recording more points than a canvas can show, a flat trace that
 * would divide by zero on a scale, and a screen reader that needs the numbers as text.
 *
 * Run: node --experimental-strip-types scripts/test_scope.mjs (`npm run test:scope`)
 */

import assert from 'node:assert/strict';
import {
  MAX_SCOPE_POINTS,
  formatScopeNumber,
  normalizeScopeSeries,
  scopeBounds,
  scopeLast,
  scopeTableRows,
} from '../app/src/scopeModel.ts';

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

const ramp = (n) => Array.from({ length: n }, (_, i) => i / (n - 1));

console.log('scope');

check('a named series keeps its points in order', () => {
  const [series] = normalizeScopeSeries([{ name: 'theta', t: [0, 0.5, 1], y: [0, 0.39, 0.63] }]);
  assert.equal(series.name, 'theta');
  assert.deepEqual(series.t, [0, 0.5, 1]);
  assert.deepEqual(series.y, [0, 0.39, 0.63]);
  assert.equal(series.truncated, undefined);
});

check('NaN and infinity are dropped, not plotted', () => {
  const [series] = normalizeScopeSeries([
    { name: 'x', t: [0, 0.1, 0.2, 0.3], y: [1, NaN, Infinity, 2] },
  ]);
  assert.deepEqual(series.t, [0, 0.3]);
  assert.deepEqual(series.y, [1, 2]);
});

check('a message shorter in y than in t is cut to the shorter one', () => {
  const [series] = normalizeScopeSeries([{ name: 'x', t: [0, 1, 2, 3], y: [10, 20] }]);
  assert.deepEqual(series.t, [0, 1]);
  assert.deepEqual(series.y, [10, 20]);
});

check('an unnamed series is still kept, numbered among the kept ones', () => {
  const series = normalizeScopeSeries([{}, { t: [0], y: [1] }, { name: '  ', t: [0], y: [2] }]);
  assert.deepEqual(series.map((one) => one.name), ['series 1', 'series 2']);
});

check('a series past the cap keeps its first points and says so', () => {
  const count = MAX_SCOPE_POINTS + 500;
  const [series] = normalizeScopeSeries([
    { name: 'long', t: Array.from({ length: count }, (_, i) => i), y: Array.from({ length: count }, () => 1) },
  ]);
  assert.equal(series.t.length, MAX_SCOPE_POINTS);
  assert.equal(series.truncated, true);
  assert.equal(series.t[0], 0, 'the transient at the start is what a learner is looking at');
});

check('a payload that is not a list of series is refused, not guessed at', () => {
  assert.deepEqual(normalizeScopeSeries(null), []);
  assert.deepEqual(normalizeScopeSeries('nope'), []);
  assert.deepEqual(normalizeScopeSeries([null, 3, 'x']), []);
  assert.deepEqual(normalizeScopeSeries([{ name: 'empty', t: [], y: [] }]), []);
});

check('scalars and typed arrays are accepted, the way a helper may hand them over', () => {
  const [series] = normalizeScopeSeries([
    { name: 'one', t: 0, y: 1 },
    { name: 'typed', t: Float64Array.from([0, 1]), y: Float64Array.from([2, 3]) },
  ]);
  assert.deepEqual(series.t, [0]);
  assert.deepEqual(series.y, [1]);
});

check('the shared window covers every series', () => {
  const series = normalizeScopeSeries([
    { name: 'a', t: [0, 1], y: [-2, 1] },
    { name: 'b', t: [0.5, 4], y: [0, 3] },
  ]);
  assert.deepEqual(scopeBounds(series), { tMin: 0, tMax: 4, yMin: -2, yMax: 3 });
});

check('a flat trace gets a unit of height instead of a division by zero', () => {
  const bounds = scopeBounds(normalizeScopeSeries([{ name: 'still', t: [0, 1, 2], y: [5, 5, 5] }]));
  assert.ok(bounds.yMax > bounds.yMin, 'a zero-height range must be widened');
  assert.equal(bounds.yMin, 4);
  assert.equal(bounds.yMax, 6);
});

check('no series means no window, so the panel draws nothing', () => {
  assert.equal(scopeBounds([]), null);
});

check('the legend prints the last value of a trace', () => {
  const [series] = normalizeScopeSeries([{ name: 'x', t: [0, 1, 2], y: [3, 4, 5] }]);
  assert.equal(scopeLast(series), 5);
});

check('a number reads in four significant figures, with an exponent only when it earns it', () => {
  assert.equal(formatScopeNumber(0), '0');
  assert.equal(formatScopeNumber(0.98153), '0.9815');
  assert.equal(formatScopeNumber(1234.5678), '1235');
  assert.equal(formatScopeNumber(123456), '1.23e+5');
  assert.equal(formatScopeNumber(0.000123), '1.23e-4');
  assert.equal(formatScopeNumber(NaN), '—');
});

check('the table samples the whole window, first and last included', () => {
  const series = normalizeScopeSeries([{ name: 'x', t: ramp(101), y: ramp(101).map((v) => v * 2) }]);
  const rows = scopeTableRows(series, 6);
  assert.equal(rows.length, 6);
  assert.equal(rows[0].t, 0);
  assert.equal(rows[rows.length - 1].t, 1);
  assert.equal(rows[0].values[0], 0);
  assert.equal(rows[rows.length - 1].values[0], 2);
  // Evenly spaced: no two rows landed on the same sample.
  assert.equal(new Set(rows.map((row) => row.i)).size, 6);
});

check('a shorter series shows a dash instead of another series\' number', () => {
  const series = normalizeScopeSeries([
    { name: 'long', t: [0, 1, 2, 3], y: [0, 1, 2, 3] },
    { name: 'short', t: [0, 1], y: [9, 8] },
  ]);
  const rows = scopeTableRows(series, 4);
  assert.equal(rows[3].values[0], 3);
  assert.equal(rows[3].values[1], null);
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
