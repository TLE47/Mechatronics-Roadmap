#!/usr/bin/env node
/**
 * The run trace: what a payload is allowed to become (`scripts/test_trace.mjs`, `npm run test:trace`)
 *
 * The recording itself is Python's own `settrace`, driven in a browser by `npm run test:e2e` step 5h.
 * What is pinned here is the boundary: the trace arrives from another thread as JSON, so every field
 * is untrusted, and the three ways a replay panel can lie are all cheap to produce by hand —
 *
 * 1. **A step that is not a line** (a missing `line`, a `NaN`) must be dropped, not drawn at line 1.
 * 2. **A cap that is claimed but not kept** — a payload promising 12,431 steps and handing over 400
 *    must say `300 of 12,431`, and a payload whose total is *smaller* than its steps must not print
 *    "300 of 12" either: the total is raised to the truth rather than the steps cut down to a lie.
 * 3. **A value nobody could read** — 40 kB of repr, or forty names — is cut to what the panel can
 *    draw, so a hand-made fragment cannot turn the page into a wall.
 *
 * Run: node --experimental-strip-types scripts/test_trace.mjs
 */

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  TRACE_NAME_CAP,
  TRACE_STEP_CAP,
  TRACE_VALUE_CHARS,
  clampStep,
  depthLabel,
  moveStep,
  readTrace,
  sourceLine,
  stepLabel,
  traceSummary,
} from '../app/src/runTrace.ts';

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

/** A payload shaped the way the worker writes it. */
function payload(steps, total = steps.length) {
  return { steps, total };
}

const stepAt = (line, extra = {}) => ({ line, fn: 'triple', depth: 1, values: [], ...extra });

console.log('run trace');

check('nothing to replay reads as no trace', () => {
  assert.equal(readTrace(null), null);
  assert.equal(readTrace(undefined), null);
  assert.equal(readTrace(''), null);
  assert.equal(readTrace('{not json'), null);
  assert.equal(readTrace({ steps: [] }), null);
  assert.equal(readTrace({ steps: 'nope' }), null);
});

check('the JSON string the worker actually posts is accepted', () => {
  const trace = readTrace(JSON.stringify(payload([stepAt(1, { fn: '<module>' })])));
  assert.ok(trace, 'a JSON string must parse into a trace');
  assert.equal(trace.steps.length, 1);
  assert.equal(trace.steps[0].index, 1);
});

check('steps are numbered from 1 and default their fields honestly', () => {
  const trace = readTrace(
    payload([
      { line: '3' },
      { line: 4, fn: '', depth: 0 },
      { line: 9, fn: 'solve', depth: '2' },
    ])
  );
  assert.deepEqual(
    trace.steps.map((step) => step.index),
    [1, 2, 3]
  );
  assert.equal(trace.steps[0].fn, '<module>', 'a missing name is top level, not blank');
  assert.equal(trace.steps[0].depth, 1);
  assert.equal(trace.steps[1].depth, 1, 'a zero depth is still the outermost frame');
  assert.equal(trace.steps[2].depth, 2, 'a numeric string is a depth');
});

check('a step with no line is dropped, not drawn', () => {
  const trace = readTrace(payload([{ line: null }, { line: 0 }, stepAt(5), { line: 'x' }]));
  assert.equal(trace.steps.length, 1);
  assert.equal(trace.steps[0].line, 5, 'the one real line keeps its number');
});

check('values are cut to the width the panel draws, and to the count it draws', () => {
  const chatty = Array.from({ length: TRACE_NAME_CAP + 4 }, (_, index) => ({
    name: `v${index}`,
    value: 'x'.repeat(TRACE_VALUE_CHARS + 20),
  }));
  const trace = readTrace(payload([stepAt(1, { values: chatty })]));
  assert.equal(trace.steps[0].values.length, TRACE_NAME_CAP, 'six names, not a frame dump');
  for (const value of trace.steps[0].values) {
    assert.equal(value.value.length, TRACE_VALUE_CHARS, 'a value is cut, not wrapped');
  }
});

check('a value that is not a pair is skipped, not printed as undefined', () => {
  const trace = readTrace(
    payload([
      stepAt(1, {
        values: [{ name: 'a', value: '1' }, { name: '', value: '2' }, 'nope', { value: '3' }, null],
      }),
    ])
  );
  assert.deepEqual(trace.steps[0].values, [{ name: 'a', value: '1' }]);
});

check('the cap is kept and printed, not silently applied', () => {
  const many = Array.from({ length: TRACE_STEP_CAP + 100 }, (_, index) => stepAt(index + 1));
  const trace = readTrace(payload(many, 12431));
  assert.equal(trace.steps.length, TRACE_STEP_CAP);
  assert.equal(trace.total, 12431);
  assert.equal(trace.truncated, true);
  assert.equal(traceSummary(trace), `${TRACE_STEP_CAP} of 12,431 steps · capped`);
});

check('a total smaller than the steps is raised, never used to cut them', () => {
  const trace = readTrace(payload([stepAt(1), stepAt(2), stepAt(3)], 1));
  assert.equal(trace.total, 3);
  assert.equal(trace.truncated, false);
});

check('an untruncated trace reads as a plain count', () => {
  assert.equal(traceSummary(readTrace(payload([stepAt(1)]))), '1 step');
  assert.equal(traceSummary(readTrace(payload([stepAt(1), stepAt(2)]))), '2 steps');
});

check('the step label says where the learner is, in words', () => {
  const trace = readTrace(payload([stepAt(3), stepAt(7), stepAt(9)]));
  assert.equal(stepLabel(trace, 0), 'step 1 of 3 · line 3 · triple');
  assert.equal(stepLabel(trace, 2), 'step 3 of 3 · line 9 · triple');
  assert.equal(stepLabel(trace, 99), 'step 3 of 3 · line 9 · triple', 'out of range clamps');
});

check('stepping clamps at both ends, even with a nonsense index', () => {
  const trace = readTrace(payload([stepAt(1), stepAt(2), stepAt(3)]));
  assert.equal(clampStep(trace, -5), 0);
  assert.equal(clampStep(trace, 2.7), 2, 'a slider value is truncated, never rounded up a step');
  assert.equal(clampStep(trace, Number.NaN), 0);
  assert.equal(clampStep(trace, Number.POSITIVE_INFINITY), 0);
  assert.equal(moveStep(trace, 0, -1), 0);
  assert.equal(moveStep(trace, 2, 1), 2);
  assert.equal(moveStep(trace, 1, 1), 2);
});

check('the quoted line is the program text, trimmed, and empty past the end', () => {
  const text = 'x = 1\n    total = total + n\nprint(total)\n';
  assert.equal(sourceLine(text, 1), 'x = 1');
  assert.equal(sourceLine(text, 2), 'total = total + n', 'indentation does not reach the quote');
  assert.equal(sourceLine(text, 3), 'print(total)');
  assert.equal(sourceLine(text, 4), '', 'the trailing newline is a blank line, not the last line');
  assert.equal(sourceLine(text, 9), '', 'a line past the end is blank, not the last line');
});

check('the worker that records the trace still parses', () => {
  // The Python harness is one long JS template literal, and a backtick inside a Python comment ends
  // it early: the worker then fails to parse, Pyodide never reports `ready`, and every run in the
  // product hangs with nothing on screen to say why. That is exactly what happened while this
  // feature was being written, so the parse is a gate rather than a habit.
  const worker = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    '..',
    'app',
    'src',
    'runtime',
    'pythonWorker.js'
  );
  execFileSync(process.execPath, ['--check', worker], { stdio: 'pipe' });
  const source = fs.readFileSync(worker, 'utf-8');
  const harness = /const runnerHarness = `([\s\S]*?)`;/.exec(source);
  assert.ok(harness, 'the runner harness must still be one template literal under that name');
  assert.equal(
    harness[1].includes('${'),
    false,
    'the harness is a plain literal: a `${` inside it would interpolate a JS value into Python'
  );
});

check('depth reads as words, so the panel never prints a bare number', () => {
  assert.equal(depthLabel(1), 'top level');
  assert.equal(depthLabel(0), 'top level');
  assert.equal(depthLabel(3), 'call depth 3');
});

console.log(`run trace: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exitCode = 1;
