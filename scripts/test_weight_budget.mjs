#!/usr/bin/env node
/**
 * The weight budget's rules (`scripts/test_weight_budget.mjs`, `npm run test:weight`).
 *
 * `check_weight_budget.mjs` measures a real `dist/`; the judgement it applies is
 * [`weight_budget.mjs`](weight_budget.mjs), and a suite that only ever runs it against a build that
 * fits cannot tell a gate from a green light. So each direction is pinned here with invented numbers:
 *
 *   - under budget, exactly at it, and one byte over it (the boundary is where a gate is usually
 *     wrong by one);
 *   - a budget with nothing measured behind it — the direction that matters most, because a metric
 *     the build stopped emitting would otherwise pass forever;
 *   - the tightest metric, which is the number the report quotes;
 *   - the measurement itself: what counts as js, css, a font, and the largest single chunk.
 *
 * Run: node scripts/test_weight_budget.mjs
 */

import assert from 'node:assert/strict';
import {
  METRICS,
  compareBudgets,
  formatBytes,
  formatHeadroom,
  formatUsed,
  measurementFrom,
} from './weight_budget.mjs';

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

const budget = { js_gzip: 1000, css_gzip: 100, fonts: 500, largest_js_gzip: 800, total: 2000 };
const fits = { js_gzip: 900, css_gzip: 90, fonts: 450, largest_js_gzip: 700, total: 1800 };

console.log('weight budget');

check('a bundle under every budget passes', () => {
  const report = compareBudgets(fits, budget);
  assert.equal(report.breaches.length, 0);
  assert.equal(report.unmeasured.length, 0);
  assert.equal(report.rows.length, METRICS.length, 'every metric must be compared, not only the small ones');
});

check('spending the budget exactly is not a breach', () => {
  const report = compareBudgets(budget, budget);
  assert.equal(report.breaches.length, 0, 'a metric at its ceiling is within it');
  assert.equal(report.rows.find((row) => row.metric === 'total').headroom, 0);
});

check('one byte over is a breach, and it names the metric', () => {
  const report = compareBudgets({ ...fits, js_gzip: 1001 }, budget);
  assert.deepEqual(
    report.breaches.map((row) => row.metric),
    ['js_gzip'],
    'expected exactly the metric that went over'
  );
  assert.equal(report.breaches[0].headroom, -1, 'expected the breach to carry the overshoot');
});

check('a budget with no measurement fails, so a vanished metric cannot pass', () => {
  const measured = { ...fits };
  delete measured.largest_js_gzip;
  const report = compareBudgets(measured, budget);
  assert.deepEqual(
    report.unmeasured.map((row) => row.metric),
    ['largest_js_gzip'],
    'expected the missing metric to be reported as unmeasured, not as within'
  );
  assert.equal(report.breaches.length, 0, 'an unmeasured metric is its own problem, not a breach');
});

check('the tightest metric is the one with the least room left', () => {
  const report = compareBudgets({ ...fits, css_gzip: 99 }, budget);
  assert.equal(report.tightest.metric, 'css_gzip', 'expected the metric 1 byte from its ceiling');
  assert.equal(report.tightest.headroom, 1);
});

check('no measurement at all reports every metric as unmeasured, never as passing', () => {
  const report = compareBudgets({}, budget);
  assert.equal(report.unmeasured.length, METRICS.length);
  assert.equal(report.tightest, null, 'a report with nothing measured cannot name a tightest metric');
});

check('a metric that is not in the budget list is ignored rather than invented', () => {
  const report = compareBudgets({ ...fits, pyodide_wasm: 9_000_000 }, budget);
  assert.equal(report.rows.some((row) => row.metric === 'pyodide_wasm'), false);
  assert.equal(report.breaches.length, 0, 'the runtime the worker fetches is not in the shell budget');
});

console.log('\nweight measurement');

check('js, css, fonts and the largest chunk are measured from the files', () => {
  const measurement = measurementFrom([
    { name: 'assets/index-abc.js', size: 3000, gzip: 900 },
    { name: 'assets/vendor-def.js', size: 1000, gzip: 400 },
    { name: 'assets/index-abc.css', size: 200, gzip: 90 },
    { name: 'assets/inter-latin.woff2', size: 450, gzip: 450 },
    { name: 'index.html', size: 500, gzip: 60 },
  ]);
  assert.equal(measurement.js_gzip, 1300, 'expected every .js summed');
  assert.equal(measurement.css_gzip, 90);
  assert.equal(measurement.fonts, 450, 'expected the font counted at its own size, not gzipped twice');
  assert.equal(measurement.largest_js_gzip, 900, 'expected the biggest chunk, not the sum');
  assert.equal(measurement.total, 1900, 'expected everything measured to be in the total');
});

check('a bundle with no js does not invent a largest chunk', () => {
  const measurement = measurementFrom([{ name: 'assets/index.css', size: 200, gzip: 90 }]);
  assert.equal(measurement.largest_js_gzip, 0);
  assert.equal(measurement.total, 90);
});

check('sizes read as sizes, and headroom as a signed share', () => {
  assert.equal(formatBytes(456), '456 B');
  assert.equal(formatBytes(45_678), '45.7 kB');
  assert.equal(formatBytes(1_234_567), '1.23 MB');
  assert.equal(formatHeadroom(1040, 1000), '+4%');
  assert.equal(formatHeadroom(960, 1000), '-4%');
  assert.equal(formatUsed(920, 1000), '92%');
  assert.equal(formatUsed(1100, 1000), '110%');
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exitCode = 1;
