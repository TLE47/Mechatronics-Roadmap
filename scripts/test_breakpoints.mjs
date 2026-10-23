#!/usr/bin/env node
/**
 * Breakpoints: the list, the store, and what a run is sent (`scripts/test_breakpoints.mjs`).
 *
 * A breakpoint is one line number, so the interesting failures are all quiet ones:
 *
 * 1. **A toggle is a toggle.** Clicking the same line twice must leave nothing armed, and a dot that
 *    is drawn must be a line the run will actually park on.
 * 2. **Per lesson, and bounded.** A list belongs to the file it was placed in — switching lessons must
 *    not arm a line in somebody else's file — and a runaway list must not be paid for on every read.
 * 3. **The store is not the truth when it cannot be written.** A browser that refuses storage still
 *    gets this visit's dots; it just does not get them next visit.
 * 4. **A line that cannot execute is dropped**, so the gutter and the worker cannot disagree.
 *
 * Run: node --experimental-strip-types scripts/test_breakpoints.mjs (`npm run test:breakpoints`)
 */

import assert from 'node:assert/strict';
import { Window } from 'happy-dom';
import {
  MAX_BREAKPOINTS_PER_LESSON,
  MAX_BREAKPOINT_LESSONS,
  STORAGE_KEY_BREAKPOINTS,
  breakpointLinesForRun,
  clearBreakpoints,
  normalizeBreakpoints,
  readBreakpointStore,
  readBreakpoints,
  toggleBreakpoint,
  writeBreakpoints,
} from '../app/src/editor/breakpoints.ts';

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

console.log('breakpoints');

check('a toggle arms a line, a second toggle disarms it, and the list is sorted', () => {
  let lines = toggleBreakpoint([], 7);
  assert.deepEqual(lines, [7]);
  lines = toggleBreakpoint(lines, 3);
  assert.deepEqual(lines, [3, 7], 'expected the list to be ascending, whatever order it was clicked');
  lines = toggleBreakpoint(lines, 7);
  assert.deepEqual(lines, [3], 'expected the second click on line 7 to take it away');
});

check('only whole lines from 1 are breakpoints', () => {
  assert.deepEqual(normalizeBreakpoints([0, -2, 1.5, NaN, 2, 2, '4', null]), [2, 4]);
  assert.deepEqual(toggleBreakpoint([5], 0), [5], 'expected line 0 to change nothing');
});

check('the list is capped, and the cap keeps the line just asked for', () => {
  const many = Array.from({ length: MAX_BREAKPOINTS_PER_LESSON + 5 }, (_, index) => index + 1);
  const capped = normalizeBreakpoints(many);
  assert.equal(capped.length, MAX_BREAKPOINTS_PER_LESSON);
  assert.equal(capped.at(-1), MAX_BREAKPOINTS_PER_LESSON + 5, 'expected the newest click to survive');
  assert.equal(capped[0], 6, 'expected the oldest entries to be the ones dropped');
});

check('a lesson reads back the list it wrote, and an empty list forgets the lesson', () => {
  const window = freshBrowser();
  assert.deepEqual(writeBreakpoints('a', [9, 2]), [2, 9]);
  assert.deepEqual(readBreakpoints('a'), [2, 9]);
  assert.deepEqual(readBreakpoints('b'), [], 'expected no breakpoints for a lesson never armed');
  writeBreakpoints('a', []);
  assert.equal(window.localStorage.getItem(STORAGE_KEY_BREAKPOINTS), null);
  assert.deepEqual(readBreakpointStore(), {});
});

check('two lessons keep two lists', () => {
  freshBrowser();
  writeBreakpoints('a', [1]);
  writeBreakpoints('b', [2]);
  assert.deepEqual(readBreakpoints('a'), [1]);
  assert.deepEqual(readBreakpoints('b'), [2]);
});

check('a store written by an older version is read, not trusted', () => {
  const window = freshBrowser();
  window.localStorage.setItem(
    STORAGE_KEY_BREAKPOINTS,
    JSON.stringify({ good: [3, '4', 0, 'x'], empty: [], junk: 'nope' })
  );
  assert.deepEqual(readBreakpointStore(), { good: [3, 4] });
  window.localStorage.setItem(STORAGE_KEY_BREAKPOINTS, 'not json');
  assert.deepEqual(readBreakpointStore(), {});
});

check('the store keeps the newest lessons and drops the longest-untouched', () => {
  freshBrowser();
  writeBreakpoints('first', [1]);
  writeBreakpoints('second', [2]);
  // Touching `first` again moves it to the back: it is the more recently used of the two.
  writeBreakpoints('first', [1, 3]);
  // Fill to exactly the cap, so nothing is evicted yet (58 fillers + the two above).
  for (let index = 0; index < MAX_BREAKPOINT_LESSONS - 2; index += 1) {
    writeBreakpoints(`filler-${index}`, [index + 1]);
  }
  assert.equal(Object.keys(readBreakpointStore()).length, MAX_BREAKPOINT_LESSONS);
  // One more write is what makes the store drop its oldest: `second`, not `first`.
  writeBreakpoints('filler-last', [99]);
  const store = readBreakpointStore();
  assert.equal(Object.keys(store).length, MAX_BREAKPOINT_LESSONS);
  assert.ok(store.first, 'expected the lesson that was written again to survive the eviction');
  assert.equal(store.second, undefined, 'expected the longest-untouched lesson to be the one dropped');
  assert.ok(store['filler-last'], 'expected the newest lesson to be kept');
});

check('a browser that refuses storage still gets this visit’s list', () => {
  freshBrowser({ store: 'throws' });
  assert.deepEqual(writeBreakpoints('a', [4]), [4], 'expected the list back even with no store');
  assert.deepEqual(readBreakpoints('a'), [], 'expected nothing to have been stored');
});

check('forgetting one lesson leaves the others, and forgetting all removes the key', () => {
  const window = freshBrowser();
  writeBreakpoints('a', [1]);
  writeBreakpoints('b', [2]);
  clearBreakpoints('a');
  assert.deepEqual(readBreakpoints('a'), []);
  assert.deepEqual(readBreakpoints('b'), [2]);
  clearBreakpoints();
  assert.equal(window.localStorage.getItem(STORAGE_KEY_BREAKPOINTS), null);
});

check('a run is sent only lines this document can execute', () => {
  const text = ['x = 1', '', 'y = 2', 'print(x + y)'].join('\n');
  assert.deepEqual(breakpointLinesForRun(text, [1, 2, 3, 4, 99, 0]), [1, 3, 4]);
  assert.deepEqual(breakpointLinesForRun('', [1]), [], 'expected no breakpoint in an empty document');
  assert.deepEqual(breakpointLinesForRun('x = 1\n', [1]), [1]);
});

if (failed) {
  console.error(`\n[FAIL] ${failed} breakpoint check(s) failed`);
  process.exitCode = 1;
} else {
  console.log(`\n[PASS] ${passed} breakpoint checks: the toggle, the per-lesson store, its caps and`);
  console.log('       eviction, a refused write, and the lines a run is sent.');
}
