#!/usr/bin/env node
/**
 * The pair session's wires, without a browser (`scripts/test_pair.mjs`, `npm run test:pair`)
 *
 * A direct session is three pieces of text and a stream of small messages, and everything that can go
 * wrong with the format is a rule rather than a pixel:
 *
 * 1. **A signal says which build wrote it.** The prefix carries `pair-1`; a paste from another
 *    version, another app, or a line-wrapped chat box is refused with a sentence instead of being
 *    handed to `setRemoteDescription` to fail obscurely.
 * 2. **A signal knows which box it belongs in.** An invitation pasted where a reply goes is the most
 *    likely mistake a person can make with two textareas, and it names that mistake.
 * 3. **A message is validated field by field.** The other side is a program: an unknown kind, a
 *    version this build does not speak, a non-string code, or an attempt past the length cap is
 *    dropped — never truncated into someone's editor with its ending missing.
 * 4. **Parsing is not writing.** `parseMessage` returns data. Whether an attempt is *applied* is the
 *    caller's decision and the learner's button, which is what keeps "their code arrives" from
 *    meaning "my draft is gone".
 *
 * Run: node --experimental-strip-types scripts/test_pair.mjs
 */

import assert from 'node:assert/strict';
import {
  ATTEMPT_MAX_CHARS,
  PAIR_PREFIX,
  SIGNAL_MAX_CHARS,
  attemptLines,
  attemptMessage,
  byeMessage,
  collabOpsMessage,
  collabStartMessage,
  collabStopMessage,
  decodeSignal,
  encodeSignal,
  handleFrom,
  helloMessage,
  lessonLabel,
  lessonMessage,
  pairSummary,
  parseMessage,
} from '../app/src/pairing.ts';
import { COLLAB_MAX_TEXT, CollabText } from '../app/src/collab.ts';

let passed = 0;
let failed = 0;

function section(title) {
  console.log(`\n${title}`);
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

/** A stand-in description, shaped like SDP without needing a browser. */
const OFFER = { kind: 'offer', sdp: `v=0\r\no=- 1 1 IN IP4 127.0.0.1\r\ns=-\r\n${'a=candidate:1 1 udp 1 127.0.0.1 5000 typ host\r\n'.repeat(3)}` };
const ANSWER = { kind: 'answer', sdp: OFFER.sdp.replace('o=- 1', 'o=- 2') };

section('a handle is a name');

check('two words from the two lists', () => {
  assert.equal(handleFrom(() => 0), 'Brave Otter');
  assert.equal(handleFrom(() => 0.999), 'Gentle Finch');
});

check('a handle is short enough to read aloud', () => {
  const handle = handleFrom(() => 0.5);
  assert.ok(handle.length > 4 && handle.split(' ').length === 2, handle);
});

section('signalling');

check('an offer round-trips through one pasteable line', () => {
  const text = encodeSignal(OFFER);
  assert.ok(text.startsWith(PAIR_PREFIX), text.slice(0, 40));
  assert.match(text, /^mechalab-pair-1:[A-Za-z0-9_-]+$/, 'base64url only: no +, /, or = to be mangled');
  const decoded = decodeSignal(text, 'offer');
  assert.ok(decoded.ok, decoded.reason ?? '');
  assert.equal(decoded.signal.sdp, OFFER.sdp);
});

check('an answer round-trips too, and keeps its kind', () => {
  const decoded = decodeSignal(encodeSignal(ANSWER), 'answer');
  assert.ok(decoded.ok);
  assert.equal(decoded.signal.kind, 'answer');
  assert.equal(decoded.signal.sdp, ANSWER.sdp);
});

check('an invitation pasted into the reply box is named as that mistake', () => {
  const decoded = decodeSignal(encodeSignal(OFFER), 'answer');
  assert.equal(decoded.ok, false);
  assert.match(decoded.reason, /invitation/i);
});

check('a reply pasted into the invitation box is named as well', () => {
  const decoded = decodeSignal(encodeSignal(ANSWER), 'offer');
  assert.equal(decoded.ok, false);
  assert.match(decoded.reason, /reply/i);
});

check('the wrong text, an empty paste and a cut-off code each say something different', () => {
  assert.match(decodeSignal('hello there', 'offer').reason, /not a session code/);
  assert.match(decodeSignal('   ', 'offer').reason, /Nothing was pasted/);
  const truncated = encodeSignal(OFFER).slice(0, PAIR_PREFIX.length + 40);
  assert.match(decodeSignal(truncated, 'offer').reason, /cut off or altered/);
  assert.match(decodeSignal(`${PAIR_PREFIX}not-json`, 'offer').reason, /cut off or altered/);
});

check(`a paste past ${SIGNAL_MAX_CHARS} characters is refused, not decoded`, () => {
  const huge = `${PAIR_PREFIX}${'A'.repeat(SIGNAL_MAX_CHARS)}`;
  const decoded = decodeSignal(huge, 'offer');
  assert.equal(decoded.ok, false);
  assert.match(decoded.reason, /too long/);
});

check('a code with no description is refused', () => {
  const empty = `${PAIR_PREFIX}${Buffer.from(JSON.stringify({ t: 'offer', d: '' })).toString('base64url')}`;
  assert.match(decodeSignal(empty, 'offer').reason, /no description/);
});

section('messages');

check('hello, lesson, attempt and bye all round-trip', () => {
  for (const message of [
    helloMessage('Brave Otter', 'P.2'),
    lessonMessage('P.3'),
    attemptMessage('P.2', 'print(1)\n'),
    byeMessage(),
  ]) {
    const parsed = parseMessage(JSON.stringify(message));
    assert.deepEqual(parsed, message, `dropped ${JSON.stringify(message)}`);
  }
});

check('a co-editing session starts, moves and stops over the same channel', () => {
  const doc = CollabText.seed('a = 1\n', 0);
  const ops = doc.localOps('a = 12\n');
  assert.ok(ops.length > 0);
  for (const message of [
    collabStartMessage('P.2', 'a = 1\n'),
    collabOpsMessage('P.2', ops),
    collabStopMessage('P.2', 'lesson'),
  ]) {
    assert.deepEqual(parseMessage(JSON.stringify(message)), message, `dropped ${message.kind}`);
  }
});

check('a co-editing start must carry a lesson and a text inside the cap', () => {
  const atCap = { v: 1, kind: 'collab-start', lesson: 'P.2', text: 'x'.repeat(COLLAB_MAX_TEXT) };
  assert.ok(parseMessage(JSON.stringify(atCap)), 'the cap itself is allowed');
  assert.equal(parseMessage(JSON.stringify({ ...atCap, text: `${atCap.text}y` })), null);
  assert.equal(parseMessage(JSON.stringify({ ...atCap, text: 5 })), null);
  assert.equal(parseMessage(JSON.stringify({ v: 1, kind: 'collab-start', lesson: '', text: 'x' })), null);
});

check('an op batch is refused whole, never half-applied', () => {
  const good = { k: 'i', c: 0, s: 2, t: 'a' };
  const batches = [
    [],
    'ops',
    [good, { k: 'i', c: 0, s: 3, t: 'ab' }],
    [good, { k: 'i', c: 9, s: 3, t: 'a' }],
    [good, { k: 'q', c: 0, s: 3 }],
  ];
  for (const ops of batches) {
    const message = { v: 1, kind: 'collab-ops', lesson: 'P.2', ops };
    assert.equal(parseMessage(JSON.stringify(message)), null, `accepted ${JSON.stringify(ops)}`);
  }
});

check('a stop names a reason this build knows', () => {
  for (const reason of ['left', 'lesson', 'declined']) {
    assert.ok(parseMessage(JSON.stringify({ v: 1, kind: 'collab-stop', lesson: 'P.2', reason })));
  }
  assert.equal(parseMessage(JSON.stringify({ v: 1, kind: 'collab-stop', lesson: 'P.2', reason: '???' })), null);
  assert.equal(parseMessage(JSON.stringify({ v: 1, kind: 'collab-stop', lesson: '' })), null);
});

check('junk is dropped, not thrown on', () => {
  for (const raw of ['not json', '{}', 'null', '[]', '{"v":1}', '{"v":2,"kind":"bye"}', '{"v":1,"kind":"nope"}', 42, null, undefined, { v: 1, kind: 'bye' }]) {
    assert.equal(parseMessage(raw), null, `accepted ${JSON.stringify(raw)}`);
  }
});

check('an attempt must carry a lesson and a string code', () => {
  assert.equal(parseMessage(JSON.stringify({ v: 1, kind: 'attempt', lesson: '', code: 'x' })), null);
  assert.equal(parseMessage(JSON.stringify({ v: 1, kind: 'attempt', lesson: 'P.1', code: 5 })), null);
  assert.equal(parseMessage(JSON.stringify({ v: 1, kind: 'attempt', code: 'x' })), null);
});

check(`an attempt past ${ATTEMPT_MAX_CHARS} characters is refused, not cut short`, () => {
  const atCap = { v: 1, kind: 'attempt', lesson: 'P.1', code: 'x'.repeat(ATTEMPT_MAX_CHARS) };
  assert.ok(parseMessage(JSON.stringify(atCap)), 'the cap itself is allowed');
  const pastCap = { ...atCap, code: `${atCap.code}y` };
  assert.equal(parseMessage(JSON.stringify(pastCap)), null);
});

check('the sender’s handle is bounded, so a session cannot paint over the sheet', () => {
  const loud = parseMessage(JSON.stringify({ v: 1, kind: 'hello', from: 'A'.repeat(400), lesson: 'P.1' }));
  assert.equal(loud.from.length, 40);
});

check('parsing writes nothing: a frozen message parses without being touched', () => {
  const message = Object.freeze({ v: 1, kind: 'lesson', lesson: 'P.4' });
  const parsed = parseMessage(JSON.stringify(message));
  assert.notEqual(parsed, message, 'a fresh object, not the caller’s');
  assert.equal(parsed.lesson, 'P.4');
  assert.deepEqual(Object.keys(message).sort(), ['kind', 'lesson', 'v']);
});

section('reading the session');

check('a lesson label falls back rather than going blank', () => {
  assert.equal(lessonLabel('P.2'), 'P.2');
  assert.equal(lessonLabel('  '), 'a lesson');
});

check('an attempt’s line count ignores a trailing newline, and zero means empty', () => {
  assert.equal(attemptLines('a\nb\n'), 2);
  assert.equal(attemptLines(''), 0);
  assert.equal(attemptLines('   \n'), 0);
});

check('every session state has a sentence', () => {
  for (const state of ['idle', 'offering', 'joining', 'connected', 'closed', 'error', 'other']) {
    assert.ok(pairSummary(state, null).length > 5, `no sentence for ${state}`);
  }
  assert.equal(pairSummary('connected', 'Brave Otter'), 'Connected to Brave Otter.');
});

console.log(`\npair: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
