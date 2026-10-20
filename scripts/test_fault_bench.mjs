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
import fs from 'node:fs';
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
  FAULT_BENCH_HARNESS,
  FAULT_BENCH_PY,
  FAULT_BENCH_TARGETS,
  countRepaired,
  formatRepairMetric,
  parseBenchReport,
  repairVerdict,
} from '../app/src/faultBenchGrading.ts';
import {
  formatHarnessMetric,
  formatHarnessTarget,
  harnessGate,
  unitVerdict,
} from '../app/src/harnessGrading.ts';
import { harnessForLesson, harnessSourceForLesson } from '../app/src/lessonHarnesses.ts';
import { T3_HARNESS, T3_HARNESS_PY, T3_TARGETS } from '../app/src/capstoneBudgets.ts';

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

check('the lesson pass condition is the bench: a 10%-short repair cannot verify it', () => {
  const halfFixed = { ...REPAIRED_REPORT, offset: { value: 1.2, error: '' } };
  const gate = harnessGate(FAULT_BENCH_HARNESS, halfFixed);
  assert.equal(gate.passed, false, 'a 1.2 mm repair must not pass the capstone');
  assert.equal(gate.met, 3, 'three units are at target');
  assert.equal(gate.total, 4, 'the capstone grades four units');
  assert.equal(gate.failures.length, 1, 'only the short repair is named');
  assert.match(gate.failures[0], /encoder zero offset/, 'the failure must name the unit');
  assert.match(gate.failures[0], /1\.20 mm/, 'the failure must keep the real metric');
  assert.match(gate.failures[0], /1\.00 mm/, 'the failure must state the target');
  assert.match(gate.summary, /3 \/ 4 graded metrics at target/, 'the summary counts what passed');
});

check('a solved report is the only one that passes the lesson', () => {
  const gate = harnessGate(FAULT_BENCH_HARNESS, REPAIRED_REPORT);
  assert.equal(gate.passed, true, 'four at-target repairs must pass');
  assert.deepEqual(gate.failures, [], 'a passing gate names no failures');
  assert.equal(harnessGate(FAULT_BENCH_HARNESS, BROKEN_REPORT).passed, false, 'the starter must not pass the capstone');
  assert.equal(harnessGate(FAULT_BENCH_HARNESS, BROKEN_REPORT).met, 0, 'the starter fixes nothing');
});

check('a call that raises fails the gate by name, and so does a missing report', () => {
  const failedReport = { ...REPAIRED_REPORT, cpr: { value: null, error: 'NameError: nope' } };
  const gate = harnessGate(FAULT_BENCH_HARNESS, failedReport);
  assert.equal(gate.passed, false, 'a failed call must not pass the lesson');
  assert.match(gate.failures[0], /encoder CPR scale: call failed — NameError: nope/);
  const missing = harnessGate(FAULT_BENCH_HARNESS, null);
  assert.equal(missing.passed, false, 'an unrun bench is unproven, not a pass');
  assert.equal(missing.met, 0);
});

check('the registry sends a harness for the capstones and for no other lesson', () => {
  assert.equal(FAULT_BENCH_HARNESS.lessonId, '08.1');
  assert.equal(harnessSourceForLesson('08.1'), FAULT_BENCH_PY, '08.1 must send the bench');
  assert.equal(
    harnessSourceForLesson('EX.08-capstones.T3.07a'),
    T3_HARNESS_PY,
    'the Tier 3 capstone must send its own bench'
  );
  assert.equal(harnessSourceForLesson('05.1'), '', 'a non-capstone lesson must not run a harness');
  assert.equal(harnessForLesson('05.1'), null, 'a lesson without a harness has no gate');
  assert.equal(harnessForLesson('08.1')?.units.length, 4, '08.1 grades four units');
});

// --- the Tier 3 capstone's own bench ------------------------------------------------

const T3_SOLVED = {
  budget: { value: 0.4674235, error: '' },
  margin: { value: 47.8304, error: '' },
  allowance: { value: 1.4544, error: '' },
  signoff: { value: 2, error: '' },
};

check('the Tier 3 capstone grades four units with their own directions', () => {
  assert.deepEqual(
    T3_HARNESS.units.map((u) => [u.key, u.direction, u.target]),
    [
      ['budget', 'atMost', T3_TARGETS.budgetMm],
      ['margin', 'atLeast', T3_TARGETS.marginDeg],
      ['allowance', 'atLeast', T3_TARGETS.chainMs],
      ['signoff', 'atLeast', T3_TARGETS.signoffAgreements],
    ],
    'a budget is met under its target and a margin above it'
  );
  assert.equal(harnessGate(T3_HARNESS, T3_SOLVED).passed, true, 'the intended solution passes');
});

check('a doubled zero-order hold keeps the margin it really has and fails the lesson', () => {
  // 30 + 210 + 350 + 90 + a full 1000 us tick = 1680 us; 60 - 180*0.00168*180/pi = 42.67 deg.
  const zohDoubled = { ...T3_SOLVED, margin: { value: 42.6734, error: '' } };
  const gate = harnessGate(T3_HARNESS, zohDoubled);
  assert.equal(gate.passed, false, 'an eroded margin must not verify the capstone');
  assert.equal(gate.met, 3, 'only the margin misses; the budget, allowance and sign-off still pass');
  assert.match(gate.failures[0], /net phase margin: 42\.7 deg \(target ≥ 45\.0 deg\)/);
});

check('the budget and the sign-off each fail on their own side of the line', () => {
  const overBudget = { ...T3_SOLVED, budget: { value: 0.951, error: '' } };
  assert.match(
    harnessGate(T3_HARNESS, overBudget).failures[0],
    /3σ spatial budget: 0\.95 mm \(target ≤ 0\.50 mm\)/,
    'a 0.95 mm budget must read as off target, not as a pass'
  );
  const fourOfFive = { ...T3_SOLVED, signoff: { value: 1, error: '' } };
  assert.match(
    harnessGate(T3_HARNESS, fourOfFive).failures[0],
    /sign-off verdicts correct: 1 of 2 \(target ≥ 2 of 2\)/,
    'four of five domains must not count as a sign-off'
  );
  assert.equal(harnessGate(T3_HARNESS, { ...T3_SOLVED, signoff: { value: null, error: 'TypeError: bool' } }).passed, false);
});

check('a harness unit prints its own unit and target phrase', () => {
  const margin = T3_HARNESS.units.find((u) => u.key === 'margin');
  assert.ok(margin, 'the Tier 3 harness must declare a margin unit');
  assert.equal(formatHarnessMetric(42.6734, margin), '42.7 deg');
  assert.equal(formatHarnessTarget(margin), 'target ≥ 45.0 deg');
  const budget = T3_HARNESS.units.find((u) => u.key === 'budget');
  assert.equal(formatHarnessTarget(budget), 'target ≤ 0.50 mm');
  assert.equal(unitVerdict(budget, undefined), 'unrun');
  assert.equal(unitVerdict(budget, { value: null, error: 'x' }), 'error');
  const antiWindup = FAULT_BENCH_HARNESS.units.find((u) => u.key === 'antiWindup');
  assert.equal(formatHarnessMetric(37.1858, antiWindup), '37.2%', 'percent has no space before the sign');
});

check('the Tier 3 harness calls the learner\'s functions on inputs the page never shows', () => {
  for (const name of [
    'error_budget_3sigma',
    'total_latency_s',
    'net_phase_margin_deg',
    'max_allowable_delay_ms',
    'capstone_signoff',
  ]) {
    assert.ok(T3_HARNESS_PY.includes(name), `harness must call ${name}`);
  }
  const moduleText = fs.readFileSync('modules/08-capstones.T3.07a.md', 'utf8');
  assert.ok(
    !moduleText.includes('0.02, -0.03, 0.05') && !moduleText.includes('0.04, 0.07, 0.02, 0.09'),
    'the bench inputs must not be the module\'s worked example, so a printed number cannot pass'
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
