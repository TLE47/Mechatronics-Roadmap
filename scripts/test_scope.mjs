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
  MIN_SCOPE_ZOOM_SPAN,
  cursorReadout,
  formatScopeNumber,
  normalizeScopeSeries,
  panWindow,
  sampleAt,
  scopeBounds,
  scopeBoundsIn,
  scopeLast,
  scopeTableRows,
  scopeTimeRange,
  zoomWindow,
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

check('the cursor reads a logged sample exactly', () => {
  const [series] = normalizeScopeSeries([{ name: 'x', t: [0, 1, 2], y: [5, 7, 9] }]);
  assert.equal(sampleAt(series, 1), 7);
  assert.equal(sampleAt(series, 0), 5);
  assert.equal(sampleAt(series, 2), 9);
});

check('a cursor between samples interpolates the line, not the nearest point', () => {
  const [series] = normalizeScopeSeries([{ name: 'x', t: [0, 1, 2], y: [5, 7, 9] }]);
  assert.equal(sampleAt(series, 0.25), 5.5);
  assert.equal(sampleAt(series, 1.5), 8);
});

check('outside a trace there is no value rather than a made-up one', () => {
  const [series] = normalizeScopeSeries([{ name: 'late', t: [4, 5], y: [1, 2] }]);
  assert.equal(sampleAt(series, 3.9), null);
  assert.equal(sampleAt(series, 5.1), null);
  assert.equal(sampleAt(series, NaN), null);
});

check('a loop that logged out of order still reads correctly', () => {
  const series = { name: 'shuffled', t: [2, 0, 1], y: [9, 5, 7] };
  assert.equal(sampleAt(series, 0.5), 6);
  assert.equal(sampleAt(series, 1), 7);
});

check('one reading per trace at the same t, and none for the trace that ends earlier', () => {
  const series = normalizeScopeSeries([
    { name: 'long', t: [0, 1, 2], y: [0, 2, 4] },
    { name: 'short', t: [0, 0.5], y: [10, 11] },
  ]);
  assert.deepEqual(cursorReadout(series, 1), [
    { name: 'long', value: 2 },
    { name: 'short', value: null },
  ]);
  assert.deepEqual(cursorReadout(series, null), []);
});

check('zooming in keeps the time under the anchor where it is', () => {
  const extent = { tMin: 0, tMax: 10 };
  const view = zoomWindow({ tMin: 0, tMax: 10 }, extent, 0.5, 4);
  assert.equal(view.tMax - view.tMin, 5, 'half the span');
  assert.equal(view.tMin, 2, 'the anchor was four tenths in, and stays four tenths in');
  assert.equal(view.tMax, 7);
  assert.equal(sampleAt({ name: 'anchor', t: [0, 10], y: [0, 10] }, 4), 4);
  assert.ok(view.tMin < 4 && view.tMax > 4, 'the time under the pointer is still inside the view');
});

check('a zoom never leaves the data, and never narrows past the floor', () => {
  const extent = { tMin: 0, tMax: 10 };
  const atEdge = zoomWindow({ tMin: 0, tMax: 10 }, extent, 0.5, 0);
  assert.equal(atEdge.tMin, 0);
  assert.equal(atEdge.tMax, 5);
  const out = zoomWindow({ tMin: 2, tMax: 4 }, extent, 100, 3);
  assert.deepEqual(out, { tMin: 0, tMax: 10 }, 'zooming out stops at the whole trace');
  let view = { tMin: 0, tMax: 10 };
  for (let i = 0; i < 40; i += 1) view = zoomWindow(view, extent, 0.5, 5);
  assert.ok(
    Math.abs(view.tMax - view.tMin - 10 * MIN_SCOPE_ZOOM_SPAN) < 1e-9,
    `the floor is the whole span / 1000, got ${view.tMax - view.tMin}`
  );
  assert.ok(view.tMin >= 0 && view.tMax <= 10);
});

check('panning slides the window and stops at the data', () => {
  const extent = { tMin: 0, tMax: 10 };
  const right = panWindow({ tMin: 2, tMax: 6 }, extent, 0.5);
  assert.deepEqual(right, { tMin: 4, tMax: 8 });
  const clamped = panWindow({ tMin: 2, tMax: 6 }, extent, 5);
  assert.deepEqual(clamped, { tMin: 6, tMax: 10 }, 'the span is kept at the right edge');
  const left = panWindow({ tMin: 2, tMax: 6 }, extent, -5);
  assert.deepEqual(left, { tMin: 0, tMax: 4 });
});

check('the y axis follows what is on screen, not the whole trace', () => {
  const series = normalizeScopeSeries([{ name: 'settle', t: [0, 1, 2, 3], y: [0, 10, 19, 20] }]);
  const bounds = scopeBoundsIn(series, { tMin: 2, tMax: 3 });
  assert.deepEqual(bounds, { tMin: 2, tMax: 3, yMin: 19, yMax: 20 });
  assert.deepEqual(
    scopeBoundsIn(series, { tMin: 2, tMax: 3 }),
    bounds,
    'the visible window and the y range describe the same slice'
  );
});

check('a window with no sample, or a flat one, still gets a usable scale', () => {
  const series = normalizeScopeSeries([{ name: 'flat', t: [0, 1], y: [4, 4] }]);
  const empty = scopeBoundsIn(series, { tMin: 5, tMax: 6 });
  assert.deepEqual(empty, scopeBounds(series), 'the fallback is the whole trace');
  const flat = scopeBoundsIn(series, { tMin: 0, tMax: 1 });
  assert.ok(flat.yMax > flat.yMin, 'a flat window is widened instead of dividing by zero');
});

check('the time extent is the furthest a zoom or pan may go', () => {
  const series = normalizeScopeSeries([
    { name: 'a', t: [1, 2], y: [0, 0] },
    { name: 'b', t: [0.5, 3], y: [0, 0] },
  ]);
  assert.deepEqual(scopeTimeRange(series), { tMin: 0.5, tMax: 3 });
  assert.deepEqual(
    scopeTimeRange(normalizeScopeSeries([{ name: 'one', t: [7], y: [1] }])),
    { tMin: 7, tMax: 8 },
    'a single sample still has a span to draw'
  );
  assert.equal(scopeTimeRange([]), null);
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
