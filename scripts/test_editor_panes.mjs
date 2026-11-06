#!/usr/bin/env node
/**
 * The editor's tabs and panes (`scripts/test_editor_panes.mjs`, `npm run test:panes`).
 *
 * The card has one body and up to four panes, and the two bugs that would hurt are states rather
 * than pixels: a stored arrangement that fills the body with no view (a blank editor on load), and
 * the same view open in two slots (two `pre-actual-stdout` nodes, which breaks every reader that
 * asks the page for "the" output). The suite also pins the two things a growing pane grid makes easy
 * to get wrong: adding a pane must not silently replace one, and a swap must move views without
 * duplicating them.
 *
 * Run: node --experimental-strip-types scripts/test_editor_panes.mjs
 */

import assert from 'node:assert/strict';
import {
  DEFAULT_PANES,
  EDITOR_VIEWS,
  MAX_PANES,
  STORAGE_KEY_EDITOR_PANES,
  STORAGE_KEY_STUDIO_PANES,
  STUDIO_PANES,
  closeSplit,
  closeView,
  focusSlot,
  isEditorView,
  isSplit,
  nextView,
  normalizePanes,
  paneCapacity,
  readPanes,
  setAxis,
  showView,
  slotFor,
  splitPane,
  swapPanes,
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

section('1. One view is the floor and four is the ceiling');
check('the default is the editor alone, side-by-side when split', () => {
  assert.deepEqual(DEFAULT_PANES, { views: ['main'], axis: 'columns', focus: 0 });
  assert.equal(isSplit(DEFAULT_PANES), false);
  assert.deepEqual(visibleViews(DEFAULT_PANES), ['main']);
});
check('nothing and junk read as the default', () => {
  for (const value of [null, undefined, 0, 'main', [], {}, { views: 'main' }, { views: [null] }]) {
    assert.deepEqual(normalizePanes(value), DEFAULT_PANES, `junk ${JSON.stringify(value)}`);
  }
});
check('duplicates are removed, so one view cannot fill two panes', () => {
  const panes = normalizePanes({ views: ['actual', 'actual'], focus: 1 });
  assert.deepEqual(panes.views, ['actual']);
  assert.equal(panes.focus, 0, 'a focus on the removed slot falls back to the first pane');
});
check('three and four views survive; a fifth is dropped', () => {
  const three = normalizePanes({ views: ['main', 'actual', 'expected'] });
  assert.deepEqual(three.views, ['main', 'actual', 'expected']);
  const four = normalizePanes({ views: ['main', 'actual', 'expected', 'cases', 'workflow'] });
  assert.deepEqual(four.views, ['main', 'actual', 'expected', 'cases']);
  assert.equal(visibleViews(four).length, MAX_PANES);
});
check('the view names are the only names, including requirements', () => {
  assert.deepEqual(EDITOR_VIEWS, [
    'main',
    'requirements',
    'predict',
    'actual',
    'expected',
    'cases',
    'workflow',
    'trace',
  ]);
  for (const view of EDITOR_VIEWS) assert.equal(isEditorView(view), true);
  assert.equal(isEditorView('output'), false);
  assert.equal(isEditorView(null), false);
});

section('2. A tab press never duplicates a view');
check('pressing the view already in another slot focuses it', () => {
  const split = splitPane(DEFAULT_PANES, 'actual');
  assert.equal(split.focus, 1);
  const back = showView(split, 'main');
  assert.deepEqual(back.views, ['main', 'actual'], 'the arrangement is unchanged');
  assert.equal(back.focus, 0, 'the press moves the focus, not the view');
});
check('pressing a new view fills the focused slot, not a new one', () => {
  const split = splitPane(DEFAULT_PANES, 'actual');
  const swapped = showView(split, 'expected');
  assert.deepEqual(swapped.views, ['main', 'expected']);
  assert.equal(swapped.focus, 1);
});
check('a focused third pane is the one a tab press replaces', () => {
  const split = splitPane(splitPane(DEFAULT_PANES, 'actual'), 'expected');
  const changed = showView(split, 'workflow');
  assert.deepEqual(changed.views, ['main', 'actual', 'workflow']);
  assert.equal(changed.focus, 2);
});
check('slotFor names the slot, or nothing', () => {
  const split = splitPane(DEFAULT_PANES, 'actual');
  assert.equal(slotFor(split, 'main'), 0);
  assert.equal(slotFor(split, 'actual'), 1);
  assert.equal(slotFor(split, 'expected'), null);
});

section('3. A split adds something new');
check('an unsplit body splits on the run output', () => {
  const panes = splitPane(DEFAULT_PANES);
  assert.deepEqual(panes.views, ['main', 'actual']);
  assert.equal(panes.focus, 1);
  assert.equal(isSplit(panes), true);
});
check('a second add makes a third pane instead of replacing one', () => {
  const two = splitPane(DEFAULT_PANES, 'actual');
  const three = splitPane(two, 'expected');
  assert.deepEqual(three.views, ['main', 'actual', 'expected']);
  assert.equal(three.focus, 2);
  const four = splitPane(three, 'cases');
  assert.deepEqual(four.views, ['main', 'actual', 'expected', 'cases']);
  assert.deepEqual(splitPane(four, 'workflow').views, four.views, 'the ceiling is four');
});
check('asking for a view already on screen only focuses it', () => {
  const old = { views: ['actual', 'expected'], axis: 'columns', focus: 0 };
  const panes = splitPane(old, 'actual');
  assert.deepEqual(panes.views, ['actual', 'expected']);
  assert.equal(panes.focus, 0);
});
check('splitting from an output brings the editor back beside it', () => {
  const outputOnly = { views: ['expected'], axis: 'columns', focus: 0 };
  const panes = splitPane(outputOnly);
  assert.deepEqual(panes.views, ['expected', 'main']);
  assert.equal(nextView('main'), 'requirements', 'Requirements sit between the code and its outputs');
  assert.equal(nextView('requirements'), 'predict');
  assert.equal(nextView('trace'), 'main', 'the list wraps');
});
check('a split can open on the prediction gate or the workflow', () => {
  assert.deepEqual(splitPane(DEFAULT_PANES, 'predict').views, ['main', 'predict']);
  assert.deepEqual(splitPane(DEFAULT_PANES, 'workflow').views, ['main', 'workflow']);
});
check("Add pane chooses from the surface's own views", () => {
  const studio = ['actual', 'workflow', 'trace'];
  const two = splitPane(DEFAULT_PANES, 'actual', studio);
  assert.deepEqual(two.views, ['main', 'actual']);
  assert.deepEqual(splitPane(two, undefined, studio).views, ['main', 'actual', 'workflow']);
  assert.deepEqual(
    splitPane(two, 'requirements', studio).views,
    ['main', 'actual'],
    'a view the surface does not have cannot be added'
  );
});
check('splitting from an output brings main back even when it is not a result view', () => {
  const outputOnly = { views: ['actual'], axis: 'columns', focus: 0 };
  assert.deepEqual(
    splitPane(outputOnly, undefined, ['requirements', 'actual', 'expected']).views,
    ['actual', 'main']
  );
});
check('closing the split keeps the first pane', () => {
  const split = splitPane({ views: ['actual'], axis: 'rows', focus: 0 }, 'expected');
  assert.deepEqual(closeSplit(split).views, ['actual']);
  assert.equal(closeSplit(split).focus, 0);
});
check('closing one view keeps the rest, and the last view falls back to the editor', () => {
  const three = { views: ['main', 'predict', 'expected'], axis: 'columns', focus: 2 };
  assert.deepEqual(closeView(three, 'predict').views, ['main', 'expected']);
  assert.deepEqual(closeView(three, 'main').views, ['predict', 'expected'], 'the rest stay in order');
  assert.deepEqual(closeView({ views: ['predict'], axis: 'rows', focus: 0 }, 'predict').views, ['main']);
  assert.equal(closeView({ views: ['predict'], axis: 'rows', focus: 0 }, 'predict').axis, 'rows');
});
check('the axis survives, and only two axes exist', () => {
  assert.equal(setAxis(DEFAULT_PANES, 'rows').axis, 'rows');
  assert.equal(normalizePanes({ axis: 'diagonal' }).axis, 'columns');
  assert.equal(normalizePanes({ axis: 'rows' }).axis, 'rows');
});
check('a focus on an empty slot is not a state', () => {
  assert.equal(focusSlot(DEFAULT_PANES, 1).focus, 0);
  assert.equal(normalizePanes({ views: ['main'], focus: 2 }).focus, 0);
  assert.equal(focusSlot({ views: ['main', 'actual'], axis: 'columns', focus: 0 }, 1).focus, 1);
  assert.equal(focusSlot({ views: ['main', 'actual'], axis: 'columns', focus: 0 }, 9).focus, 0);
});

section('4. Swapping panes');
check('the first pane can swap with the second', () => {
  const panes = { views: ['main', 'actual'], axis: 'columns', focus: 0 };
  assert.deepEqual(swapPanes(panes, 0, 1).views, ['actual', 'main']);
  assert.equal(swapPanes(panes, 0, 1).focus, 0, 'the focus stays on the slot the learner selected');
});
check('the first pane can swap with the third, in either axis', () => {
  const panes = { views: ['main', 'actual', 'expected'], axis: 'rows', focus: 0 };
  assert.deepEqual(swapPanes(panes, 0, 2).views, ['expected', 'actual', 'main']);
  assert.deepEqual(swapPanes(panes, 1, 2).views, ['main', 'expected', 'actual']);
  assert.equal(swapPanes(panes, 1, 2).axis, 'rows');
});
check('a bad swap is a no-op, not a duplicate', () => {
  const panes = { views: ['main', 'actual'], axis: 'columns', focus: 0 };
  assert.deepEqual(swapPanes(panes, 0, 0).views, ['main', 'actual']);
  assert.deepEqual(swapPanes(panes, 0, 4).views, ['main', 'actual']);
  assert.deepEqual(swapPanes(panes, -1, 1).views, ['main', 'actual']);
});
check('the viewport capacity follows width and height', () => {
  assert.equal(paneCapacity(390, 844), 2, 'a phone keeps two');
  assert.equal(paneCapacity(1024, 768), 2, 'a small tablet keeps two');
  assert.equal(paneCapacity(1280, 800), 3, 'a laptop gets a third');
  assert.equal(paneCapacity(1440, 900), 4, 'a large desktop gets a fourth');
  assert.equal(paneCapacity(1600, 700), 3, 'a short window does not earn four');
  assert.equal(paneCapacity(Number.NaN, Number.NaN), 3, 'junk dimensions fall back to a laptop');
});

section('5. The remembered arrangement is validated, not trusted');
check('no storage at all reads as the default', () => {
  assert.equal(typeof globalThis.localStorage, 'undefined', 'this suite assumes no global storage');
  assert.deepEqual(readPanes(), DEFAULT_PANES);
});
check('a written four-pane arrangement round-trips', () => {
  globalThis.localStorage = fakeStorage();
  try {
    const written = writePanes({ views: ['main', 'expected', 'cases', 'actual'], axis: 'rows', focus: 2 });
    assert.deepEqual(written.views, ['main', 'expected', 'cases', 'actual']);
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
    assert.deepEqual(readPanes().views, ['actual']);
  } finally {
    delete globalThis.localStorage;
  }
});

section('A second surface, a second key');
check('a first studio visit opens the card code above the run output', () => {
  globalThis.localStorage = fakeStorage();
  try {
    assert.deepEqual(readPanes(STORAGE_KEY_STUDIO_PANES, STUDIO_PANES), STUDIO_PANES);
    assert.deepEqual(STUDIO_PANES.views, ['main', 'actual']);
    assert.equal(STUDIO_PANES.axis, 'rows');
  } finally {
    delete globalThis.localStorage;
  }
});
check('a corrupt studio value falls back to the studio default, not a blank card', () => {
  for (const stored of ['{not json', 'null', '[]', '{}', '{"views":[]}', '{"views":["bogus"]}']) {
    globalThis.localStorage = fakeStorage({ [STORAGE_KEY_STUDIO_PANES]: stored });
    try {
      assert.deepEqual(readPanes(STORAGE_KEY_STUDIO_PANES, STUDIO_PANES), STUDIO_PANES, stored);
    } finally {
      delete globalThis.localStorage;
    }
  }
});
check('a partial studio value keeps what it can and borrows the default axis', () => {
  globalThis.localStorage = fakeStorage({
    [STORAGE_KEY_STUDIO_PANES]: JSON.stringify({ views: ['main'], axis: 'diagonal' }),
  });
  try {
    const panes = readPanes(STORAGE_KEY_STUDIO_PANES, STUDIO_PANES);
    assert.deepEqual(panes.views, ['main']);
    assert.equal(panes.axis, 'rows', 'an unknown axis keeps the studio card on its own default');
  } finally {
    delete globalThis.localStorage;
  }
});
check('a closed output pane is a remembered arrangement, not a reset', () => {
  globalThis.localStorage = fakeStorage();
  try {
    const closed = writePanes(
      { views: ['main'], axis: 'rows', focus: 0 },
      STORAGE_KEY_STUDIO_PANES
    );
    assert.deepEqual(closed.views, ['main']);
    assert.deepEqual(readPanes(STORAGE_KEY_STUDIO_PANES, STUDIO_PANES), closed);
  } finally {
    delete globalThis.localStorage;
  }
});
check('arranging one editor never moves the other', () => {
  const lesson = { views: ['actual', 'main'], axis: 'columns', focus: 1 };
  globalThis.localStorage = fakeStorage({ [STORAGE_KEY_EDITOR_PANES]: JSON.stringify(lesson) });
  try {
    writePanes({ views: ['main'], axis: 'rows', focus: 0 }, STORAGE_KEY_STUDIO_PANES);
    assert.deepEqual(readPanes(), normalizePanes(lesson), 'the lesson arrangement is untouched');

    const studio = { views: ['main', 'actual'], axis: 'rows', focus: 1 };
    writePanes(studio, STORAGE_KEY_STUDIO_PANES);
    writePanes({ views: ['expected'], axis: 'columns', focus: 0 }, STORAGE_KEY_EDITOR_PANES);
    assert.deepEqual(
      readPanes(STORAGE_KEY_STUDIO_PANES, STUDIO_PANES),
      normalizePanes(studio),
      'the studio arrangement is untouched'
    );
  } finally {
    delete globalThis.localStorage;
  }
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exitCode = 1;
