#!/usr/bin/env node
/**
 * Python's failure, read back (`scripts/test_traceback.mjs`, `npm run test:traceback`).
 *
 * `app/src/traceback.ts` turns the text the worker hands the runner into the line a learner can act
 * on, and `app/src/errorIndex.ts` joins it to the page's own entry. Both are pure, and both are the
 * kind of code that is wrong in ways a screenshot cannot show: a frame taken from the lesson's
 * appended self-check, a chained failure reported from the wrong block, a `SyntaxError` that arrives
 * without frames at all, a confident match on an exception class the page only mentions in passing.
 *
 * The index data is generated from `docs/ERROR_EXPLAINER.md` (`scripts/generate_error_index.py
 * --check` is the drift gate); what this suite pins is the *shape* the runner relies on — every entry
 * numbered, every one with the page's three labels — and that a heading which is not an exception
 * never claims a traceback.
 *
 * Run: node --experimental-strip-types scripts/test_traceback.mjs
 */

import assert from 'node:assert/strict';
import {
  HARNESS_FUNCTIONS,
  failureSummary,
  isAssertionFailure,
  parseFailure,
} from '../app/src/traceback.ts';
import { ERROR_INDEX, MATCHABLE_ENTRIES, matchError } from '../app/src/errorIndex.ts';

let passed = 0;
let failed = 0;

function section(title) {
  console.log(title);
}

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

const nameError = `Traceback (most recent call last):
  File "<lesson_editor>", line 3, in <module>
    print(kp * 2)
          ^^
NameError: name 'kp' is not defined`;

const multiFrame = `Traceback (most recent call last):
  File "<lesson_editor>", line 12, in <module>
    print(solve(1.0))
  File "<lesson_editor>", line 7, in solve
    return total / n
ZeroDivisionError: division by zero`;

const chained = `Traceback (most recent call last):
  File "<lesson_editor>", line 4, in <module>
    value = int("nope")
ValueError: invalid literal for int() with base 10: 'nope'

During handling of the above exception, another exception occurred:

Traceback (most recent call last):
  File "<lesson_editor>", line 6, in <module>
    raise RuntimeError("retry later") from None
RuntimeError: retry later`;

const harnessOnly = `Traceback (most recent call last):
  File "<lesson_editor>", line 30, in <module>
    _selfcheck()
  File "<lesson_editor>", line 22, in _selfcheck
    assert steps_to_target(0.0, 0.5, 0.25, 1.0) == 8
AssertionError: eight ticks`;

const harnessCallingLearner = `Traceback (most recent call last):
  File "<lesson_editor>", line 30, in <module>
    _selfcheck()
  File "<lesson_editor>", line 22, in _selfcheck
    assert safe_divide(1.0, 0.0) == (None, "ZeroDivisionError")
  File "<lesson_editor>", line 9, in safe_divide
    return numerator / denominator
ZeroDivisionError: division by zero`;

section('frames');

check('a failing print names the module frame and the exception', () => {
  const failure = parseFailure(nameError);
  assert.equal(failure.exception.type, 'NameError');
  assert.equal(failure.exception.message, "name 'kp' is not defined");
  assert.equal(failure.summary, "NameError: name 'kp' is not defined");
  assert.equal(failure.frame.line, 3, 'the line that raised must be the line named');
  assert.equal(failure.frame.name, '<module>');
  assert.equal(failure.frame.source, 'print(kp * 2)', 'the printed source line travels with the frame');
  assert.equal(failure.frames.length, 1);
  assert.equal(failure.syntax, false);
  assert.equal(failure.raisedByCheck, false);
});

check('a failure inside a function reports that function, not the caller', () => {
  const failure = parseFailure(multiFrame);
  assert.equal(failure.frames.length, 2);
  assert.equal(failure.frame.line, 7);
  assert.equal(failure.frame.name, 'solve');
  assert.equal(failure.exception.type, 'ZeroDivisionError');
});

check('a chained failure reports the last block, which is the one that stopped the program', () => {
  const failure = parseFailure(chained);
  assert.equal(failure.exception.type, 'RuntimeError');
  assert.equal(failure.summary, 'RuntimeError: retry later');
  assert.equal(failure.frame.line, 6, 'the frames come from the same block as the exception');
});

check('the appended self-check raising means there is no learner line to point at', () => {
  const failure = parseFailure(harnessOnly);
  assert.equal(failure.raisedByCheck, true, 'the deepest frame is harness code');
  assert.equal(failure.frame, null, 'the frame above it is the harness call, not the learner’s line');
  assert.equal(failure.exception.type, 'AssertionError');
});

check('the self-check calling the learner’s failing function still names the learner’s line', () => {
  const failure = parseFailure(harnessCallingLearner);
  assert.equal(failure.raisedByCheck, false, 'the deepest frame is the learner’s');
  assert.equal(failure.frame.line, 9);
  assert.equal(failure.frame.name, 'safe_divide');
});

check('a harness list can be handed in rather than assumed', () => {
  const custom = multiFrame.replace('solve', 'helper').replaceAll('solve', 'helper');
  const failure = parseFailure(custom, { harnessFunctions: ['helper'] });
  assert.equal(failure.raisedByCheck, true);
  assert.equal(failure.frame, null);
  assert.deepEqual(HARNESS_FUNCTIONS, ['_selfcheck'], 'the default is the appended check and nothing else');
});

section('syntax');

check('the worker’s own syntax shape has no frames and still names the line', () => {
  const failure = parseFailure('SyntaxError (line 4): invalid syntax');
  assert.equal(failure.syntax, true);
  assert.equal(failure.exception.type, 'SyntaxError');
  assert.equal(failure.frame.line, 4);
  assert.equal(failure.summary, 'SyntaxError: invalid syntax');
});

check('a real CPython SyntaxError keeps its frame and does not take the caret as source', () => {
  const failure = parseFailure(`  File "<lesson_editor>", line 2
    x =
       ^
SyntaxError: invalid syntax`);
  assert.equal(failure.syntax, true);
  assert.equal(failure.frame.line, 2);
  assert.equal(failure.frame.source, 'x =', 'the caret marker is not a second source line');
});

check('an IndentationError is syntax too, and says so', () => {
  const failure = parseFailure(`  File "<lesson_editor>", line 6
    return x
    ^
IndentationError: unexpected indent`);
  assert.equal(failure.syntax, true);
  assert.equal(failure.exception.type, 'IndentationError');
});

section('what is not a traceback');

check('a stopped run, a blank string and a passing line are not failures', () => {
  assert.equal(parseFailure('Execution stopped by user. The interpreter kept your session; nothing was reloaded.'), null);
  assert.equal(parseFailure(''), null);
  assert.equal(parseFailure('   \n  '), null);
  assert.equal(parseFailure('SELF-CHECK PASS: 4 checks - the position update'), null);
});

check('captured stderr above the traceback does not become the exception', () => {
  const failure = parseFailure(`a warning from the program\n${nameError}`);
  assert.equal(failure.exception.type, 'NameError');
  assert.equal(failure.frame.line, 3);
});

check('Windows line endings parse the same as Unix ones', () => {
  const failure = parseFailure(nameError.replace(/\n/g, '\r\n'));
  assert.equal(failure.frame.line, 3);
  assert.equal(failure.exception.type, 'NameError');
});

check('the one-line summary is what a log records', () => {
  assert.equal(failureSummary(multiFrame), 'ZeroDivisionError: division by zero');
  assert.equal(failureSummary('Execution stopped by user.'), '');
});

check('an assertion is recognised by its class, not by what the text starts with', () => {
  // The regression this pins: the runner used `stderr.startsWith('AssertionError')`, which stopped
  // being true when the worker began sending the whole traceback - and a capstone whose appended
  // self-check fired then reported a plain runtime error instead of a failed bench.
  assert.equal(isAssertionFailure(harnessOnly), true, 'a traceback ending in AssertionError is one');
  assert.equal(isAssertionFailure('AssertionError: expected 8 ticks'), true, 'the bare message still is');
  assert.equal(isAssertionFailure(nameError), false, 'a NameError traceback is not an assertion');
  assert.equal(isAssertionFailure(''), false);
  assert.equal(isAssertionFailure('Execution stopped by user.'), false);
});

check('an assertion message without a traceback is still readable as an exception', () => {
  const failure = parseFailure('AssertionError: expected 8 ticks, got 9');
  assert.equal(failure.exception.type, 'AssertionError');
  assert.equal(failure.frames.length, 0);
  assert.equal(failure.frame, null);
});

section('the index');

check('every entry carries the page’s three labels and its numbering', () => {
  assert.ok(ERROR_INDEX.length >= 15, `the page has fifteen entries; the data has ${ERROR_INDEX.length}`);
  assert.deepEqual(
    ERROR_INDEX.map((entry) => entry.number),
    ERROR_INDEX.map((_, index) => index + 1),
    'entries are numbered 1..n with no gap, the same rule the page is held to'
  );
  for (const entry of ERROR_INDEX) {
    assert.ok(entry.title.length > 8, `entry ${entry.number} needs a symptom for its heading`);
    assert.ok(entry.means.length > 20, `entry ${entry.number} needs its one sentence`);
    assert.ok(entry.checks.length >= 2, `entry ${entry.number} needs at least two checks`);
    assert.ok(entry.source.path, `entry ${entry.number} must cite the page that teaches it`);
  }
});

check('a heading that is not an exception never claims a traceback', () => {
  for (const entry of ERROR_INDEX) {
    if (!entry.match) continue;
    assert.ok(
      entry.title.toLowerCase().includes(entry.match.exception.toLowerCase()),
      `entry ${entry.number} matches ${entry.match.exception} but its heading does not name it`
    );
    if (entry.match.pattern) {
      assert.ok(
        entry.title.toLowerCase().includes(entry.match.pattern.toLowerCase()),
        `entry ${entry.number} matches on a message its heading does not quote`
      );
    }
  }
  assert.ok(
    ERROR_INDEX.length > MATCHABLE_ENTRIES.length,
    'the page is mostly failures no traceback can name, which is why the card needs a "not in the index" case'
  );
});

check('ZeroDivisionError matches the entry that names only the class', () => {
  const entry = matchError(parseFailure(multiFrame));
  assert.ok(entry, 'a ZeroDivisionError must match something');
  assert.equal(entry.match.exception, 'ZeroDivisionError');
  assert.equal(entry.match.pattern, null);
  assert.ok(entry.checks.length >= 2);
});

check('a TypeError matches the message the page quotes, and only that message', () => {
  const concat = parseFailure(`Traceback (most recent call last):
  File "<lesson_editor>", line 2, in <module>
    total = total + 1
TypeError: can only concatenate list (not "int") to list`);
  const matched = matchError(concat);
  assert.ok(matched, 'the page quotes this exact message');
  assert.equal(matched.number, 2);

  const other = parseFailure(`Traceback (most recent call last):
  File "<lesson_editor>", line 2, in <module>
    print(len(3))
TypeError: object of type 'int' has no len()`);
  assert.equal(
    matchError(other),
    null,
    'a different TypeError is not entry 2; a confident wrong diagnosis is worse than none'
  );
});

check('a ValueError needs its message; its class alone is not the matrix entry', () => {
  const matrix = parseFailure(`Traceback (most recent call last):
  File "<lesson_editor>", line 4, in <module>
    y = mat_vec(A, [1.0, 2.0, 3.0])
ValueError: matrix columns must match vector length`);
  assert.equal(matchError(matrix).number, 1);

  const unrelated = parseFailure(`Traceback (most recent call last):
  File "<lesson_editor>", line 4, in <module>
    value = int("x")
ValueError: invalid literal for int() with base 10: 'x'`);
  assert.equal(matchError(unrelated), null);
});

check('a NameError is honestly outside the index', () => {
  assert.equal(matchError(parseFailure(nameError)), null);
  assert.equal(matchError(null), null, 'nothing parsed means nothing claimed');
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
