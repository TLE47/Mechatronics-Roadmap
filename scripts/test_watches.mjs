#!/usr/bin/env node
/**
 * Watch expressions: the list and the store (`scripts/test_watches.mjs`, `npm run test:watches`).
 *
 * A watch is a string evaluated in every parked frame, so everything that can go wrong is quiet:
 *
 * 1. **One expression, one line.** A pasted two-line expression must be stored as the one line the
 *    bar will show; a width nobody can read must be capped at the width the worker is sent.
 * 2. **Pinned once.** Adding the same expression twice must not cost two `eval`s at every park, and
 *    a bar at its cap must say so by leaving the list alone rather than dropping somebody else's.
 * 3. **Per lesson, and bounded.** `total` means one lesson's variable: a list belongs to the file it
 *    was written in, and a runaway list must not be read and sent on every run.
 * 4. **The store is not the truth when it cannot be written.** A browser that refuses storage still
 *    gets this visit's watches; it just does not get them next visit. Junk (a number, a null, an
 *    empty string, a whole corrupt blob) reads back as no watches rather than throwing in the bar.
 *
 * Run: node --experimental-strip-types scripts/test_watches.mjs
 */

import assert from 'node:assert/strict';
import { Window } from 'happy-dom';
import {
  MAX_WATCHES_PER_LESSON,
  MAX_WATCH_CHARS,
  MAX_WATCH_LESSONS,
  STORAGE_KEY_WATCHES,
  addWatch,
  clearWatches,
  normalizeWatch,
  normalizeWatches,
  readWatchStore,
  readWatches,
  removeWatch,
  writeWatches,
} from '../app/src/editor/watches.ts';

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

console.log('watch expressions');

check('an expression is stored as one trimmed line, capped at the width the worker gets', () => {
  assert.equal(normalizeWatch('  total  '), 'total', 'expected the value a learner meant');
  assert.equal(normalizeWatch('n\t*\n2'), 'n * 2', 'expected a pasted multi-line expression on one line');
  assert.equal(normalizeWatch('x'.repeat(MAX_WATCH_CHARS + 40)).length, MAX_WATCH_CHARS);
  assert.equal(normalizeWatch('   '), '', 'expected an all-space expression to be nothing');
  assert.equal(normalizeWatch(42), '', 'expected a non-string to be dropped, not stringified');
});

check('a list keeps its order, pins each expression once, and stops at the cap', () => {
  assert.deepEqual(normalizeWatches(['total', 'n * 2', 'total']), ['total', 'n * 2']);
  assert.deepEqual(normalizeWatches(['', '  ', null, 7, 'ok']), ['ok']);
  assert.deepEqual(normalizeWatches('not a list'), []);
  const many = Array.from({ length: MAX_WATCHES_PER_LESSON + 3 }, (_, index) => `v${index}`);
  assert.deepEqual(
    normalizeWatches(many),
    many.slice(0, MAX_WATCHES_PER_LESSON),
    'expected the first entries to be the ones kept: the bar reads left to right'
  );
});

check('adding pins once, and a full bar keeps what it has', () => {
  let list = addWatch([], 'total');
  assert.deepEqual(list, ['total']);
  assert.deepEqual(addWatch(list, ' total '), ['total'], 'expected a duplicate to change nothing');
  list = addWatch(list, 'n * 2');
  assert.deepEqual(list, ['total', 'n * 2']);
  assert.deepEqual(addWatch(list, '   '), ['total', 'n * 2'], 'expected an empty add to change nothing');
  const full = Array.from({ length: MAX_WATCHES_PER_LESSON }, (_, index) => `v${index}`);
  assert.deepEqual(
    addWatch(full, 'one-more'),
    full,
    'expected a bar at its cap to refuse rather than evict a watch the learner chose'
  );
});

check('removing takes one out and leaves the rest in order', () => {
  const list = ['total', 'n * 2', 'plant.L1'];
  assert.deepEqual(removeWatch(list, 'n * 2'), ['total', 'plant.L1']);
  assert.deepEqual(removeWatch(list, ' n * 2 '), ['total', 'plant.L1']);
  assert.deepEqual(removeWatch(list, 'missing'), list);
});

check('a written list reads back exactly, and an empty one forgets the lesson', () => {
  const window = freshBrowser();
  const written = writeWatches('a', [' total ', 'n * 2', 7]);
  assert.deepEqual(written, ['total', 'n * 2'], 'expected the answer to be what is drawn');
  assert.deepEqual(readWatches('a'), written);
  assert.deepEqual(readWatches('b'), [], 'expected no watches for a lesson never pinned');
  writeWatches('a', []);
  assert.equal(window.localStorage.getItem(STORAGE_KEY_WATCHES), null);
  assert.deepEqual(readWatchStore(), {});
});

check('two lessons keep two lists', () => {
  freshBrowser();
  writeWatches('a', ['total']);
  writeWatches('b', ['q1', 'q2']);
  assert.deepEqual(readWatches('a'), ['total']);
  assert.deepEqual(readWatches('b'), ['q1', 'q2']);
});

check('junk in the store reads as no watches, not as a broken bar', () => {
  const window = freshBrowser();
  window.localStorage.setItem(
    STORAGE_KEY_WATCHES,
    JSON.stringify({ good: ['total', '', 3], empty: [], junk: 'nope' })
  );
  assert.deepEqual(readWatchStore(), { good: ['total'] });
  window.localStorage.setItem(STORAGE_KEY_WATCHES, 'not json');
  assert.deepEqual(readWatchStore(), {});
  window.localStorage.setItem(STORAGE_KEY_WATCHES, '[1, 2, 3]');
  assert.deepEqual(readWatchStore(), {}, 'expected an array where a record belongs to be ignored');
});

check('the store keeps the newest lessons and drops the longest-untouched', () => {
  freshBrowser();
  writeWatches('first', ['total']);
  writeWatches('second', ['other']);
  // Touching `first` again moves it to the back: it is the more recently used of the two.
  writeWatches('first', ['total', 'n']);
  for (let index = 0; index < MAX_WATCH_LESSONS - 2; index += 1) {
    writeWatches(`filler-${index}`, [`v${index}`]);
  }
  assert.equal(Object.keys(readWatchStore()).length, MAX_WATCH_LESSONS);
  writeWatches('filler-last', ['newest']);
  const store = readWatchStore();
  assert.equal(Object.keys(store).length, MAX_WATCH_LESSONS);
  assert.deepEqual(store.first, ['total', 'n'], 'expected the re-written lesson to survive');
  assert.equal(store.second, undefined, 'expected the longest-untouched lesson to be dropped');
  assert.deepEqual(store['filler-last'], ['newest']);
});

check('a browser that refuses storage still gets this visit’s list', () => {
  freshBrowser({ store: 'throws' });
  assert.deepEqual(
    writeWatches('a', ['total']),
    ['total'],
    'expected the list back even with no store'
  );
  assert.deepEqual(readWatches('a'), [], 'expected nothing to have been stored');
});

check('no storage at all is not an error', () => {
  freshBrowser({ store: 'absent' });
  assert.deepEqual(readWatches('a'), []);
  assert.deepEqual(writeWatches('a', ['total']), ['total']);
  clearWatches('a');
});

check('forgetting one lesson leaves the others, and forgetting all removes the key', () => {
  const window = freshBrowser();
  writeWatches('a', ['total']);
  writeWatches('b', ['q1']);
  clearWatches('a');
  assert.deepEqual(readWatches('a'), []);
  assert.deepEqual(readWatches('b'), ['q1']);
  clearWatches();
  assert.equal(window.localStorage.getItem(STORAGE_KEY_WATCHES), null);
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exitCode = 1;
