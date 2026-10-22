#!/usr/bin/env node
/**
 * Vim keys: the preference and the mode word (`scripts/test_vim.mjs`, `npm run test:vim`)
 *
 * The keymap itself is `@replit/codemirror-vim` and the browser suite drives it, because a keymap is
 * only true of a focused editor. What is pinned here is the half that has nothing to do with Vim:
 *
 * 1. **Off unless asked, and remembered when asked.** A first visit that opened with normal mode would
 *    read a beginner's first `i` as a command and show them nothing; a remembered `on` has to survive
 *    the reload, which is a storage key and nothing else.
 * 2. **Blocked storage costs the memory, never the control.** The toggle still answers with what to
 *    render, the same rule focus mode, watch mode and the layout presets follow.
 * 3. **The mode word is always a word.** Vim opens in normal mode and the plugin says nothing until
 *    the first change, so an absent mode is `NORMAL` rather than an empty badge; the two visual
 *    sub-modes arrive as two words and print as one line; a mode this page has never heard of is
 *    printed honestly instead of being folded into one it knows.
 *
 * Run: node --experimental-strip-types scripts/test_vim.mjs
 */

import assert from 'node:assert/strict';
import {
  STORAGE_KEY_VIM,
  VIM_LABEL,
  readVim,
  vimHint,
  vimModeLabel,
  writeVim,
} from '../app/src/vimMode.ts';

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

console.log('vim keys');

check('no storage at all is off, and the toggle still answers', () => {
  assert.equal(typeof globalThis.localStorage, 'undefined', 'this suite assumes no global storage');
  assert.equal(readVim(), false);
  assert.equal(writeVim(true), true);
});

check('the preference is written where the reader looks, and read back', () => {
  globalThis.localStorage = fakeStorage();
  try {
    assert.equal(readVim(), false, 'an empty store is off');
    assert.equal(writeVim(true), true);
    assert.equal(globalThis.localStorage.data.get(STORAGE_KEY_VIM), 'on');
    assert.equal(readVim(), true);
    assert.equal(writeVim(false), false);
    assert.equal(globalThis.localStorage.data.get(STORAGE_KEY_VIM), 'off');
    assert.equal(readVim(), false);
  } finally {
    delete globalThis.localStorage;
  }
});

check('a stored value that is not one of ours is off', () => {
  globalThis.localStorage = fakeStorage({ [STORAGE_KEY_VIM]: 'yes' });
  try {
    assert.equal(readVim(), false);
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
    assert.equal(readVim(), false);
    assert.equal(writeVim(true), true);
  } finally {
    delete globalThis.localStorage;
  }
});

check('the mode word: normal until the plugin says otherwise', () => {
  assert.equal(vimModeLabel(''), 'NORMAL', 'an absent mode is the mode vim opens in');
  assert.equal(vimModeLabel(null), 'NORMAL');
  assert.equal(vimModeLabel(undefined), 'NORMAL');
  assert.equal(vimModeLabel('normal'), 'NORMAL');
  assert.equal(vimModeLabel('insert'), 'INSERT');
  assert.equal(vimModeLabel('replace'), 'REPLACE');
});

check('visual sub-modes print on one line, and an unknown mode is not renamed', () => {
  assert.equal(vimModeLabel('visual'), 'VISUAL');
  assert.equal(vimModeLabel('visual line'), 'VISUAL LINE');
  assert.equal(vimModeLabel('visual  block'), 'VISUAL BLOCK', 'whitespace collapses, never a gap');
  assert.equal(vimModeLabel('operator-pending'), 'OPERATOR-PENDING');
});

check('the controls say what they do, in the state they are in', () => {
  assert.ok(VIM_LABEL.length > 0, 'the toolbar button needs a label');
  const off = vimHint(false);
  const on = vimHint(true);
  assert.notEqual(off, on, 'the title has to change with the state');
  assert.match(off, /Escape/, 'the off hint says how the keys read');
  assert.match(on, /Vim keys are on/, 'the on hint says what is on');
});

console.log(`vim keys: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exitCode = 1;
