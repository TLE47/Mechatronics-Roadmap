#!/usr/bin/env node
/**
 * A failing check names its own hint (`scripts/test_check_hints.mjs`, `npm run test:checkhints`).
 *
 * `app/src/checkHints.ts` is the join between the two graded checks and the lesson's hint ladder:
 * which check failed, the line that says so, and the one rung that answers it. The cases that matter
 * are the ones a run actually produces - an assertion message, a traceback whose last line is the
 * exception, a bare mismatch line number, and a ladder that must not be handed out whole.
 *
 * Run: node --experimental-strip-types scripts/test_check_hints.mjs
 */

import assert from 'node:assert/strict';
import {
  assertionLine,
  failingChecks,
  hintForCheck,
  hintLock,
  nextRung,
  rungAnswersCheck,
} from '../app/src/checkHints.ts';
import { PYTHON_LESSONS } from '../app/src/data/pythonLessonsData.ts';

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

const failing = (overrides = {}) =>
  failingChecks({
    passStatus: 'untested',
    instructorError: '',
    firstDiffLine: null,
    hintCount: 2,
    ...overrides,
  });

console.log('check-linked hints');

check('a failed behavioural check carries the assertion sentence, prefix stripped', () => {
  const [behaviour] = failing({
    passStatus: 'behavior_failed',
    instructorError: 'AssertionError: Expected encoder_ticks=425 (int), got 0',
  });
  assert.equal(behaviour.id, 'behaviour');
  assert.equal(behaviour.detail, 'Expected encoder_ticks=425 (int), got 0');
  assert.equal(behaviour.hint, 1, 'the nudge is the rung a failure may open');
});

check('a traceback reports its exception line, not a file frame', () => {
  const [behaviour] = failing({
    passStatus: 'behavior_failed',
    instructorError:
      'Traceback (most recent call last):\n  File "<instructor_test>", line 4, in <module>\nAssertionError: expected 1024 counts to be a quarter turn',
  });
  assert.equal(behaviour.detail, 'expected 1024 counts to be a quarter turn');
});

check('a silent worker still says what the check tested', () => {
  const [behaviour] = failing({ passStatus: 'behavior_failed', instructorError: '' });
  assert.match(behaviour.detail, /instructor tests ran your functions/);
  assert.equal(
    assertionLine(''),
    '',
    'the card owns the fallback wording; the helper must not invent one'
  );
});

check('a presentation failure names the output line that differs', () => {
  const [presentation] = failing({ passStatus: 'mismatch', firstDiffLine: 3 });
  assert.equal(presentation.id, 'presentation');
  assert.match(presentation.detail, /line 3/);
  assert.equal(presentation.hint, 1);
});

check('both checks report together when both are red', () => {
  const checks = failing({
    passStatus: 'behavior_failed',
    instructorError: 'AssertionError: wrong',
    firstDiffLine: 2,
  });
  // The behavioural verdict outranks presentation in the runner, so only it is reported here - a
  // mismatch line is not a second failure while behaviour has not been proven.
  assert.deepEqual(checks.map((one) => one.id), ['behaviour']);
});

check('a passing, stopped or errored run opens no check card', () => {
  for (const passStatus of ['passed', 'untested', 'error', 'stopped', 'harness_failed']) {
    assert.deepEqual(failing({ passStatus, instructorError: 'boom' }), [], passStatus);
  }
});

check('a lesson without a ladder says so instead of naming a rung', () => {
  const [behaviour] = failing({
    passStatus: 'behavior_failed',
    instructorError: 'AssertionError: x',
    hintCount: 0,
  });
  assert.equal(behaviour.hint, 0);
  assert.match(behaviour.why, /No hint ladder/);
  assert.equal(hintForCheck(0), 0);
});

check('rung 1 needs nothing: it is a nudge, and may be read before running', () => {
  assert.equal(hintLock({ revealed: 0, hintCount: 2, attempts: 0, openedAt: null }), 'none');
});

check('rung 2 waits for a run', () => {
  assert.equal(hintLock({ revealed: 1, hintCount: 2, attempts: 0, openedAt: null }), 'no-attempt');
  assert.equal(hintLock({ revealed: 1, hintCount: 2, attempts: 1, openedAt: null }), 'none');
});

check('rung 2 is earned by a run after the nudge, not by the run already on screen', () => {
  // Hint 1 was opened after the second attempt; the same two attempts are not a new try.
  assert.equal(
    hintLock({ revealed: 1, hintCount: 2, attempts: 2, openedAt: 2 }),
    'stale-attempt'
  );
  assert.equal(hintLock({ revealed: 1, hintCount: 2, attempts: 3, openedAt: 2 }), 'none');
});

check('opening the nudge before any run still unlocks rung 2 with the first one', () => {
  assert.equal(hintLock({ revealed: 1, hintCount: 2, attempts: 1, openedAt: 0 }), 'none');
});

check('a fully revealed ladder has nothing left to lock', () => {
  assert.equal(hintLock({ revealed: 2, hintCount: 2, attempts: 0, openedAt: 1 }), 'none');
});

check('the next rung never exceeds the ladder', () => {
  assert.equal(nextRung({ revealed: 0, hintCount: 2, attempts: 0, openedAt: null }), 1);
  assert.equal(nextRung({ revealed: 1, hintCount: 2, attempts: 0, openedAt: null }), 2);
  assert.equal(nextRung({ revealed: 2, hintCount: 2, attempts: 0, openedAt: null }), 2);
  assert.equal(nextRung({ revealed: 0, hintCount: 0, attempts: 0, openedAt: null }), 0);
});

check('only the rung a check named is marked as answering it', () => {
  const [behaviour] = failing({
    passStatus: 'behavior_failed',
    instructorError: 'AssertionError: x',
  });
  assert.equal(rungAnswersCheck(1, [behaviour]), true);
  assert.equal(rungAnswersCheck(2, [behaviour]), false);
  assert.equal(rungAnswersCheck(1, []), false, 'a fresh lesson marks no rung');
});

check('every real lesson can be pointed at the rung it names', () => {
  assert.ok(PYTHON_LESSONS.length > 40, 'the registry is loaded, not an empty list');
  for (const lesson of PYTHON_LESSONS) {
    const hintCount = lesson.hints.length;
    assert.ok(hintCount >= 1, `${lesson.id} carries no hints`);
    const checks = failingChecks({
      passStatus: 'behavior_failed',
      instructorError: 'AssertionError: x',
      firstDiffLine: null,
      hintCount,
    });
    assert.equal(checks.length, 1, `${lesson.id} must report its behavioural check`);
    const hint = checks[0].hint;
    assert.ok(hint >= 1 && hint <= hintCount, `${lesson.id} points at rung ${hint} of ${hintCount}`);
    // The rung a check names is the nudge, so the near-solution stays closed however the check fails.
    assert.equal(hint, 1, `${lesson.id} must name rung 1, not the formula block`);
  }
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
