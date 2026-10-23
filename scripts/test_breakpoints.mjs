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
 * 5. **An edit carries the dot with its statement.** Held as a position, mapped through CodeMirror's
 *    own change sets: a newline above moves it down, undo brings it back, typing inside a line leaves
 *    it alone — and a whole-document replacement re-seeds it from the lines instead of collapsing
 *    every dot onto one end.
 *
 * Run: node --experimental-strip-types scripts/test_breakpoints.mjs (`npm run test:breakpoints`)
 */

import assert from 'node:assert/strict';
import { Window } from 'happy-dom';
import { EditorState } from '@codemirror/state';
import {
  armedLines,
  breakpointLinesField,
  setBreakpointLines,
} from '../app/src/editor/breakpointState.ts';
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

/**
 * An editor state with the breakpoint field, armed on these lines.
 *
 * `@codemirror/state` needs no DOM, which is the point of keeping the field in its own module: the
 * mapping is checked here rather than through a browser's keystrokes.
 */
function editor(doc, lines = []) {
  const state = EditorState.create({ doc, extensions: [breakpointLinesField] });
  return lines.length ? state.update({ effects: setBreakpointLines.of(lines) }).state : state;
}

check('a newline typed above a breakpoint carries it down, and undo brings it back', () => {
  const first = editor('a = 1\nb = 2\nprint(a + b)\n', [2]);
  assert.deepEqual(armedLines(first), [2]);
  const pushed = first.update({ changes: { from: 0, insert: 'x = 0\n' } }).state;
  assert.deepEqual(armedLines(pushed), [3], 'expected the dot to follow b = 2 down one line');
  const undone = pushed.update({ changes: { from: 0, to: 6 } }).state;
  assert.deepEqual(armedLines(undone), [2], 'expected the dot back where it was');
});

check('typing inside a line does not move the dot', () => {
  const state = editor('a = 1\nb = 2\n', [2]);
  const typed = state.update({ changes: { from: 3, insert: '  # note' } }).state;
  assert.deepEqual(armedLines(typed), [2]);
  // A newline typed at the end of the line above moves it: the statement is now on line 3.
  const split = state.update({ changes: { from: 6, insert: '\n' } }).state;
  assert.deepEqual(armedLines(split), [3], 'a line break just above the dot moves it down');
});

check('a replaced document re-seeds the dots from the lines it is handed', () => {
  const state = editor('a = 1\nb = 2\n', [2]);
  // Load Solution / Reset Starter / a restored draft replace every byte; positions mapped through
  // that would all land at one end, so the transaction carries the list instead.
  const replaced = state.update({
    changes: { from: 0, to: state.doc.length, insert: 'x = 1\ny = 2\nz = 3\n' },
    effects: setBreakpointLines.of([2]),
  }).state;
  assert.deepEqual(armedLines(replaced), [2]);
});

check('a line past the end of a replaced document is clamped, not dropped', () => {
  const state = editor('a = 1\nb = 2\n', [2]);
  const shorter = state.update({
    changes: { from: 0, to: state.doc.length, insert: 'only = 1' },
    effects: setBreakpointLines.of([9]),
  }).state;
  assert.deepEqual(armedLines(shorter), [1], 'expected line 9 of a one-line document to land on line 1');
  // A trailing newline is a second (empty) line in CodeMirror's count, so the clamp lands there.
  assert.deepEqual(
    armedLines(
      state.update({ changes: { from: 0, to: state.doc.length, insert: 'only = 1\n' }, effects: setBreakpointLines.of([9]) }).state
    ),
    [2]
  );
});

check('two dots that land on one line are reported once', () => {
  const state = editor('a = 1\nb = 2\nc = 3\n', [2, 3]);
  // Deleting `b = 2` entirely maps both positions onto the start of the line that takes its place.
  const merged = state.update({ changes: { from: 6, to: 12 } }).state;
  assert.deepEqual(armedLines(merged), [2], 'expected a deduped list, not the same line twice');
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
  console.log('       eviction, a refused write, the lines a run is sent, and the way an edit moves a dot.');
}
