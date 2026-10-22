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
 *
 * Run: node --experimental-strip-types scripts/test_layout.mjs
 */

import assert from 'node:assert/strict';
import {
  DEFAULT_LAYOUT,
  LAYOUTS,
  STORAGE_KEY_LAYOUT,
  layoutShortcutFor,
  layoutShows,
  readLayout,
  writeLayout,
} from '../app/src/workspaceLayout.ts';

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

check('three presets, each printing its own shortcut', () => {
  assert.deepEqual(
    LAYOUTS.map((option) => option.id),
    ['study', 'write', 'read']
  );
  assert.deepEqual(
    LAYOUTS.map((option) => option.shortcut),
    ['⌥1', '⌥2', '⌥3']
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
  assert.equal(layoutShortcutFor('1'), 'study');
  assert.equal(layoutShortcutFor('3'), 'read');
  assert.equal(layoutShortcutFor('Digit4'), null, 'there is no fourth preset');
  assert.equal(layoutShortcutFor('4'), null);
  assert.equal(layoutShortcutFor('KeyQ'), null);
  assert.equal(layoutShortcutFor('Digit12'), null);
  assert.equal(layoutShortcutFor(''), null);
});

console.log(`layout presets: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exitCode = 1;
