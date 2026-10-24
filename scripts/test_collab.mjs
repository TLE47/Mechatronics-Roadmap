#!/usr/bin/env node
/**
 * Two people, one file — the merge rules (`scripts/test_collab.mjs`, `npm run test:collab`)
 *
 * Live co-editing is an answer to one question: what happens when both of you type at once? Every
 * way that can go wrong is a rule rather than a pixel, so it is measured without a browser:
 *
 * 1. **A seeded document reads back as itself**, and its characters are numbered in document order —
 *    the host's slot, which is what lets both sides start from ids they agree on without exchanging a
 *    per-character transcript.
 * 2. **A local edit becomes the smallest complete description of itself.** One typed character is one
 *    insert with the right origin, a deleted one is one delete naming its id, and a paste that
 *    replaces a selection is both.
 * 3. **Two copies that see the same ops in either order agree.** Concurrent inserts at one origin,
 *    at different origins, an insert beside a delete: every pairing converges, which is the whole
 *    claim the sheet makes.
 * 4. **A character is never lost to a bad reference.** An origin this replica has not seen places the
 *    character at the start of the document and is counted, rather than being dropped.
 * 5. **A message is validated before it is applied.** An unknown kind, a character that is not one,
 *    a client slot that does not exist, a sequence of zero, a batch past the cap: refused, whole,
 *    because half a paste is a document neither person typed.
 * 6. **A big paste is split, not refused.** Batching keeps each message inside the channel's cap, and
 *    applying the batches in order leaves the other copy holding exactly the pasted text.
 *
 * Run: node --experimental-strip-types scripts/test_collab.mjs
 */

import assert from 'node:assert/strict';
import {
  COLLAB_MAX_TEXT,
  OPS_PER_MESSAGE,
  CollabText,
  chunkOps,
  fromWire,
  toWire,
} from '../app/src/collab.ts';

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

/** Apply ops to a document the way the channel would: in order, ignoring nothing. */
function applyAll(doc, ops) {
  for (const op of ops) doc.apply(op);
  return doc.text;
}

/** A small deterministic PRNG, so a fuzz case that fails can be re-run. */
function mulberry(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SCRIPT = 'total = 0\nfor n in range(3):\n    total += n\nprint(total)\n';

section('A seeded document is the text, numbered in order');
check('a seed reads back exactly, and every character has an id', () => {
  const doc = CollabText.seed(SCRIPT, 0);
  assert.equal(doc.text, SCRIPT);
  const ids = doc.visibleIds();
  assert.equal(ids.length, SCRIPT.length);
  assert.deepEqual(ids[0], { c: 0, s: 1 });
  assert.deepEqual(ids[ids.length - 1], { c: 0, s: SCRIPT.length });
});
check('the host continues its own sequence after the seed, the guest starts at one', () => {
  const host = CollabText.seed('abc', 0);
  const guest = CollabText.seed('abc', 1);
  host.localOps('abcd');
  assert.deepEqual(host.visibleIds()[3], { c: 0, s: 4 });
  guest.localOps('abcd');
  assert.deepEqual(guest.visibleIds()[3], { c: 1, s: 1 }, 'the guest must not mint ids in the host slot');
});
check('an empty document seeds empty and can still be typed into', () => {
  const doc = CollabText.seed('', 0);
  assert.equal(doc.text, '');
  doc.localOps('x');
  assert.equal(doc.text, 'x');
});

section('A local edit becomes the smallest description of itself');
check('typing one character at the end is one insert after the last character', () => {
  const doc = CollabText.seed('ab', 0);
  const ops = doc.localOps('abc');
  assert.equal(ops.length, 1);
  assert.equal(ops[0].kind, 'ins');
  assert.equal(ops[0].ch, 'c');
  assert.deepEqual(ops[0].after, { c: 0, s: 2 });
  assert.equal(doc.text, 'abc');
});
check('typing in the middle points at the character it followed', () => {
  const doc = CollabText.seed('ac', 0);
  const ops = doc.localOps('abc');
  assert.equal(ops.length, 1);
  assert.deepEqual(ops[0].after, { c: 0, s: 1 }, 'b was typed after a');
  assert.equal(doc.text, 'abc');
});
check('deleting one character is one delete naming its id, and the text loses it', () => {
  const doc = CollabText.seed('abc', 0);
  const ops = doc.localOps('ac');
  assert.equal(ops.length, 1);
  assert.equal(ops[0].kind, 'del');
  assert.deepEqual(ops[0].id, { c: 0, s: 2 });
  assert.equal(doc.text, 'ac');
});
check('a paste replacing a selection is deletes and inserts in one op list', () => {
  const doc = CollabText.seed('x = 1\n', 0);
  const ops = doc.localOps('x = 41\n');
  assert.equal(
    ops.length,
    1,
    'the shared prefix `x = ` and suffix `1` must leave one inserted character, not a whole file'
  );
  assert.equal(ops[0].kind, 'ins');
  assert.equal(doc.text, 'x = 41\n');
  const replaced = CollabText.seed('x = 1\n', 0).localOps('x = 9\n');
  assert.deepEqual(
    replaced.map((op) => op.kind),
    ['del', 'ins'],
    'replacing the character itself is a delete and an insert'
  );
});
check('no change is no ops', () => {
  const doc = CollabText.seed('abc', 0);
  assert.deepEqual(doc.localOps('abc'), []);
});
check('a run of typed characters is a chain, each pointing at the one before', () => {
  const doc = CollabText.seed('', 0);
  const ops = doc.localOps('abc');
  assert.equal(ops.length, 3);
  assert.equal(ops[0].after, null);
  assert.deepEqual(ops[1].after, ops[0].id);
  assert.deepEqual(ops[2].after, ops[1].id);
});

section('Two copies that see the same ops agree');
check('an insert replayed on a second copy lands in the same place', () => {
  const a = CollabText.seed('ac', 0);
  const b = CollabText.seed('ac', 1);
  const ops = a.localOps('abc');
  applyAll(b, ops);
  assert.equal(a.text, b.text);
  assert.equal(b.text, 'abc');
});
check('concurrent inserts at one origin converge in either order', () => {
  const a = CollabText.seed('ab', 0);
  const b = CollabText.seed('ab', 1);
  const opsA = a.localOps('aXb');
  const opsB = b.localOps('aYb');
  const a2 = CollabText.seed('ab', 0);
  const b2 = CollabText.seed('ab', 1);
  applyAll(a2, opsA);
  applyAll(a2, opsB);
  applyAll(b2, opsB);
  applyAll(b2, opsA);
  assert.equal(a2.text, b2.text);
  assert.equal(a2.text.length, 4);
});
check('concurrent inserts at different places converge', () => {
  const a = CollabText.seed('a b c', 0);
  const b = CollabText.seed('a b c', 1);
  const opsA = a.localOps('a b c 1');
  const opsB = b.localOps('a 2 b c');
  const left = CollabText.seed('a b c', 0);
  applyAll(left, opsA);
  applyAll(left, opsB);
  const right = CollabText.seed('a b c', 1);
  applyAll(right, opsB);
  applyAll(right, opsA);
  assert.equal(left.text, right.text);
  assert.match(left.text, /1/);
  assert.match(left.text, /2/);
});
check('an insert beside a delete of neighbouring text converges', () => {
  // b deletes `b`; a types a character where `b` was. Both must survive as one text.
  const a = CollabText.seed('abc', 0);
  const b = CollabText.seed('abc', 1);
  const opsA = a.localOps('abXc');
  const opsB = b.localOps('ac');
  const left = CollabText.seed('abc', 0);
  applyAll(left, opsA);
  applyAll(left, opsB);
  const right = CollabText.seed('abc', 1);
  applyAll(right, opsB);
  applyAll(right, opsA);
  assert.equal(left.text, right.text);
  assert.equal(left.text, 'aXc');
});
check('two workbenches typing a loop into the same file end up with one text', () => {
  // Both type into the body, each after a different line, and each deletes one character of its
  // own. The interleaving is the point: neither copy sees the other's keystrokes until the end.
  const start = 'for n in range(3):\n    print(n)\n';
  const a = CollabText.seed(start, 0);
  const b = CollabText.seed(start, 1);
  const opsA = a.localOps('for n in range(3):\n    total = 0\n    print(n)\n');
  const opsB = b.localOps('for n in range(3):\n    print(n + 1)\n');
  assert.ok(opsA.length > 0 && opsB.length > 0);
  const left = CollabText.seed(start, 0);
  applyAll(left, opsA);
  applyAll(left, opsB);
  const right = CollabText.seed(start, 1);
  applyAll(right, opsB);
  applyAll(right, opsA);
  assert.equal(left.text, right.text);
  assert.match(left.text, /total = 0/);
  assert.match(left.text, /print\(n \+ 1\)/);
});
check('a hundred random edits from each side, shuffled, still leave one text', () => {
  const random = mulberry(20261023);
  const start = 'a = 1\nb = 2\nprint(a + b)\n';
  const a = CollabText.seed(start, 0);
  const b = CollabText.seed(start, 1);
  const sentA = [];
  const sentB = [];
  for (let step = 0; step < 100; step += 1) {
    for (const [doc, log] of [
      [a, sentA],
      [b, sentB],
    ]) {
      const text = doc.text;
      const at = Math.floor(random() * (text.length + 1));
      const cut = Math.floor(random() * (text.length - at + 1));
      const insert = random() < 0.5 ? '' : String.fromCharCode(97 + Math.floor(random() * 26));
      const next = text.slice(0, at) + insert + text.slice(at + cut);
      if (next === text) continue;
      log.push(doc.localOps(next));
    }
  }
  const left = CollabText.seed(start, 0);
  const right = CollabText.seed(start, 1);
  // Two interleavings of the same batches: `left` alternates one batch each, `right` takes the
  // guest's whole stream first. Each client's own batches stay in order — that is what a channel
  // guarantees, and a CRDT is not asked to survive a sender reordering itself.
  const longest = Math.max(sentA.length, sentB.length);
  for (let index = 0; index < longest; index += 1) {
    if (sentA[index]) applyAll(left, sentA[index]);
    if (sentB[index]) applyAll(left, sentB[index]);
  }
  for (const batch of sentB) applyAll(right, batch);
  for (const batch of sentA) applyAll(right, batch);
  assert.equal(left.text, right.text, 'the two copies must converge however the batches interleave');
});

section('A character is never lost to a bad reference');
check('an insert whose origin is unknown lands at the start and is counted', () => {
  const doc = CollabText.seed('ab', 0);
  const changed = doc.apply({
    kind: 'ins',
    id: { c: 1, s: 1 },
    after: { c: 0, s: 99 },
    ch: 'X',
  });
  assert.equal(changed, true);
  assert.equal(doc.text, 'Xab');
});
check('a duplicate insert changes nothing', () => {
  const doc = CollabText.seed('ab', 0);
  const op = { kind: 'ins', id: { c: 1, s: 1 }, after: null, ch: 'X' };
  assert.equal(doc.apply(op), true);
  assert.equal(doc.apply(op), false);
  assert.equal(doc.text, 'Xab');
});
check('deleting something already gone, or never seen, changes nothing', () => {
  const doc = CollabText.seed('ab', 0);
  assert.equal(doc.apply({ kind: 'del', id: { c: 0, s: 1 } }), true);
  assert.equal(doc.apply({ kind: 'del', id: { c: 0, s: 1 } }), false);
  assert.equal(doc.apply({ kind: 'del', id: { c: 1, s: 7 } }), false);
  assert.equal(doc.text, 'b');
});
check('a char after a deleted one keeps its place', () => {
  const doc = CollabText.seed('abc', 0);
  doc.localOps('ac');
  // `b` is a tombstone: a character typed after it must still sit between a and c.
  doc.apply({ kind: 'ins', id: { c: 1, s: 9 }, after: { c: 0, s: 2 }, ch: 'Z' });
  assert.equal(doc.text, 'aZc');
});

section('A message is validated before it is applied');
check('ops round-trip through the wire form', () => {
  const doc = CollabText.seed('ab', 0);
  const ops = doc.localOps('aXbc');
  const wire = toWire(ops);
  assert.deepEqual(fromWire(wire), ops);
});
check('a refusal is whole: one bad op refuses the batch', () => {
  const good = { k: 'd', c: 0, s: 1 };
  const cases = [
    [good, { k: 'i', c: 0, s: 2 }],
    [good, { k: 'i', c: 0, s: 2, t: 'ab' }],
    [good, { k: 'i', c: 0, s: 2, t: '' }],
    [good, { k: 'x', c: 0, s: 2 }],
    [good, { k: 'i', c: 2, s: 2, t: 'a' }],
    [good, { k: 'i', c: -1, s: 2, t: 'a' }],
    [good, { k: 'i', c: 0, s: 0, t: 'a' }],
    [good, { k: 'i', c: 0, s: 1.5, t: 'a' }],
    [good, { k: 'i', c: 0, s: 2, a: [0], t: 'a' }],
    [good, { k: 'i', c: 0, s: 2, a: [0, 0], t: 'a' }],
    [good, 'not an object'],
    [good, null],
  ];
  for (const batch of cases) {
    assert.equal(fromWire(batch), null, `must refuse ${JSON.stringify(batch)}`);
  }
});
check('an empty batch, a non-array and an over-long batch are refused', () => {
  assert.equal(fromWire([]), null);
  assert.equal(fromWire({ ops: [] }), null);
  assert.equal(fromWire('ops'), null);
  const tooMany = Array.from({ length: OPS_PER_MESSAGE + 1 }, (_, index) => ({
    k: 'd',
    c: 0,
    s: index + 1,
  }));
  assert.equal(fromWire(tooMany), null);
});
check('a batch at the cap is accepted', () => {
  const full = Array.from({ length: OPS_PER_MESSAGE }, (_, index) => ({ k: 'd', c: 0, s: index + 1 }));
  const ops = fromWire(full);
  assert.equal(ops.length, OPS_PER_MESSAGE);
});

section('A big paste is split, not refused');
check('a long paste becomes batches, each inside the cap', () => {
  const doc = CollabText.seed('', 0);
  const pasted = Array.from({ length: 450 }, (_, index) => String.fromCharCode(97 + (index % 26))).join('');
  const ops = doc.localOps(pasted);
  assert.equal(ops.length, 450);
  const chunks = chunkOps(ops);
  assert.equal(chunks.length, 3);
  assert.ok(chunks.every((chunk) => chunk.length <= OPS_PER_MESSAGE));
  assert.equal(chunks[0].length, OPS_PER_MESSAGE);
  assert.equal(chunks[2].length, 50);
  for (const chunk of chunks) {
    const json = JSON.stringify(toWire(chunk));
    assert.ok(json.length < 24000, `one batch must fit a message; got ${json.length} characters`);
  }
});
check('applying the batches in order leaves the other copy holding the paste', () => {
  const a = CollabText.seed('body = []\n', 0);
  const b = CollabText.seed('body = []\n', 1);
  const pasted = 'body = [\n' + '    1,\n'.repeat(200) + ']\n';
  const ops = a.localOps(pasted);
  assert.ok(ops.length > OPS_PER_MESSAGE);
  for (const chunk of chunkOps(ops)) {
    for (const op of chunk) b.apply(op);
  }
  assert.equal(b.text, a.text);
  assert.equal(b.text, pasted);
});
check('a document past the cap is still representable; the cap is the runner’s to enforce', () => {
  const long = 'x'.repeat(COLLAB_MAX_TEXT);
  const doc = CollabText.seed(long, 0);
  assert.equal(doc.text.length, COLLAB_MAX_TEXT);
  assert.equal(doc.localOps(long + 'y').length, 1);
});

console.log(`\ncollab: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
