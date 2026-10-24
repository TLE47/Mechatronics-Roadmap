#!/usr/bin/env node
/**
 * Layout presets: the table (`scripts/test_layout.mjs`, `npm run test:layout`)
 *
 * A preset is a promise about what is on screen, and the two ways to break it are both invisible in a
 * screenshot of the default: a row of the table that hides the wrong region (a blank work area), and a
 * stored value that survives a version bump and blanks the page on load. So:
 *
 * 1. **The table is pinned region by region.** Study shows the lesson text, the editor and the
 *    results; Write hides the lesson text and the results; Read hides the editor and the results;
 *    Debug hides the lesson text and puts the editor and the results in two columns.
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
 * 6. **Docking is a side, not a visibility, and the side is in the arithmetic.** One button moves the
 *    panel the preset in force has beside nothing else: Study's lesson text in Study, Debug's
 *    results in Debug, and no button at all in Write or Read. Because the stored ratio is always the
 *    editor's share, a results column on the left has to reverse the grid template, the pointer
 *    mapping and the two arrow keys together — a failure to reverse all four is a drag that moves
 *    the boundary the wrong way, which is invisible until somebody tries it.
 *
 * Run: node --experimental-strip-types scripts/test_layout.mjs
 */

import assert from 'node:assert/strict';
import {
  DEFAULT_DOCK,
  DEFAULT_LAYOUT,
  DEFAULT_SPLIT_RATIO,
  LAYOUTS,
  SPLIT_KEY_STEP,
  SPLIT_MAX_RATIO,
  SPLIT_MIN_RATIO,
  STORAGE_KEY_DOCK,
  STORAGE_KEY_LAYOUT,
  STORAGE_KEY_SPLIT_RATIO,
  clampSplitRatio,
  dockControl,
  flippedDock,
  layoutArrangement,
  layoutShortcutFor,
  layoutShows,
  normalizeDock,
  readDock,
  readLayout,
  readSplitRatio,
  splitGridTemplate,
  splitRatioAfterKey,
  splitRatioAt,
  splitRatioPercent,
  writeDock,
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

const REGIONS = ['lesson', 'editor', 'results'];

console.log('layout presets');

check('four presets, each printing its own shortcut', () => {
  assert.deepEqual(
    LAYOUTS.map((option) => option.id),
    ['study', 'write', 'read', 'debug']
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
  assert.deepEqual(REGIONS.filter((r) => layoutShows('study', r)), ['lesson', 'editor', 'results']);
  assert.deepEqual(REGIONS.filter((r) => layoutShows('write', r)), ['editor']);
  assert.deepEqual(REGIONS.filter((r) => layoutShows('read', r)), ['lesson']);
  // Debug is the only preset that hides one region and shows the other two in two columns.
  assert.deepEqual(REGIONS.filter((r) => layoutShows('debug', r)), ['editor', 'results']);
});

check('the arrangement is a separate rule: Study is a workbench, Debug is two columns', () => {
  assert.deepEqual(
    LAYOUTS.map((option) => [option.id, layoutArrangement(option.id)]),
    [
      ['study', 'workbench'],
      ['write', 'stack'],
      ['read', 'stack'],
      ['debug', 'columns'],
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

check('the preset this build renamed still opens on the same two columns', () => {
  globalThis.localStorage = fakeStorage({ [STORAGE_KEY_LAYOUT]: 'split' });
  try {
    assert.equal(readLayout(), 'debug', 'Split is Debug, not a reset to Study');
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
  assert.equal(layoutShortcutFor('Digit4'), 'debug');
  assert.equal(layoutShortcutFor('1'), 'study');
  assert.equal(layoutShortcutFor('3'), 'read');
  assert.equal(layoutShortcutFor('4'), 'debug');
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
  // No float noise in a CSS value, and the two shares are the whole percent the separator
  // announces: a drag cannot leave a boundary at 34.5% that reads as 34 on one side and 35 on the
  // other.
  assert.equal(splitGridTemplate(1 / 3), 'minmax(0, 0.33fr) minmax(0, 0.67fr)');
  assert.equal(splitRatioPercent(0.345), 35);
  assert.equal(clampSplitRatio(0.345), 0.35, 'the ratio is the announced percent, exactly');
  assert.equal(splitGridTemplate(clampSplitRatio(0.345)), 'minmax(0, 0.35fr) minmax(0, 0.65fr)');
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

section('docking');

check('the defaults are the arrangement the app has always shipped', () => {
  assert.deepEqual(DEFAULT_DOCK, { lesson: 'left', results: 'right' });
  assert.deepEqual(readDock(), DEFAULT_DOCK, 'with no storage the defaults are the dock');
});

check('the one button names the panel this preset can move, and the other side', () => {
  const study = dockControl(DEFAULT_DOCK, 'study');
  assert.equal(study.region, 'lesson');
  assert.equal(study.side, 'right', 'lesson text on the left offers to move right');
  assert.match(study.label, /Lesson .* Right/);
  assert.match(study.title, /lesson text/);

  const debug = dockControl(DEFAULT_DOCK, 'debug');
  assert.equal(debug.region, 'results');
  assert.equal(debug.side, 'left', 'results on the right offer to move left');
  assert.match(debug.label, /Results .* Left/);
  assert.match(debug.title, /results/);

  // A panel already on the other side offers the way back, with its own words.
  assert.match(dockControl({ lesson: 'right', results: 'left' }, 'study').label, /Lesson .* Left/);
  assert.match(dockControl({ lesson: 'right', results: 'left' }, 'debug').label, /Results .* Right/);

  // Write and Read have nothing beside anything: no button, rather than one that does nothing.
  assert.equal(dockControl(DEFAULT_DOCK, 'write'), null);
  assert.equal(dockControl(DEFAULT_DOCK, 'read'), null);
});

check('a flip moves only the panel the preset is showing', () => {
  assert.deepEqual(flippedDock(DEFAULT_DOCK, 'study'), { lesson: 'right', results: 'right' });
  assert.deepEqual(flippedDock(DEFAULT_DOCK, 'debug'), { lesson: 'left', results: 'left' });
  assert.deepEqual(flippedDock(DEFAULT_DOCK, 'write'), DEFAULT_DOCK, 'Write has nothing to move');
  assert.deepEqual(flippedDock(DEFAULT_DOCK, 'read'), DEFAULT_DOCK, 'Read has nothing to move');
  assert.deepEqual(
    flippedDock({ lesson: 'right', results: 'left' }, 'study'),
    { lesson: 'left', results: 'left' },
    'the flip returns to where it started'
  );
});

check('the dock is remembered, one field at a time', () => {
  assert.equal(typeof globalThis.localStorage, 'undefined', 'this check assumes no global storage');
  assert.deepEqual(writeDock(DEFAULT_DOCK), DEFAULT_DOCK, 'with no store the side still applies');

  globalThis.localStorage = fakeStorage();
  try {
    assert.deepEqual(readDock(), DEFAULT_DOCK, 'an empty store is the defaults');
    assert.deepEqual(writeDock({ lesson: 'right', results: 'left' }), { lesson: 'right', results: 'left' });
    assert.equal(
      globalThis.localStorage.data.get(STORAGE_KEY_DOCK),
      '{"lesson":"right","results":"left"}'
    );
    assert.deepEqual(readDock(), { lesson: 'right', results: 'left' });
    // Junk is per field: a side this build does not know does not forget the other one.
    assert.deepEqual(normalizeDock({ lesson: 'up', results: 'left' }), { lesson: 'left', results: 'left' });
    assert.deepEqual(normalizeDock({ lesson: 'right' }), { lesson: 'right', results: 'right' });
    // The old chooser dock is the reading pane's dock: the side a learner chose carries over.
    assert.deepEqual(normalizeDock({ list: 'right', results: 'left' }), { lesson: 'right', results: 'left' });
    for (const junk of ['', '   ', 'banana', 'null', '[]', '{"list":"top"}']) {
      globalThis.localStorage.data.set(STORAGE_KEY_DOCK, junk);
      assert.deepEqual(readDock(), DEFAULT_DOCK, `stored ${JSON.stringify(junk)}`);
    }
  } finally {
    delete globalThis.localStorage;
  }
});

check('a store that throws costs the memory, not the dock', () => {
  globalThis.localStorage = {
    getItem() {
      throw new Error('SecurityError');
    },
    setItem() {
      throw new Error('QuotaExceededError');
    },
  };
  try {
    assert.deepEqual(readDock(), DEFAULT_DOCK);
    assert.deepEqual(writeDock({ lesson: 'right', results: 'left' }), { lesson: 'right', results: 'left' });
  } finally {
    delete globalThis.localStorage;
  }
});

check('a docked-left results column gets the second track, not the editor’s share', () => {
  // The number is always the editor's share: at 42% the editor keeps 42 whether it is the first
  // track or the second.
  assert.equal(splitGridTemplate(0.42, 'right'), 'minmax(0, 0.42fr) minmax(0, 0.58fr)');
  assert.equal(splitGridTemplate(0.42, 'left'), 'minmax(0, 0.58fr) minmax(0, 0.42fr)');
  assert.equal(splitGridTemplate(0.5), splitGridTemplate(0.5, 'right'), 'the default is unchanged');
  assert.equal(splitGridTemplate(0.1, 'left'), 'minmax(0, 0.7fr) minmax(0, 0.3fr)', 'the clamp holds');
});

check('a pointer is measured from the editor’s side of the boundary', () => {
  assert.equal(splitRatioAt(700, 100, 1000, 'right'), 0.6);
  assert.equal(splitRatioAt(700, 100, 1000, 'left'), 0.4, 'the same pixel, the other track');
  assert.equal(splitRatioAt(600, 100, 1000, 'left'), 0.5);
  assert.equal(splitRatioAt(0, 100, 1000, 'left'), SPLIT_MAX_RATIO, 'outside clamps, still');
  assert.equal(splitRatioAt(5000, 100, 1000, 'left'), SPLIT_MIN_RATIO);
  assert.equal(splitRatioAt(700, 100, 0, 'left'), null);
});

check('the keys move the handle, and the announcement is still the editor', () => {
  // Docked left, the editor is the right-hand track: the left arrow hands it room.
  assert.equal(splitRatioAfterKey(0.5, 'ArrowLeft', false, 'left'), 0.5 + SPLIT_KEY_STEP);
  assert.equal(splitRatioAfterKey(0.5, 'ArrowRight', false, 'left'), 0.5 - SPLIT_KEY_STEP);
  assert.equal(splitRatioAfterKey(0.5, 'ArrowLeft', true, 'left'), 0.6);
  // Home is the container's left edge, which is the editor at its widest when the results are left.
  assert.equal(splitRatioAfterKey(0.5, 'Home', false, 'left'), SPLIT_MAX_RATIO);
  assert.equal(splitRatioAfterKey(0.5, 'End', false, 'left'), SPLIT_MIN_RATIO);
  assert.equal(splitRatioAfterKey(SPLIT_MAX_RATIO, 'ArrowLeft', false, 'left'), SPLIT_MAX_RATIO);
  assert.equal(splitRatioAfterKey(0.5, 'ArrowUp', false, 'left'), null);
  assert.equal(splitRatioAfterKey(0.5, 'ArrowLeft'), 0.5 - SPLIT_KEY_STEP, 'the right-docked rules are unchanged');
});

console.log(`layout presets: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exitCode = 1;
