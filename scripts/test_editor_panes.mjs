#!/usr/bin/env node
/**
 * The editor's tabs and panes (`scripts/test_editor_panes.mjs`, `npm run test:panes`).
 *
 * The card has one body and up to two panes, and the two bugs that would hurt are both states rather
 * than pixels: a stored arrangement that fills the body with no view (a blank editor on load), and the
 * same view open in both slots (two `pre-actual-stdout` nodes, which breaks every reader that asks
 * the page for "the" output). So this suite pins the rules the component relies on:
 *
 * 1. **One view is the floor and two is the ceiling.** Nothing, junk, duplicates and a third view all
 *    normalize to a usable arrangement; the editor is always slot 0.
 * 2. **A tab press never duplicates.** Pressing the tab of a view already open focuses its slot;
 *    pressing another fills the focused slot.
 * 3. **A split opens on something new.** It offers the next view when asked for nothing, refuses to
 *    put the editor in the second pane, and closing it keeps slot 0.
 * 4. **The axis and focus survive, and are validated.** A stored `rows` and a focus on the split are
 *    remembered; a focus on an empty slot is not a state.
 * 5. **Storage is a preference, never a requirement.** No `localStorage`, a blocking one and junk JSON
 *    all read as the default, and a write returns what to render.
 *
 * Run: node --experimental-strip-types scripts/test_editor_panes.mjs
 */

import assert from 'node:assert/strict';
import {
  DEFAULT_PANES,
  EDITOR_VIEWS,
  MAX_PANES,
  STORAGE_KEY_EDITOR_PANES,
  closeSplit,
  closeView,
  focusSlot,
  isEditorView,
  isSplit,
  nextView,
  normalizePanes,
  readPanes,
  setAxis,
  showView,
  slotFor,
  splitPane,
  visibleViews,
  writePanes,
} from '../app/src/editorPanes.ts';

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
function fakeStorage(seed = {}) {
  const data = new Map(Object.entries(seed));
  return {
    data,
    getItem(key) {
      return data.has(key) ? data.get(key) : null;
    },
    setItem(key, value) {
      data.set(key, String(value));
    },
    removeItem(key) {
      data.delete(key);
    },
    clear() {
      data.clear();
    },
    key(index) {
      return [...data.keys()][index] ?? null;
    },
    get length() {
      return data.size;
    },
  };
}

section('1. One view is the floor, two is the ceiling');
check('the default is the editor alone, side-by-side when split', () => {
  assert.deepEqual(DEFAULT_PANES, { views: ['main', null], axis: 'columns', focus: 0 });
  assert.equal(isSplit(DEFAULT_PANES), false);
  assert.deepEqual(visibleViews(DEFAULT_PANES), ['main']);
});
check('nothing and junk read as the default', () => {
  for (const value of [null, undefined, 0, 'main', [], {}, { views: 'main' }, { views: [null] }]) {
    assert.deepEqual(normalizePanes(value), DEFAULT_PANES, `junk ${JSON.stringify(value)}`);
  }
});
check('duplicates are removed, so one view cannot fill both panes', () => {
  const panes = normalizePanes({ views: ['actual', 'actual'], focus: 1 });
  assert.deepEqual(panes.views, ['actual', null]);
  assert.equal(panes.focus, 0, 'a focus on the removed slot falls back to the editor');
});
check('a third view is dropped, not an error', () => {
  const panes = normalizePanes({ views: ['main', 'actual', 'expected'] });
  assert.deepEqual(panes.views, ['main', 'actual']);
  assert.equal(visibleViews(panes).length, MAX_PANES);
});
check('the reported views are the slots that exist', () => {
  assert.deepEqual(visibleViews({ views: ['expected', 'actual'], axis: 'rows', focus: 1 }), [
    'expected',
    'actual',
  ]);
});
check('the view names are the only names', () => {
  assert.deepEqual(EDITOR_VIEWS, ['main', 'predict', 'actual', 'expected']);
  assert.equal(isEditorView('actual'), true);
  assert.equal(isEditorView('predict'), true, 'the prediction gate is a view like any other');
  assert.equal(isEditorView('output'), false);
  assert.equal(isEditorView(null), false);
});

section('2. A tab press never duplicates a view');
check('pressing the view already in the other slot focuses it', () => {
  const split = splitPane(DEFAULT_PANES, 'actual');
  assert.equal(split.focus, 1);
  const back = showView(split, 'main');
  assert.deepEqual(back.views, ['main', 'actual'], 'the arrangement is unchanged');
  assert.equal(back.focus, 0, 'the press moves the focus, not the view');
});
check('pressing a new view fills the focused slot', () => {
  const split = splitPane(DEFAULT_PANES, 'actual');
  const swapped = showView(split, 'expected');
  assert.deepEqual(swapped.views, ['main', 'expected']);
  assert.equal(swapped.focus, 1);
});
check('with no split, a tab press replaces the body', () => {
  const shown = showView(DEFAULT_PANES, 'expected');
  assert.deepEqual(shown.views, ['expected', null]);
  assert.equal(shown.focus, 0);
});
check('slotFor names the slot, or nothing', () => {
  const split = splitPane(DEFAULT_PANES, 'actual');
  assert.equal(slotFor(split, 'main'), 0);
  assert.equal(slotFor(split, 'actual'), 1);
  assert.equal(slotFor(split, 'expected'), null);
});

section('3. A split opens on something new');
check('an unsplit body splits on the next view that is not the editor', () => {
  const panes = splitPane(DEFAULT_PANES);
  assert.deepEqual(panes.views, ['main', 'actual']);
  assert.equal(panes.focus, 1);
  assert.equal(isSplit(panes), true);
});
check('asking for the editor in the second pane is refused', () => {
  assert.deepEqual(splitPane(DEFAULT_PANES, 'main').views, ['main', 'actual']);
});
check('asking for a view replaces the second pane, not a third', () => {
  const split = splitPane(DEFAULT_PANES, 'actual');
  assert.deepEqual(splitPane(split, 'expected').views, ['main', 'expected']);
  assert.deepEqual(splitPane(split, 'actual').views, ['main', 'actual']);
});
check('splitting from an output brings the editor back beside it', () => {
  const outputOnly = { views: ['expected', null], axis: 'columns', focus: 0 };
  const panes = splitPane(outputOnly);
  assert.deepEqual(panes.views, ['expected', 'main']);
  assert.deepEqual(splitPane({ views: ['actual', null], axis: 'columns', focus: 0 }).views, [
    'actual',
    'main',
  ]);
  assert.equal(nextView('main'), 'predict', 'Predict sits between the code and its outputs');
  assert.equal(nextView('expected'), 'main', 'the list wraps');
});
check('a split can open on the prediction gate', () => {
  const panes = splitPane(DEFAULT_PANES, 'predict');
  assert.deepEqual(panes.views, ['main', 'predict']);
  assert.equal(panes.focus, 1);
});
check('closing the split keeps the editor where it was', () => {
  const split = splitPane({ views: ['actual', null], axis: 'rows', focus: 0 }, 'expected');
  assert.deepEqual(closeSplit(split).views, ['actual', null]);
  assert.equal(closeSplit(split).focus, 0);
});
check('closing one view keeps the other half of a split', () => {
  const split = { views: ['main', 'predict'], axis: 'columns', focus: 1 };
  assert.deepEqual(closeView(split, 'predict').views, ['main', null]);
  assert.deepEqual(closeView(split, 'main').views, ['predict', null], 'the second slot is promoted');
  assert.equal(closeView(split, 'main').focus, 0);
  assert.deepEqual(closeView(split, 'expected').views, ['main', 'predict'], 'not open, not closed');
});
check('closing the only view falls back to the editor', () => {
  assert.deepEqual(closeView({ views: ['predict', null], axis: 'rows', focus: 0 }, 'predict').views, [
    'main',
    null,
  ]);
  assert.equal(closeView({ views: ['predict', null], axis: 'rows', focus: 0 }, 'predict').axis, 'rows');
});
check('the axis survives, and only two axes exist', () => {
  assert.equal(setAxis(DEFAULT_PANES, 'rows').axis, 'rows');
  assert.equal(normalizePanes({ axis: 'diagonal' }).axis, 'columns');
  assert.equal(normalizePanes({ axis: 'rows' }).axis, 'rows');
});
check('a focus on an empty slot is not a state', () => {
  assert.equal(focusSlot(DEFAULT_PANES, 1).focus, 0);
  assert.equal(normalizePanes({ views: ['main'], focus: 1 }).focus, 0);
  assert.equal(focusSlot({ views: ['main', 'actual'], axis: 'columns', focus: 0 }, 1).focus, 1);
});

section('4. The remembered arrangement is validated, not trusted');
check('no storage at all reads as the default', () => {
  assert.equal(typeof globalThis.localStorage, 'undefined', 'this suite assumes no global storage');
  assert.deepEqual(readPanes(), DEFAULT_PANES);
});
check('a written arrangement round-trips', () => {
  globalThis.localStorage = fakeStorage();
  try {
    const written = writePanes({ views: ['main', 'expected'], axis: 'rows', focus: 1 });
    assert.deepEqual(written.views, ['main', 'expected']);
    assert.equal(globalThis.localStorage.data.get(STORAGE_KEY_EDITOR_PANES), JSON.stringify(written));
    assert.deepEqual(readPanes(), written);
  } finally {
    delete globalThis.localStorage;
  }
});
check('junk JSON and a blocking store fall back to the default', () => {
  globalThis.localStorage = fakeStorage({ [STORAGE_KEY_EDITOR_PANES]: '{not json' });
  try {
    assert.deepEqual(readPanes(), DEFAULT_PANES);
  } finally {
    delete globalThis.localStorage;
  }
  globalThis.localStorage = {
    getItem() {
      throw new Error('blocked');
    },
    setItem() {
      throw new Error('blocked');
    },
  };
  try {
    assert.deepEqual(readPanes(), DEFAULT_PANES);
    const written = writePanes({ views: ['main', 'actual'], axis: 'columns', focus: 1 });
    assert.deepEqual(written.views, ['main', 'actual'], 'the caller still gets a value to render');
  } finally {
    delete globalThis.localStorage;
  }
});
check('a stored duplicate is repaired on read', () => {
  globalThis.localStorage = fakeStorage({
    [STORAGE_KEY_EDITOR_PANES]: JSON.stringify({ views: ['actual', 'actual'], focus: 1 }),
  });
  try {
    assert.deepEqual(readPanes().views, ['actual', null]);
  } finally {
    delete globalThis.localStorage;
  }
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exitCode = 1;
