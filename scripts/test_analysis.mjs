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
 * The formatter rides the same channel (`format`, answered by Black), so its three outcomes are checked
 * here too: the tidied text, the parser's sentence for a file Black cannot read, and the install's own
 * words for a formatter that is not there — which must not be blamed on the learner's code.
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
  asHover,
  asLintNotes,
  asSignature,
  completionStart,
  completionType,
  docParagraph,
  hoverTitle,
  lineColumnAt,
  noteLabel,
  sameNotes,
  splitSignature,
  toCompletionOptions,
} from '../app/src/analysisClient.ts';
import { callContext, hoverRange } from '../app/src/editor/callContext.ts';

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

section('hover and signatures');

check('a hover keeps the definition line, the signature and the docstring', () => {
  const hover = asHover({
    name: 'acos',
    type: 'function',
    description: 'def acos',
    signature: 'acos(x, /) -> float',
    doc: 'Return the arc cosine.\n\nThe result is between 0 and pi.',
  });
  assert.equal(hover.name, 'acos');
  assert.equal(hoverTitle(hover), 'def acos');
  assert.equal(hover.signature, 'acos(x, /) -> float');
  assert.match(hover.doc, /arc cosine/);
});

check('a hover with no name is no hover, and missing fields get safe defaults', () => {
  assert.equal(asHover(null), null);
  assert.equal(asHover('acos'), null);
  assert.equal(asHover({ name: '   ' }), null);
  const bare = asHover({ name: 'pi' });
  assert.deepEqual(bare, { name: 'pi', type: 'statement', description: '', signature: '', doc: '' });
  // The title falls back to the name rather than drawing an empty heading.
  assert.equal(hoverTitle(bare), 'pi');
});

check('a docstring in a tooltip is its first paragraph, shortened', () => {
  assert.equal(docParagraph(''), '');
  assert.equal(docParagraph('One line.'), 'One line.');
  assert.equal(
    docParagraph('First paragraph.\nStill first.\n\nSecond paragraph.'),
    'First paragraph.\nStill first.',
    'only the first paragraph belongs in a card'
  );
  const long = docParagraph('x'.repeat(500));
  assert.ok(long.length <= 320, `expected a capped paragraph, got ${long.length} chars`);
  assert.match(long, /…$/);
  assert.equal(docParagraph('a\nb\nc\nd\ne', 2), 'a\nb');
});

check('a signature keeps its label and only an index that names a real parameter', () => {
  const full = asSignature({
    name: 'gain',
    label: 'gain(k, x, scale=1.0)',
    index: 1,
    params: ['k', 'x', 'scale'],
    doc: 'A gain.',
  });
  assert.equal(full.label, 'gain(k, x, scale=1.0)');
  assert.equal(full.index, 1);
  assert.deepEqual(full.params, ['k', 'x', 'scale']);
  assert.equal(asSignature(null), null);
  assert.equal(asSignature({ label: '  ' }), null);
  // An index outside the parameter list cannot mark anything, so it is dropped, not clamped.
  assert.equal(asSignature({ label: 'f()', index: 3, params: [] }).index, null);
  assert.equal(asSignature({ label: 'f(a, b)', index: 2, params: ['a', 'b'] }).index, null);
  assert.deepEqual(asSignature({ label: 'f(a, b)', index: 0, params: ['a', 7, 'b'] }).params, ['a', 'b']);
});

check('the active parameter is cut out of the label at top-level commas', () => {
  const parts = splitSignature({
    name: 'gain',
    label: 'gain(k, x, scale=1.0)',
    index: 1,
    params: ['k', 'x', 'scale'],
    doc: '',
  });
  assert.deepEqual(parts, { before: 'gain(k, ', active: 'x', after: ', scale=1.0)' });
});

check('a signature with annotations, nesting, or nothing to mark is handled', () => {
  const acos = splitSignature({
    name: 'acos',
    label: 'acos(x: _SupportsFloatOrIndex, /) -> float',
    index: 0,
    params: ['x'],
    doc: '',
  });
  assert.equal(acos.active, 'x: _SupportsFloatOrIndex');
  // The comma inside the inner call is not an argument separator of the outer one.
  const nested = splitSignature({
    name: 'f',
    label: 'f(g(1, 2), 3)',
    index: 1,
    params: ['h', 'i'],
    doc: '',
  });
  assert.deepEqual(nested, { before: 'f(g(1, 2), ', active: '3', after: ')' });
  assert.equal(splitSignature({ label: 'f()', index: 0, params: [], doc: '', name: 'f' }), null);
  assert.equal(splitSignature({ label: 'f(a)', index: null, params: ['a'], doc: '', name: 'f' }), null);
  assert.equal(splitSignature({ label: 'no parens', index: 0, params: ['a'], doc: '', name: 'f' }), null);
});

section('the cursor inside a call');

check('an open call is found, with the argument being typed', () => {
  const context = callContext('math.acos(', 10);
  assert.equal(context.open, 9);
  assert.deepEqual(
    { line: context.line, column: context.column, activeParam: context.activeParam },
    { line: 1, column: 10, activeParam: 0 }
  );
  assert.equal(callContext('gain(2, ', 8).activeParam, 1);
  assert.equal(callContext('gain(2, 3', 9).activeParam, 1);
});

check('the innermost call wins, and only a parenthesis opens one', () => {
  const nested = 'gain(2, gain(1, ';
  const inner = callContext(nested, nested.length);
  assert.equal(inner.open, nested.lastIndexOf('('));
  assert.equal(inner.activeParam, 1);
  assert.equal(callContext('x = values[1', 12), null, 'a list literal has no signature');
  assert.equal(callContext('x = {"a": 1', 12), null);
  assert.equal(callContext('x = 1', 5), null);
});

check('a bracket in a string or a comment is not a call', () => {
  const quotedParen = callContext('print("("', 9);
  assert.equal(quotedParen.open, 5, 'the paren inside the string must not be mistaken for the call');
  assert.equal(quotedParen.activeParam, 0);
  assert.equal(callContext('# f(', 4), null);
  const quoted = 'print("hi", ';
  assert.equal(callContext(quoted, quoted.length).activeParam, 1, 'the real call is still found');
  const stringComma = 'f("a, b", ';
  assert.equal(callContext(stringComma, stringComma.length).activeParam, 1);
});

check('a call that spans lines is still one call', () => {
  const code = 'f(\n    1,\n    ';
  const context = callContext(code, code.length);
  assert.equal(context.open, 1);
  assert.equal(context.line, 3);
  assert.equal(context.activeParam, 1);
});

check('a closed call is over', () => {
  const code = 'gain(2, 3)';
  assert.equal(callContext(code, code.length), null, 'after the closing paren there is no signature');
  assert.equal(callContext('(2 + 3', 6).open, 0, 'grouping parens still open a context');
});

section('the name under the pointer');

check('a dotted name is one token, whichever part the pointer is over', () => {
  const code = 'import math\nmath.acos(x)';
  const start = code.indexOf('math.acos');
  assert.deepEqual(hoverRange(code, start + 2), { from: start, to: start + 9 });
  assert.deepEqual(hoverRange(code, start + 9), { from: start, to: start + 9 }, 'the gap after the name still names it');
});

check('whitespace, numbers and empty documents have nothing to hover', () => {
  assert.equal(hoverRange('x = 1', 2), null);
  assert.equal(hoverRange('3.14', 2), null);
  assert.equal(hoverRange('', 0), null);
  assert.deepEqual(hoverRange('math.', 5), { from: 0, to: 4 }, 'the trailing dot is trimmed off the name');
  assert.equal(hoverRange('a.b', 2).from, 0);
});

section('transport of hover and signatures');

check('hover asks about a position and a null answer is still an answer', async () => {
  const { session, sent } = fakeSession();
  const pending = session.hover({ code: 'import math\nmath.acos', line: 2, column: 9 });
  assert.equal(sent[0].type, 'hover');
  assert.equal(sent[0].line, 2);
  session.handleMessage({ type: 'hover', requestId: sent[0].requestId, hover: null });
  const reply = await pending;
  assert.equal(reply.ok, true);
  assert.equal(reply.value, null, 'nothing to show is not a failure');
});

check('signature asks about the cursor and maps the answer', async () => {
  const { session, sent } = fakeSession();
  const pending = session.signature({ code: 'math.acos(', line: 1, column: 10 });
  assert.equal(sent[0].type, 'signature');
  session.handleMessage({
    type: 'signature',
    requestId: sent[0].requestId,
    signature: { name: 'acos', label: 'acos(x, /) -> float', index: 0, params: ['x'], doc: '' },
  });
  const reply = await pending;
  assert.equal(reply.ok, true);
  assert.equal(reply.value.label, 'acos(x, /) -> float');
  assert.equal(reply.value.index, 0);
});

check('a hover that could not be answered says so instead of showing a blank card', async () => {
  const { session, sent } = fakeSession();
  const pending = session.signature({ code: 'f(', line: 1, column: 2 });
  session.handleMessage({ type: 'signature', requestId: sent[0].requestId, unavailable: 'no jedi' });
  const reply = await pending;
  assert.equal(reply.ok, false);
  assert.match(reply.reason, /no jedi/);
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

check('a request waiting on the analyzer install outlives the answer clock', async () => {
  const { session, sent } = fakeSession({ timeoutMs: 20 });
  assert.equal(
    session.handleMessage({ type: 'analysis-status', state: 'installing' }),
    true,
    'the install notice is the session\'s, so the run gate never sees it'
  );
  const pending = session.complete({ code: 'import math\nmath.', line: 2, column: 5 });
  let settled = false;
  pending.then(() => {
    settled = true;
  });
  // Five times the answer clock: a request abandoned here is the first completion a cold visit loses.
  await new Promise((resolve) => setTimeout(resolve, 100));
  assert.equal(settled, false, 'the install budget holds the request open');
  session.handleMessage({ type: 'analysis-status', state: 'done' });
  session.handleMessage({
    type: 'completions',
    requestId: sent[0].requestId,
    options: [{ name: 'acos', type: 'function', doc: '' }],
  });
  const reply = await pending;
  assert.equal(reply.ok, true);
  assert.equal(reply.value[0].name, 'acos');
});

check('the answer clock is back once the install is done', async () => {
  const { session } = fakeSession({ timeoutMs: 20 });
  session.handleMessage({ type: 'analysis-status', state: 'installing' });
  session.handleMessage({ type: 'analysis-status', state: 'done' });
  const reply = await session.complete({ code: 'x', line: 1, column: 1 });
  assert.equal(reply.ok, false);
  assert.match(reply.reason, /timed out/);
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

section('the formatter');

check('a format request answers with the tidied file', async () => {
  const { session, sent } = fakeSession();
  const pending = session.format('x=1\n');
  assert.equal(sent.length, 1);
  assert.equal(sent[0].type, 'format');
  assert.equal(sent[0].code, 'x=1\n');
  assert.equal(
    session.handleMessage({
      type: 'format',
      requestId: sent[0].requestId,
      formatted: 'x = 1\n',
    }),
    true,
    'the formatter answer is the session’s, so the run gate never sees it'
  );
  const reply = await pending;
  assert.deepEqual(reply, { ok: true, text: 'x = 1\n' });
});

check('a file Black cannot parse is the learner’s syntax, not a missing formatter', async () => {
  const { session, sent } = fakeSession();
  const pending = session.format('def f(:\n');
  session.handleMessage({
    type: 'format',
    requestId: sent[0].requestId,
    error: 'InvalidInput: Cannot parse: 1:7: def f(:',
  });
  const reply = await pending;
  assert.equal(reply.ok, false);
  assert.equal(reply.syntax, true, 'the parser’s own sentence is the learner’s to fix');
  assert.match(reply.reason, /Cannot parse/);
});

check('a formatter that could not install is not blamed on the code', async () => {
  const { session, sent } = fakeSession();
  const pending = session.format('x=1\n');
  session.handleMessage({
    type: 'format',
    requestId: sent[0].requestId,
    unavailable: 'Failed to fetch black',
  });
  const reply = await pending;
  assert.equal(reply.ok, false);
  assert.equal(reply.syntax, false);
  assert.match(reply.reason, /Failed to fetch black/);
});

check('the formatter’s install notice holds its request open too', async () => {
  const { session, sent } = fakeSession({ timeoutMs: 20 });
  const pending = session.format('x=1\n');
  assert.equal(
    session.handleMessage({ type: 'format-status', state: 'installing' }),
    true,
    'the install notice must be claimed before the run gate can see it'
  );
  let settled = false;
  pending.then(() => {
    settled = true;
  });
  await new Promise((resolve) => setTimeout(resolve, 100));
  assert.equal(settled, false, 'the install budget holds the request open');
  session.handleMessage({ type: 'format-status', state: 'done' });
  session.handleMessage({
    type: 'format',
    requestId: sent[0].requestId,
    formatted: 'x = 1\n',
  });
  const reply = await pending;
  assert.equal(reply.ok, true);
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
