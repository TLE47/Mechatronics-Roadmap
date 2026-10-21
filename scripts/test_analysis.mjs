#!/usr/bin/env node
/**
 * The completion and lint channel, without a browser (`scripts/test_analysis.mjs`, `npm run test:analysis`).
 *
 * `app/src/analysisClient.ts` is transport plus four mapping rules, and every one of them has a wrong
 * version that looks right until a learner meets it:
 *
 * - where the inserted text starts (`math.ac` must become `math.acos`, not `acos`);
 * - which line and column Jedi is asked about (1-based line, 0-based column — off by one and the
 *   completion list belongs to the previous character);
 * - how a Jedi type reads in a completion list, and what an unknown one becomes;
 * - what counts as a drawable pyflakes note, and how it reads in a sentence.
 *
 * The transport cases are the ones that keep a run working: an analysis answer must never be mistaken
 * for a verdict, a request that is never answered must resolve (not hang), a late answer must be
 * consumed rather than resolved twice, and a dead worker must not take the editor down with it.
 *
 * Run: node --experimental-strip-types scripts/test_analysis.mjs
 */

import assert from 'node:assert/strict';
import {
  ANALYSIS_TIMEOUT_MS,
  AnalysisSession,
  asLintNotes,
  completionStart,
  completionType,
  lineColumnAt,
  noteLabel,
  sameNotes,
  toCompletionOptions,
} from '../app/src/analysisClient.ts';

let passed = 0;
let failed = 0;
const entries = [];

function section(title) {
  entries.push({ section: title });
}

function check(name, fn) {
  entries.push({ name, fn });
}

/** A session wired to a fake worker: `sent` is what the page posted. */
function fakeSession({ timeoutMs = ANALYSIS_TIMEOUT_MS } = {}) {
  const sent = [];
  const session = new AnalysisSession((message) => sent.push(message), timeoutMs);
  return { session, sent };
}

section('completion geometry');

check('a dotted name is replaced from after the dot', () => {
  // `import math\n` is 12 chars, so `math.ac` starts at 12 and the `ac` at 17: replacing from 17
  // turns `math.ac` into `math.acos` and keeps the module the learner typed.
  assert.equal(completionStart('import math\nmath.ac', 19), 17);
  assert.equal(completionStart('math.aco', 8), 5, 'the module name is kept and only `aco` is replaced');
  assert.equal(completionStart('a.b.c', 5), 4);
});

check('a bare name is replaced whole, and an empty position replaces nothing', () => {
  assert.equal(completionStart('total', 5), 0);
  assert.equal(completionStart('x = total', 9), 4);
  assert.equal(completionStart('x = ', 4), 4);
  assert.equal(completionStart('', 0), 0);
  assert.equal(completionStart('abc', 99), 0, 'a position past the end clamps, then replaces the whole word');
});

check('Jedi is asked in its own coordinates: 1-based line, 0-based column', () => {
  assert.deepEqual(lineColumnAt('import math\nmath.', 17), { line: 2, column: 5 });
  assert.deepEqual(lineColumnAt('import math\nmath.', 12), { line: 2, column: 0 });
  assert.deepEqual(lineColumnAt('abc\ndef', 4), { line: 2, column: 0 });
  assert.deepEqual(lineColumnAt('abc', 0), { line: 1, column: 0 });
  assert.deepEqual(lineColumnAt('abc', 99), { line: 1, column: 3 });
});

section('mapping');

check('Jedi types become completion-list types', () => {
  assert.equal(completionType('function'), 'function');
  assert.equal(completionType('module'), 'namespace');
  assert.equal(completionType('instance'), 'variable');
  assert.equal(completionType('statement'), 'keyword');
  assert.equal(completionType('something-new'), 'text');
});

check('an option carries its docstring first line as detail and all of it as info', () => {
  const [option] = toCompletionOptions([
    {
      name: 'acos',
      type: 'function',
      doc: 'acos(x: SupportsFloat, /) -> float\n\nReturn the arc cosine.',
    },
  ]);
  assert.equal(option.label, 'acos');
  assert.equal(option.type, 'function');
  assert.equal(option.detail, 'acos(x: SupportsFloat, /) -> float');
  assert.match(option.info, /Return the arc cosine/);
});

check('a long first line is shortened, an empty doc adds nothing, duplicates collapse', () => {
  const long = 'f(' + 'x'.repeat(120) + ')';
  const options = toCompletionOptions([
    { name: 'f', type: 'function', doc: long },
    { name: 'f', type: 'function', doc: 'second copy' },
    { name: 'g', type: 'function', doc: '' },
    { name: '', type: 'function', doc: 'nameless' },
  ]);
  assert.deepEqual(
    options.map((option) => option.label),
    ['f', 'g']
  );
  assert.ok(options[0].detail.length <= 80, `expected a shortened detail, got ${options[0].detail.length} chars`);
  assert.match(options[0].detail, /…$/);
  assert.equal(options[1].detail, undefined, 'no docstring must not draw an empty detail');
  assert.equal(options[1].info, undefined);
});

check('a note reads as the line to look at, then what is wrong', () => {
  assert.equal(
    noteLabel({ line: 3, column: 1, text: "'os' imported but unused" }),
    "line 3 · 'os' imported but unused"
  );
});

check('notes that cannot be drawn are dropped, and the list is capped', () => {
  const notes = asLintNotes([
    { line: 1, column: 1, text: "'os' imported but unused" },
    { line: 0, column: 1, text: 'impossible line' },
    { line: 'x', column: 1, text: 'not a line' },
    { line: 2, column: 0, text: '  padded  ' },
    { line: 3, text: '   ' },
    { line: 4, text: 'missing column' },
  ]);
  assert.equal(notes.length, 3, `expected three drawable notes, got ${JSON.stringify(notes)}`);
  assert.deepEqual(notes[1], { line: 2, column: 1, text: 'padded' });
  assert.deepEqual(notes[2], { line: 4, column: 1, text: 'missing column' });
  assert.equal(asLintNotes(new Array(30).fill({ line: 1, text: 'x' })).length, 20);
  assert.deepEqual(asLintNotes('not an array'), []);
});

check('the same notes compare equal, a changed one does not', () => {
  const a = [{ line: 1, column: 1, text: 'x' }];
  assert.equal(sameNotes(a, [{ line: 1, column: 1, text: 'x' }]), true);
  assert.equal(sameNotes(a, [{ line: 2, column: 1, text: 'x' }]), false);
  assert.equal(sameNotes(a, []), false);
});

section('transport');

check('a completion asks by cursor position and resolves the matching answer', async () => {
  const { session, sent } = fakeSession();
  const pending = session.complete({ code: 'import math\nmath.', line: 2, column: 5 });
  assert.equal(sent.length, 1);
  assert.equal(sent[0].type, 'complete');
  assert.equal(sent[0].line, 2);
  assert.equal(sent[0].column, 5);
  assert.equal(typeof sent[0].requestId, 'number');
  const claimed = session.handleMessage({
    type: 'completions',
    requestId: sent[0].requestId,
    options: [{ name: 'acos', type: 'function', doc: 'arc cosine' }],
    ms: 9,
  });
  assert.equal(claimed, true, 'the session must claim its own answer');
  const reply = await pending;
  assert.equal(reply.ok, true);
  assert.equal(reply.ms, 9);
  assert.deepEqual(
    reply.value.map((option) => option.name),
    ['acos']
  );
});

check('two requests in flight get their own answers, not each other’s', async () => {
  const { session, sent } = fakeSession();
  const first = session.complete({ code: 'a', line: 1, column: 1 });
  const second = session.lint({ code: 'import os' });
  assert.deepEqual(
    sent.map((message) => message.type),
    ['complete', 'lint']
  );
  session.handleMessage({
    type: 'lint',
    requestId: sent[1].requestId,
    messages: [{ line: 1, column: 1, text: "'os' imported but unused" }],
  });
  session.handleMessage({ type: 'completions', requestId: sent[0].requestId, options: [] });
  const lint = await second;
  const complete = await first;
  assert.equal(lint.ok, true);
  assert.equal(lint.value[0].line, 1);
  assert.equal(complete.ok, true);
  assert.deepEqual(complete.value, []);
});

check('a run outcome is not an analysis answer', () => {
  const { session } = fakeSession();
  assert.equal(session.handleMessage({ type: 'result', runId: 7, stdout: 'hi' }), false);
  assert.equal(session.handleMessage({ type: 'scope', runId: 7, series: [] }), false);
  assert.equal(session.handleMessage({ type: 'status', status: 'ready' }), false);
  assert.equal(session.handleMessage(null), false);
});

check('an unanswered request resolves as unavailable instead of hanging', async () => {
  const { session } = fakeSession({ timeoutMs: 20 });
  const started = Date.now();
  const reply = await session.complete({ code: 'x', line: 1, column: 1 });
  assert.equal(reply.ok, false);
  assert.match(reply.reason, /timed out/);
  assert.ok(Date.now() - started < 2000);
  // A late answer to the dropped request is claimed (so the run gate never sees it) and ignored.
  assert.equal(session.handleMessage({ type: 'completions', requestId: 1, options: [] }), true);
});

check('an install failure says why, so the UI can say it too', async () => {
  const { session, sent } = fakeSession();
  const pending = session.lint({ code: 'import os' });
  session.handleMessage({
    type: 'lint',
    requestId: sent[0].requestId,
    unavailable: 'Failed to fetch jedi',
  });
  const reply = await pending;
  assert.equal(reply.ok, false);
  assert.match(reply.reason, /Failed to fetch jedi/);
});

check('cancelling drops in-flight requests without leaving a promise open', async () => {
  const { session, sent } = fakeSession();
  const pending = session.complete({ code: 'x', line: 1, column: 1 });
  session.cancelAll('worker restarted');
  const reply = await pending;
  assert.equal(reply.ok, false);
  assert.match(reply.reason, /worker restarted/);
  assert.equal(
    session.handleMessage({ type: 'completions', requestId: sent[0].requestId, options: [] }),
    true
  );
});

check('a worker that throws on post resolves the request instead of crashing the editor', async () => {
  const session = new AnalysisSession(() => {
    throw new Error('worker is gone');
  });
  const reply = await session.complete({ code: 'x', line: 1, column: 1 });
  assert.equal(reply.ok, false);
  assert.match(reply.reason, /worker is gone/);
});

for (const entry of entries) {
  if (entry.section) {
    console.log(entry.section);
    continue;
  }
  try {
    await entry.fn();
    passed += 1;
    console.log(`  ok   ${entry.name}`);
  } catch (error) {
    failed += 1;
    console.error(`  FAIL ${entry.name}\n       ${error.message}`);
  }
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
