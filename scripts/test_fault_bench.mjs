#!/usr/bin/env node
/**
 * The 08.1 Four-Fault Bench arithmetic, checked without a browser.
 *
 * `app/src/faultBench.ts` has no React or DOM imports, so Node can strip its types and run it:
 *   node --experimental-strip-types scripts/test_fault_bench.mjs
 *
 * Each check pins a metric the page prints: the broken value and the repaired value. If the
 * bench and the written proof ever disagree, this is the suite that says so.
 */

import assert from 'node:assert/strict';
import {
  CPR_SCALE,
  ZERO_OFFSET_RAD,
  antiWindupOvershootPct,
  cprTipErrorMm,
  fk2Link,
  gravityTipErrorMm,
  zeroOffsetCurve,
  zeroOffsetTipErrorMm,
} from '../app/src/faultBench.ts';
import {
  FAULT_BENCH_PY,
  FAULT_BENCH_TARGETS,
  countRepaired,
  formatRepairMetric,
  parseBenchReport,
  repairVerdict,
} from '../app/src/faultBenchGrading.ts';

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

function close(actual, expected, tolerance, label) {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `${label}: expected ${expected}, got ${actual} (tolerance ${tolerance})`
  );
}

console.log('08.1 four-fault bench');

check('FK at full extension is the 0.20 m tip the page uses', () => {
  const [x, y] = fk2Link(0, 0);
  close(x, 0.2, 1e-12, 'x');
  close(y, 0, 1e-12, 'y');
});

check('zero offset: 12 mm broken, 0 after the 0.06 rad correction', () => {
  close(zeroOffsetTipErrorMm(0), 12.0, 0.01, 'broken');
  close(zeroOffsetTipErrorMm(ZERO_OFFSET_RAD), 0, 1e-9, 'repaired');
  close(zeroOffsetTipErrorMm(ZERO_OFFSET_RAD / 2), 6.0, 0.01, 'half correction');
});

check('zero-offset curve covers the slider range and never rises', () => {
  const curve = zeroOffsetCurve(24);
  assert.equal(curve.length, 25, 'curve should have 25 points for 24 steps');
  assert.equal(curve[0].correctionRad, 0, 'curve starts at zero correction');
  assert.equal(curve[curve.length - 1].correctionRad, ZERO_OFFSET_RAD, 'curve ends at full correction');
  for (let i = 1; i < curve.length; i += 1) {
    assert.ok(
      curve[i].errorMm <= curve[i - 1].errorMm + 1e-9,
      `error rose between correction points ${i - 1} and ${i}`
    );
  }
});

check('CPR scale: 174 mm broken, 0 after dividing by 4', () => {
  close(cprTipErrorMm(1), 173.99, 0.05, 'broken');
  close(cprTipErrorMm(CPR_SCALE), 0, 1e-9, 'repaired');
});

check('anti-windup: 37.2% broken, below 5% repaired', () => {
  const broken = antiWindupOvershootPct(false);
  const repaired = antiWindupOvershootPct(true);
  close(broken, 37.2, 0.1, 'broken');
  assert.ok(repaired < 5, `repaired overshoot must be below 5%, got ${repaired}%`);
  assert.ok(broken > repaired * 5, 'the freeze must cut overshoot by at least 5x');
});

check('gravity sign: 31.8 mm broken, 0 after flipping the feedforward', () => {
  close(gravityTipErrorMm(false), 31.85, 0.1, 'broken');
  close(gravityTipErrorMm(true), 0, 1e-9, 'repaired');
});

const BROKEN_REPORT = {
  offset: { value: 11.9982, error: '' },
  cpr: { value: 173.9862, error: '' },
  antiWindup: { value: 37.1858, error: '' },
  gravity: { value: 31.8488, error: '' },
};

const REPAIRED_REPORT = {
  offset: { value: 0, error: '' },
  cpr: { value: 0, error: '' },
  antiWindup: { value: 4.6947, error: '' },
  gravity: { value: 0, error: '' },
};

check('a run that only returns the broken readings fixes nothing', () => {
  assert.equal(countRepaired(BROKEN_REPORT), 0, 'starter repair functions must count as zero');
  for (const key of Object.keys(FAULT_BENCH_TARGETS)) {
    assert.equal(
      repairVerdict(BROKEN_REPORT[key], FAULT_BENCH_TARGETS[key]),
      'broken',
      `${key} must stay broken at its real metric`
    );
  }
});

check('the solved repairs fix all four units', () => {
  assert.equal(countRepaired(REPAIRED_REPORT), 4, 'the solved report must count four repairs');
});

check('a repair that is 10% short keeps a real 1.2 mm and stays broken', () => {
  const halfFixed = { ...REPAIRED_REPORT, offset: { value: 1.2, error: '' } };
  assert.equal(
    repairVerdict(halfFixed.offset, FAULT_BENCH_TARGETS.offset),
    'broken',
    '1.2 mm is above the 1 mm target'
  );
  assert.equal(countRepaired(halfFixed), 3, 'only the other three units count');
});

check('a call that raises is reported, not silently passed', () => {
  const failedReport = { ...REPAIRED_REPORT, cpr: { value: null, error: 'NameError: name is not defined' } };
  assert.equal(repairVerdict(failedReport.cpr, FAULT_BENCH_TARGETS.cpr), 'error');
  assert.equal(formatRepairMetric(failedReport.cpr.value, 'mm'), '—');
  assert.equal(countRepaired(failedReport), 3, 'a failed call must not count as repaired');
  assert.equal(repairVerdict(undefined, 1), 'unrun', 'a missing report is unrun, not broken');
});

check('the worker report round-trips through its JSON string', () => {
  const parsed = parseBenchReport(JSON.stringify(REPAIRED_REPORT));
  assert.ok(parsed, 'a JSON report must parse');
  assert.equal(countRepaired(parsed), 4);
  assert.equal(parseBenchReport(''), null, 'an empty string is not a report');
  assert.equal(parseBenchReport('{'), null, 'malformed JSON is not a report');
  assert.equal(parseBenchReport({ offset: { value: 1 } }), null, 'a partial report is rejected');
  assert.equal(
    parseBenchReport({ ...REPAIRED_REPORT, cpr: { value: 'zero', error: '' } }),
    null,
    'a non-numeric metric is rejected'
  );
});

check('the Python harness calls all four learner repairs and its own FK', () => {
  for (const name of [
    'repair_encoder_offset',
    'repair_encoder_cpr',
    'repair_integral_update',
    'repair_gravity_sign',
  ]) {
    assert.ok(FAULT_BENCH_PY.includes(name), `harness must call ${name}`);
  }
  assert.ok(
    FAULT_BENCH_PY.includes('def _fk('),
    'harness must compute its own FK so a broken fk_2link cannot hide a bad repair'
  );
  assert.ok(
    !FAULT_BENCH_PY.includes('fk_2link('),
    'harness must not grade through the learner\'s own fk_2link'
  );
});

console.log(`\n${failed === 0 ? 'OK' : 'FAILED'}: ${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
