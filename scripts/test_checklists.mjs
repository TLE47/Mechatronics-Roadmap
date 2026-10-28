#!/usr/bin/env node
/**
 * The lesson checklist's store, without a browser (`scripts/test_checklists.mjs`, `npm run test:checklists`).
 *
 * The reader turns every unordered bullet into a checkbox, and a checkbox that forgets is worse than
 * no checkbox at all: the learner has to re-read the page to find out what was done. So the rules
 * pinned here are the store's promises — a tick is per lesson, its identity is the item's words, the
 * same words twice are one item, the store is bounded, a reset can clear one lesson or all of them,
 * and a bucket that refuses a write says so instead of showing a tick that will vanish.
 *
 * Run: node --experimental-strip-types scripts/test_checklists.mjs
 */

import assert from 'node:assert/strict';
import { Window } from 'happy-dom';
import {
  MAX_CHECK_ID_CHARS,
  MAX_TICKS_PER_LESSON,
  STORAGE_KEY_CHECKS,
  checkId,
  clearAllTicks,
  clearTicks,
  isTicked,
  mergeChecks,
  parseChecks,
  readChecks,
  replaceChecks,
  readTicks,
  setTicked,
  tickCounts,
  toggleTicked,
} from '../app/src/lessonChecks.ts';

let passed = 0;
let failed = 0;

/** A fresh browser: new storage, one that throws on access, or none at all. */
function freshBrowser({ store = 'works' } = {}) {
  const window = new Window({ url: 'https://example.test/' });
  if (store === 'throws') {
    Object.defineProperty(window, 'localStorage', {
      get() {
        throw new Error('SecurityError: localStorage is disabled');
      },
    });
  }
  globalThis.window = window;
  globalThis.document = window.document;
  if (store === 'absent') {
    delete globalThis.localStorage;
  } else if (store === 'throws') {
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      get() {
        throw new Error('SecurityError: localStorage is disabled');
      },
    });
  } else {
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      writable: true,
      value: window.localStorage,
    });
  }
  return window;
}

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

section('an item is identified by its words');

check('whitespace is collapsed and the identity is capped', () => {
  assert.equal(checkId('  Run   the   sweep\n  once '), 'Run the sweep once');
  assert.equal(checkId('x'.repeat(MAX_CHECK_ID_CHARS + 20)).length, MAX_CHECK_ID_CHARS);
  assert.equal(checkId('   '), '', 'an empty bullet has no identity to tick');
  assert.equal(checkId(null), '', 'only a string can be an item');
});

check('the same sentence twice is one item, and the markdown that draws it is not', () => {
  assert.equal(checkId('**Bold** item'), checkId('**Bold** item'), 'the same item reads the same');
  assert.notEqual(checkId('Bold item'), checkId('**Bold** item'), 'a formatting change is a new item');
});

check('the cap is part of the identity, so cleaning it again changes nothing', () => {
  // A 160th character that is a space used to be trimmed away by the *next* read: the box drew one
  // id, the store kept another, and the box could never tick. P.1's "Storing values in named
  // variables" cut exactly there.
  const cutOnSpace = `${'a'.repeat(MAX_CHECK_ID_CHARS - 1)} tail`;
  assert.equal(checkId(cutOnSpace).endsWith(' '), false, 'the id must not end on the cut space');
  assert.equal(checkId(checkId(cutOnSpace)), checkId(cutOnSpace), 'the id is idempotent');
  assert.equal(checkId(checkId(cutOnSpace)).length, MAX_CHECK_ID_CHARS - 1);

  freshBrowser();
  assert.equal(setTicked('P.1', cutOnSpace, true, 1000), true);
  assert.equal(isTicked('P.1', cutOnSpace), true, 'the box can read back the tick it wrote');
  assert.deepEqual(readTicks('P.1'), [checkId(cutOnSpace)]);
});

section('a fresh browser');

check('nothing is ticked, and every read is empty rather than undefined', () => {
  freshBrowser();
  assert.deepEqual(readChecks(), {});
  assert.deepEqual(readTicks('P.1'), []);
  assert.equal(isTicked('P.1', 'anything'), false);
  assert.deepEqual(tickCounts(), { lessons: 0, ticks: 0 });
});

section('ticking');

check('a tick is stored per lesson and survives a fresh read', () => {
  freshBrowser();
  assert.equal(setTicked('P.1', 'Run the sweep', true, 1000), true, 'the write must land');
  assert.equal(isTicked('P.1', 'Run the sweep'), true);
  assert.equal(isTicked('P.2', 'Run the sweep'), false, 'another lesson has its own list');
  assert.deepEqual(readTicks('P.1'), ['Run the sweep']);
  assert.deepEqual(readChecks()['P.1'], { done: ['Run the sweep'], updatedAt: 1000 });
});

check('unticking removes only that item, and the lesson leaves when its last tick does', () => {
  freshBrowser();
  setTicked('P.1', 'one', true, 1000);
  setTicked('P.1', 'two', true, 1001);
  setTicked('P.1', 'one', false, 1002);
  assert.deepEqual(readTicks('P.1'), ['two'], 'the other tick stays');
  setTicked('P.1', 'two', false, 1003);
  assert.deepEqual(readChecks(), {}, 'a lesson with no ticks must not linger');
  assert.equal(localStorage.getItem(STORAGE_KEY_CHECKS), null, 'an empty store removes its key');
});

check('asking for the state a box already has is a success and writes nothing', () => {
  freshBrowser();
  setTicked('P.1', 'one', true, 1000);
  assert.equal(setTicked('P.1', 'one', true, 2000), true, 'a double tick is not a failure');
  assert.equal(readChecks()['P.1'].updatedAt, 1000, 'the timestamp is not rewritten for a no-op');
  assert.equal(setTicked('P.1', 'never ticked', false), true, 'unticking an unticked item is a no-op');
});

check('toggle reports the next state, and the second press puts it back', () => {
  freshBrowser();
  assert.deepEqual(toggleTicked('P.1', 'one', 1000), { checked: true, saved: true });
  assert.equal(isTicked('P.1', 'one'), true);
  assert.deepEqual(toggleTicked('P.1', 'one', 1001), { checked: false, saved: true });
  assert.equal(isTicked('P.1', 'one'), false);
});

check('different lessons with identical items do not share a tick', () => {
  freshBrowser();
  setTicked('P.1', 'Open the terminal', true, 1000);
  setTicked('P.2', 'Open the terminal', true, 1001);
  setTicked('P.2', 'Open the terminal', false, 1002);
  assert.equal(isTicked('P.1', 'Open the terminal'), true, 'the first lesson keeps its tick');
  assert.equal(isTicked('P.2', 'Open the terminal'), false);
  assert.deepEqual(tickCounts(), { lessons: 1, ticks: 1 });
});

check('the store is bounded, and it is the oldest tick that goes', () => {
  freshBrowser();
  for (let index = 0; index < MAX_TICKS_PER_LESSON + 3; index += 1) {
    setTicked('P.1', `item ${index}`, true, 1000 + index);
  }
  const ticks = readTicks('P.1');
  assert.equal(ticks.length, MAX_TICKS_PER_LESSON, 'the cap holds');
  assert.equal(ticks[0], 'item 3', 'the first three ticks were evicted, not the newest');
  assert.equal(ticks.at(-1), `item ${MAX_TICKS_PER_LESSON + 2}`, 'the newest tick is kept');
});

section('a store written by something else');

check('junk is refused, duplicates are one, and the cap is applied on read too', () => {
  assert.deepEqual(parseChecks('{not json'), {});
  assert.deepEqual(parseChecks('null'), {});
  assert.deepEqual(parseChecks('[1,2]'), {});
  assert.deepEqual(parseChecks(JSON.stringify({ 'P.1': { done: [] } })), {}, 'nothing ticked is no entry');
  assert.deepEqual(
    parseChecks(
      JSON.stringify({
        'P.1': { done: ['  one ', 'two', 'one', '', 7], updatedAt: 5 },
        'P.2': { done: 'not an array' },
        'P.3': { done: ['kept'] },
      })
    ),
    {
      'P.1': { done: ['one', 'two'], updatedAt: 5 },
      'P.3': { done: ['kept'], updatedAt: 0 },
    }
  );
});

section('clearing');

check('one lesson can be cleared without touching another', () => {
  freshBrowser();
  setTicked('P.1', 'one', true, 1000);
  setTicked('P.2', 'two', true, 1001);
  clearTicks('P.1');
  assert.deepEqual(readTicks('P.1'), []);
  assert.deepEqual(readTicks('P.2'), ['two'], 'the other lesson keeps its tick');
  clearTicks('P.9');
  assert.deepEqual(readTicks('P.2'), ['two'], 'clearing an empty lesson is harmless');
});

check('everything can be cleared', () => {
  freshBrowser();
  setTicked('P.1', 'one', true, 1000);
  setTicked('P.2', 'two', true, 1001);
  clearAllTicks();
  assert.deepEqual(readChecks(), {}, 'no lesson keeps a tick');
  assert.equal(localStorage.getItem(STORAGE_KEY_CHECKS), null);
});

section('merging');

check('ticks union by lesson and item, and neither store is mutated', () => {
  const local = { 'P.1': { done: ['one'], updatedAt: 10 } };
  const incoming = {
    'P.1': { done: ['two'], updatedAt: 20 },
    'P.2': { done: ['three'], updatedAt: 30 },
  };
  const { store, added } = mergeChecks(local, incoming);
  assert.deepEqual(store, {
    'P.1': { done: ['one', 'two'], updatedAt: 20 },
    'P.2': { done: ['three'], updatedAt: 30 },
  });
  assert.equal(added, 2);
  assert.deepEqual(local, { 'P.1': { done: ['one'], updatedAt: 10 } }, 'the local store is not mutated');
  assert.deepEqual(incoming['P.1'].done, ['two'], 'the incoming store is not mutated');
});

check('a tick already present is not counted twice, and its newer stamp is kept', () => {
  const { store, added } = mergeChecks(
    { 'P.1': { done: ['one'], updatedAt: 10 } },
    { 'P.1': { done: ['one'], updatedAt: 5 } }
  );
  assert.deepEqual(store['P.1'], { done: ['one'], updatedAt: 10 });
  assert.equal(added, 0);
});

check('entries that do not parse are dropped rather than merged in', () => {
  const { store, added } = mergeChecks(
    {},
    {
      'P.1': { done: [' kept ', 'kept', '', 7], updatedAt: 5 },
      ' ': { done: ['x'] },
      'P.2': { done: 'no' },
    }
  );
  assert.deepEqual(store, { 'P.1': { done: ['kept'], updatedAt: 5 } });
  assert.equal(added, 1);
});

section('replacing');

check('a whole store can be written back, cleaned the same way', () => {
  freshBrowser();
  assert.equal(replaceChecks({ 'P.1': { done: [' one ', 'one', 'two'], updatedAt: 5 } }), true);
  assert.deepEqual(readChecks(), { 'P.1': { done: ['one', 'two'], updatedAt: 5 } });
  assert.equal(replaceChecks({}), true);
  assert.equal(localStorage.getItem(STORAGE_KEY_CHECKS), null, 'an empty store removes the key');
});

check('a blocked store refuses the replace', () => {
  freshBrowser({ store: 'throws' });
  assert.equal(replaceChecks({ 'P.1': { done: ['one'], updatedAt: 5 } }), false);
});

section('the bucket');

check('a blocked or missing store never throws, and refuses the write', () => {
  freshBrowser({ store: 'throws' });
  assert.deepEqual(readChecks(), {});
  assert.equal(setTicked('P.1', 'one', true), false, 'a blocked write must say it did not land');
  assert.deepEqual(toggleTicked('P.1', 'one'), { checked: true, saved: false });
  assert.equal(clearTicks('P.1'), undefined, 'clearing a blocked store is quiet');

  freshBrowser({ store: 'absent' });
  assert.equal(setTicked('P.1', 'one', true), false, 'no store means no write');
  assert.deepEqual(readChecks(), {});
});

check('a bucket that rejects the write keeps the session working', () => {
  freshBrowser();
  const real = globalThis.localStorage;
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key) => real.getItem(key),
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
      removeItem: (key) => real.removeItem(key),
    },
  });
  assert.equal(setTicked('P.1', 'one', true), false, 'the refusal is reported, not swallowed');
  assert.deepEqual(readChecks(), {}, 'nothing was written behind the learner');
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
