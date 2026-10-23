#!/usr/bin/env node
/**
 * Layout presets: the table (`scripts/test_layout.mjs`, `npm run test:layout`)
 *
 * A preset is a promise about what is on screen, and the two ways to break it are both invisible in a
 * screenshot of the default: a row of the table that hides the wrong region (a blank work area), and a
 * stored value that survives a version bump and blanks the page on load. So:
 *
 * 1. **The table is pinned region by region.** Study shows everything; Write hides the chooser and the
 *    last run's output; Read hides the editor.
 * 2. **Nothing stored, nothing broken.** No `localStorage` at all (a booted page in a test harness, a
 *    browser that throws on access) reads as the default, and the toggle still returns what to render.
 * 3. **A stored value is validated, not trusted.** `'grid'` from an older build, or a half-written
 *    string, reads as the default rather than as a region nobody planned for.
 * 4. **The shortcut is the physical key.** ⌥2 on a Mac types `™`, so the handler reads
 *    `KeyboardEvent.code`; the map accepts both spellings and refuses everything else.
 * 5. **The divider's share is a bounded, validated number.** Split's divider stores a share of the
 *    width, and everything that can go wrong with one is arithmetic: a stored `0` that collapses the
 *    editor, a stored `banana`, a pointer outside the container, a key at the clamp. Each is pinned
 *    here because a divider that can be dragged to nothing is worse than no divider.
 *
 * Run: node --experimental-strip-types scripts/test_layout.mjs
 */

import assert from 'node:assert/strict';
import {
  DEFAULT_LAYOUT,
  DEFAULT_SPLIT_RATIO,
  LAYOUTS,
  SPLIT_KEY_STEP,
  SPLIT_MAX_RATIO,
  SPLIT_MIN_RATIO,
  STORAGE_KEY_LAYOUT,
  STORAGE_KEY_SPLIT_RATIO,
  clampSplitRatio,
  layoutArrangement,
  layoutShortcutFor,
  layoutShows,
  readLayout,
  readSplitRatio,
  splitGridTemplate,
  splitRatioAfterKey,
  splitRatioAt,
  splitRatioPercent,
  writeLayout,
  writeSplitRatio,
} from '../app/src/workspaceLayout.ts';

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

/** A `localStorage` good enough for the module, plus the two ways one fails. */
function fakeStorage(initial = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (key) => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => data.set(key, String(value)),
    data,
  };
}

const REGIONS = ['list', 'editor', 'results'];

console.log('layout presets');

check('four presets, each printing its own shortcut', () => {
  assert.deepEqual(
    LAYOUTS.map((option) => option.id),
    ['study', 'write', 'read', 'split']
  );
  assert.deepEqual(
    LAYOUTS.map((option) => option.shortcut),
    ['⌥1', '⌥2', '⌥3', '⌥4']
  );
  for (const option of LAYOUTS) {
    assert.ok(option.label.length > 0, `${option.id} needs a label for its button`);
    assert.match(option.title, /⌥\d/, `${option.id}'s title must print the shortcut`);
  }
});

check('the table: what each preset shows', () => {
  assert.deepEqual(REGIONS.filter((r) => layoutShows('study', r)), ['list', 'editor', 'results']);
  assert.deepEqual(REGIONS.filter((r) => layoutShows('write', r)), ['editor']);
  assert.deepEqual(REGIONS.filter((r) => layoutShows('read', r)), ['results']);
  // Split is the only preset that hides one region and shows the other two in two columns.
  assert.deepEqual(REGIONS.filter((r) => layoutShows('split', r)), ['editor', 'results']);
});

check('the arrangement is a separate rule: only Split puts the work beside itself', () => {
  assert.deepEqual(
    LAYOUTS.map((option) => [option.id, layoutArrangement(option.id)]),
    [
      ['study', 'stack'],
      ['write', 'stack'],
      ['read', 'stack'],
      ['split', 'columns'],
    ]
  );
});

check('no storage at all reads as the default', () => {
  assert.equal(typeof globalThis.localStorage, 'undefined', 'this suite assumes no global storage');
  assert.equal(readLayout(), DEFAULT_LAYOUT);
  // The toggle still answers with what to render.
  assert.equal(writeLayout('write'), 'write');
});

check('a stored preset is read back, and is written where the reader looks', () => {
  globalThis.localStorage = fakeStorage();
  try {
    assert.equal(readLayout(), DEFAULT_LAYOUT, 'an empty store is the default');
    assert.equal(writeLayout('read'), 'read');
    assert.equal(globalThis.localStorage.data.get(STORAGE_KEY_LAYOUT), 'read');
    assert.equal(readLayout(), 'read');
  } finally {
    delete globalThis.localStorage;
  }
});

check('a stored value that is not a preset reads as the default', () => {
  globalThis.localStorage = fakeStorage({ [STORAGE_KEY_LAYOUT]: 'grid' });
  try {
    assert.equal(readLayout(), DEFAULT_LAYOUT);
  } finally {
    delete globalThis.localStorage;
  }
});

check('storage that throws on read, or on write, costs the memory and not the toggle', () => {
  globalThis.localStorage = {
    getItem() {
      throw new Error('SecurityError');
    },
    setItem() {
      throw new Error('QuotaExceededError');
    },
  };
  try {
    assert.equal(readLayout(), DEFAULT_LAYOUT);
    assert.equal(writeLayout('write'), 'write');
  } finally {
    delete globalThis.localStorage;
  }
});

check('the shortcut is the physical key, so ⌥2 works where it types ™', () => {
  assert.equal(layoutShortcutFor('Digit1'), 'study');
  assert.equal(layoutShortcutFor('Digit2'), 'write');
  assert.equal(layoutShortcutFor('Digit3'), 'read');
  assert.equal(layoutShortcutFor('Digit4'), 'split');
  assert.equal(layoutShortcutFor('1'), 'study');
  assert.equal(layoutShortcutFor('3'), 'read');
  assert.equal(layoutShortcutFor('4'), 'split');
  assert.equal(layoutShortcutFor('Digit5'), null, 'there is no fifth preset');
  assert.equal(layoutShortcutFor('5'), null);
  assert.equal(layoutShortcutFor('KeyQ'), null);
  assert.equal(layoutShortcutFor('Digit12'), null);
  assert.equal(layoutShortcutFor(''), null);
});

section('the split divider');

check('the share is clamped to the two columns a screen can actually show', () => {
  assert.equal(clampSplitRatio(0.5), 0.5);
  assert.equal(clampSplitRatio(0.1), SPLIT_MIN_RATIO, 'a share that small leaves no editor');
  assert.equal(clampSplitRatio(0.95), SPLIT_MAX_RATIO, 'a share that large leaves no results');
  assert.equal(clampSplitRatio(SPLIT_MIN_RATIO), SPLIT_MIN_RATIO);
  assert.equal(clampSplitRatio(SPLIT_MAX_RATIO), SPLIT_MAX_RATIO);
  // Everything that is not a number is the even split rather than NaN in a grid template.
  assert.equal(clampSplitRatio('banana'), DEFAULT_SPLIT_RATIO);
  assert.equal(clampSplitRatio(undefined), DEFAULT_SPLIT_RATIO);
  assert.equal(clampSplitRatio(Number.NaN), DEFAULT_SPLIT_RATIO);
  assert.equal(clampSplitRatio(Number.POSITIVE_INFINITY), DEFAULT_SPLIT_RATIO);
  // ...but a numeric string is the number it spells, because that is what storage hands back.
  assert.equal(clampSplitRatio('0.42'), 0.42);
});

check('the share is announced in whole percent', () => {
  assert.equal(splitRatioPercent(0.5), 50);
  assert.equal(splitRatioPercent(0.424), 42);
  assert.equal(splitRatioPercent(0.1), 30, 'the announcement is the clamp, not the attempt');
});

check('the grid template is two fractions, so the gap is not added to 100%', () => {
  assert.equal(splitGridTemplate(0.5), 'minmax(0, 0.5fr) minmax(0, 0.5fr)');
  assert.equal(splitGridTemplate(0.42), 'minmax(0, 0.42fr) minmax(0, 0.58fr)');
  assert.equal(splitGridTemplate(0.1), 'minmax(0, 0.3fr) minmax(0, 0.7fr)');
  // No float noise in a CSS value: the two shares have to read like numbers somebody typed.
  assert.equal(splitGridTemplate(1 / 3), 'minmax(0, 0.333fr) minmax(0, 0.667fr)');
});

check('a pointer becomes a share of the free space, and nothing else does', () => {
  assert.equal(splitRatioAt(700, 100, 1000), 0.6);
  assert.equal(splitRatioAt(600, 100, 1000), 0.5);
  assert.equal(splitRatioAt(0, 100, 1000), SPLIT_MIN_RATIO, 'outside the container clamps');
  assert.equal(splitRatioAt(5000, 100, 1000), SPLIT_MAX_RATIO);
  assert.equal(splitRatioAt(700, 100, 0), null, 'a collapsed container has no share to give');
  assert.equal(splitRatioAt(Number.NaN, 100, 1000), null);
});

check('the arrow keys move the divider, and the ends are reachable', () => {
  assert.equal(splitRatioAfterKey(0.5, 'ArrowRight'), 0.5 + SPLIT_KEY_STEP);
  assert.equal(splitRatioAfterKey(0.5, 'ArrowLeft'), 0.5 - SPLIT_KEY_STEP);
  assert.equal(splitRatioAfterKey(0.5, 'ArrowRight', true), 0.6, 'Shift moves by a tenth');
  assert.equal(splitRatioAfterKey(SPLIT_MIN_RATIO, 'ArrowLeft'), SPLIT_MIN_RATIO, 'a clamp, not a wrap');
  assert.equal(splitRatioAfterKey(SPLIT_MAX_RATIO, 'ArrowRight'), SPLIT_MAX_RATIO);
  assert.equal(splitRatioAfterKey(0.5, 'Home'), SPLIT_MIN_RATIO);
  assert.equal(splitRatioAfterKey(0.5, 'End'), SPLIT_MAX_RATIO);
  // The keys a separator does not own are left to the page.
  assert.equal(splitRatioAfterKey(0.5, 'ArrowUp'), null);
  assert.equal(splitRatioAfterKey(0.5, 'Enter'), null);
  assert.equal(splitRatioAfterKey(0.5, 'a'), null);
});

check('the divider is remembered, validated on the way in', () => {
  assert.equal(typeof globalThis.localStorage, 'undefined', 'this check assumes no global storage');
  assert.equal(readSplitRatio(), DEFAULT_SPLIT_RATIO);
  assert.equal(writeSplitRatio(0.4), 0.4, 'with no store the drag still works this visit');

  globalThis.localStorage = fakeStorage();
  try {
    assert.equal(readSplitRatio(), DEFAULT_SPLIT_RATIO, 'an empty store is the even split');
    assert.equal(writeSplitRatio(0.42), 0.42);
    assert.equal(globalThis.localStorage.data.get(STORAGE_KEY_SPLIT_RATIO), '0.42');
    assert.equal(readSplitRatio(), 0.42);
    // A share outside the range is clamped on the way in and on the way out: an older build, or a
    // hand-edited key, cannot collapse a column.
    globalThis.localStorage.data.set(STORAGE_KEY_SPLIT_RATIO, '0');
    assert.equal(readSplitRatio(), SPLIT_MIN_RATIO);
    globalThis.localStorage.data.set(STORAGE_KEY_SPLIT_RATIO, '1');
    assert.equal(readSplitRatio(), SPLIT_MAX_RATIO);
    for (const junk of ['', '   ', 'banana', 'NaN']) {
      globalThis.localStorage.data.set(STORAGE_KEY_SPLIT_RATIO, junk);
      assert.equal(readSplitRatio(), DEFAULT_SPLIT_RATIO, `stored ${JSON.stringify(junk)}`);
    }
  } finally {
    delete globalThis.localStorage;
  }
});

check('a store that throws costs the memory, not the divider', () => {
  globalThis.localStorage = {
    getItem() {
      throw new Error('SecurityError');
    },
    setItem() {
      throw new Error('QuotaExceededError');
    },
  };
  try {
    assert.equal(readSplitRatio(), DEFAULT_SPLIT_RATIO);
    assert.equal(writeSplitRatio(0.35), 0.35, 'the write returns what to render');
  } finally {
    delete globalThis.localStorage;
  }
});

console.log(`layout presets: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exitCode = 1;
