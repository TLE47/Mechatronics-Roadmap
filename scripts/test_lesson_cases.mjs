#!/usr/bin/env node
/**
 * The cases a lesson's behavioural checks substitute (`scripts/test_lesson_cases.mjs`).
 *
 * The instructor tests are one program of sequential assertions: it stops at the first failed one.
 * That gives the case list a shape the runner relies on, and this suite pins it:
 *
 * 1. **A pass proves every case.** Nothing is left unchecked after a green run.
 * 2. **A failure proves the ones before it and blames the one whose own numbers it quotes.** A case
 *    is never blamed merely for being first.
 * 3. **No attribution means no claim.** When the message names no case, the list says so rather
 *    than inventing a culprit.
 * 4. **The summary is the panel's one line,** so it always agrees with the rows underneath.
 *
 * Run: node --experimental-strip-types scripts/test_lesson_cases.mjs
 */

import assert from 'node:assert/strict';
import {
  CASE_STATE_LABEL,
  caseSummary,
  caseValues,
  lessonCases,
} from '../app/src/lessonCases.ts';

let passed = 0;
let failed = 0;

function check(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`  ok   ${name}`);
  } catch (error) {
    failed += 1;
    console.error(`  FAIL ${name}`);
    console.error(`       ${error.message}`);
  }
}

const lesson = {
  instructorTestSummary: [
    'From encoder_ticks=400, a 25 tick advance reaches 425',
    'From encoder_ticks=1000, a 25 tick advance reaches 1025',
    'From battery_level=24.0, a 0.45 V drop reaches 23.55',
  ],
};

console.log('\nlesson cases');

check('a case carries the numbers its sentence substitutes, once each', () => {
  assert.deepEqual(caseValues(lesson.instructorTestSummary[0]), ['400', '25', '425']);
  assert.deepEqual(caseValues('no numbers here'), []);
  assert.deepEqual(caseValues('0 and 0.0 are the same reading'), ['0', '0.0']);
});

check('no run leaves every case untested', () => {
  const cases = lessonCases(lesson, { passStatus: 'untested', instructorError: '' });
  assert.deepEqual(
    cases.map((entry) => entry.state),
    ['untested', 'untested', 'untested']
  );
  assert.equal(caseSummary(cases), '3 cases · not run yet');
});

check('a pass proves every case', () => {
  const cases = lessonCases(lesson, { passStatus: 'passed', instructorError: '' });
  assert.deepEqual(
    cases.map((entry) => entry.state),
    ['passed', 'passed', 'passed']
  );
  assert.equal(caseSummary(cases), '3 cases · all passed');
});

check('a failure proves the cases before it and blames the one its numbers name', () => {
  const cases = lessonCases(lesson, {
    passStatus: 'behavior_failed',
    instructorError: 'AssertionError: Relative update from encoder_ticks=1000 should yield 1025',
  });
  assert.deepEqual(
    cases.map((entry) => entry.state),
    ['passed', 'failed', 'unchecked'],
    'the first case ran, the second broke, the third was never reached'
  );
  assert.equal(caseSummary(cases), '3 cases · 1 failed · 1 passed');
});

check('a failure that names no case blames none of them', () => {
  const cases = lessonCases(lesson, {
    passStatus: 'behavior_failed',
    instructorError: 'AssertionError: step_position must be a callable function',
  });
  assert.deepEqual(
    cases.map((entry) => entry.state),
    ['unchecked', 'unchecked', 'unchecked'],
    'a wrong attribution is worse than saying the case is unknown'
  );
});

check('a presentation failure leaves the behavioural cases untested', () => {
  const cases = lessonCases(lesson, {
    passStatus: 'mismatch',
    instructorError: '',
  });
  assert.deepEqual(
    cases.map((entry) => entry.state),
    ['untested', 'untested', 'untested']
  );
});

check('a lesson with no summary has no cases, and the summary says so', () => {
  const cases = lessonCases({ instructorTestSummary: [] }, { passStatus: 'passed', instructorError: '' });
  assert.deepEqual(cases, []);
  assert.equal(caseSummary(cases), 'No cases');
});

check('every state has a word for its row', () => {
  assert.deepEqual(CASE_STATE_LABEL, {
    passed: 'Passed',
    failed: 'Failed',
    unchecked: 'Not checked',
    untested: 'Not run',
  });
});

console.log(`\nlesson cases: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
