#!/usr/bin/env node
/**
 * The sheet's keys, without a browser (`scripts/test_keymap.mjs`, `npm run test:keymap`)
 *
 * A rebinder is a store with a keyboard in front of it, and everything that can go wrong with one
 * is a rule, not a pixel:
 *
 * 1. **The shipped keys are the keys the app already answered.** The defaults must print exactly the
 *    strings the sheet has always shown, or a learner reads a key that does nothing.
 * 2. **A chord is physical and platform-free.** ⌘K on a Mac and Ctrl+K on a PC are one chord, and
 *    Shift is not part of it unless it was pressed — otherwise every ⌘⇧ key would answer to ⌘.
 * 3. **A refusal leaves the map alone.** A clash, a browser key, a bare letter and a key with no
 *    printable name are each refused *with their own sentence*, and the old chord still works.
 * 4. **A stored map is read field by field.** One action from another build, or one chord the rules
 *    now refuse, falls back to its default and leaves the other five alone; a duplicate keeps the
 *    first action in reading order.
 * 5. **The sheet prints the map, not the table.** `shortcutRows(map)` is what the dialog draws, so a
 *    rebind has to reach it, and the six remappable rows are exactly the six actions.
 *
 * Run: node --experimental-strip-types scripts/test_keymap.mjs
 */

import assert from 'node:assert/strict';
import {
  ACTION_NAMES,
  DEFAULT_KEYMAP,
  KEYMAP_ACTIONS,
  STORAGE_KEY_KEYMAP,
  actionForEvent,
  chordFromEvent,
  chordMatches,
  formatChord,
  isDefaultKeymap,
  isFormattableCode,
  isSymbolChar,
  keymapIssue,
  keymapSnapshot,
  normalizeKeymap,
  readKeymap,
  rebind,
  resetKeymap,
  writeKeymap,
} from '../app/src/keymap.ts';
import { SHORTCUT_ROWS, shortcutRows } from '../app/src/shortcuts.ts';

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

function fakeStorage(initial = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (key) => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => data.set(key, String(value)),
    data,
  };
}

/** A keypress as the DOM would report it. `code` is the physical key; `key` is what it types. */
const press = (code, { mod = false, alt = false, shift = false, key = '' } = {}) => ({
  code,
  key,
  metaKey: mod,
  ctrlKey: false,
  altKey: alt,
  shiftKey: shift,
});
/** The chord that press is — what `rebind` and `keymapIssue` take. */
const key = (code, mods) => chordFromEvent(press(code, mods));

console.log('keymap');

check('the shipped keys are the ones the sheet has always printed', () => {
  const printed = Object.fromEntries(
    KEYMAP_ACTIONS.map((action) => [action, formatChord(DEFAULT_KEYMAP[action])])
  );
  assert.deepEqual(printed, {
    palette: '⌘K',
    lessons: '⌘P',
    search: '⌘⇧F',
    sheet: '?',
    run: '⌘↵',
    focus: '⌘.',
  });
  // The table is the sheet's own copy: the two must not drift apart.
  for (const row of SHORTCUT_ROWS) {
    if (!row.keymapAction) continue;
    assert.equal(
      formatChord(DEFAULT_KEYMAP[row.keymapAction]),
      row.keys,
      `${row.keymapAction}'s row says ${row.keys}`
    );
  }
});

check('⌘ on a Mac and Ctrl on a PC are one chord', () => {
  assert.deepEqual(chordFromEvent({ code: 'KeyK', metaKey: true }), DEFAULT_KEYMAP.palette);
  assert.deepEqual(chordFromEvent({ code: 'KeyK', ctrlKey: true }), DEFAULT_KEYMAP.palette);
  assert.deepEqual(chordFromEvent({ code: 'KeyK', metaKey: true, ctrlKey: true }), DEFAULT_KEYMAP.palette);
  // Modifier-only presses are half a chord, not a chord.
  assert.equal(chordFromEvent({ code: 'ShiftLeft', shiftKey: true }), null);
  assert.equal(chordFromEvent({}), null);
  // Shift is exact: ⌘K and ⌘⇧K are different keys.
  assert.equal(chordMatches(DEFAULT_KEYMAP.palette, press('KeyK', { mod: true, shift: true })), false);
  assert.equal(chordMatches(DEFAULT_KEYMAP.palette, press('KeyK', { mod: true })), true);
  assert.equal(chordMatches(DEFAULT_KEYMAP.palette, press('KeyJ', { mod: true })), false);
});

check('a press finds the action it is bound to, and nothing else', () => {
  const map = DEFAULT_KEYMAP;
  assert.equal(actionForEvent(map, press('KeyK', { mod: true })), 'palette');
  assert.equal(actionForEvent(map, press('KeyP', { mod: true })), 'lessons');
  assert.equal(actionForEvent(map, press('KeyP', { mod: true, shift: true })), null);
  assert.equal(actionForEvent(map, press('KeyF', { mod: true, shift: true })), 'search');
  // The sheet's key is a character, not Shift+Slash: a French keyboard types `?` without Shift, and
  // a synthetic press reports no Shift at all. Both must open it.
  assert.equal(actionForEvent(map, press('Slash', { shift: true, key: '?' })), 'sheet');
  assert.equal(actionForEvent(map, press('Slash', { key: '?', shift: false })), 'sheet', 'no Shift reported');
  assert.equal(actionForEvent(map, press('Slash', { key: '/' })), null, 'a slash is not the sheet');
  assert.equal(actionForEvent(map, press('Enter', { mod: true })), 'run');
  assert.equal(actionForEvent(map, press('Period', { mod: true })), 'focus');
  // Typing is not a shortcut, even when the character is one the sheet prints.
  assert.equal(actionForEvent(map, press('KeyK')), null);
  assert.equal(actionForEvent(map, press('Slash')), null);
  assert.equal(actionForEvent(map, press('Enter')), null);
});

check('a chord prints the way a keyboard is labelled', () => {
  assert.equal(formatChord(DEFAULT_KEYMAP.sheet), '?', 'a character shortcut prints the character');
  assert.equal(formatChord({ code: 'Slash', char: '/', mod: false, alt: false, shift: false }), '/');
  assert.equal(formatChord({ code: 'Slash', mod: true, alt: false, shift: true }), '⌘⇧/', 'with a modifier it is a slash');
  assert.equal(formatChord({ code: 'KeyJ', mod: true, alt: true, shift: true }), '⌘⌥⇧J');
  assert.equal(formatChord({ code: 'Digit4', mod: false, alt: true, shift: false }), '⌥4');
  assert.equal(formatChord({ code: 'Enter', mod: true, alt: false, shift: false }), '⌘↵');
  assert.equal(formatChord({ code: 'BracketLeft', mod: true, alt: false, shift: false }), '⌘[');
  assert.equal(formatChord({ code: 'Space', mod: false, alt: false, shift: false }), 'Space');
});

check('only keys this sheet can name are formattable', () => {
  for (const code of ['KeyA', 'KeyZ', 'Digit0', 'Numpad9', 'Enter', 'Slash', 'ArrowUp', 'F1', 'F12']) {
    assert.equal(isFormattableCode(code), true, code);
  }
  for (const code of ['', 'F13', 'IntlBackslash', 'Unidentified', 'Key', 'Digit', 'Abc']) {
    assert.equal(isFormattableCode(code), false, code);
  }
});

section('rebinding');

check('a rebind moves the action and frees its old key', () => {
  const result = rebind(DEFAULT_KEYMAP, 'palette', key('KeyP', { mod: true, shift: true }));
  assert.equal(result.error, null);
  assert.equal(actionForEvent(result.keymap, press('KeyP', { mod: true, shift: true })), 'palette');
  assert.equal(actionForEvent(result.keymap, press('KeyK', { mod: true })), null, 'the old key is free');
  // The constant is untouched: a rebind is a new map, not a mutation of the shipped one.
  assert.equal(formatChord(DEFAULT_KEYMAP.palette), '⌘K');
});

check('a clash is refused, names the action that has the key, and changes nothing', () => {
  const result = rebind(DEFAULT_KEYMAP, 'focus', key('KeyK', { mod: true }));
  assert.match(result.error, /⌘K is already the palette/);
  assert.equal(result.keymap, DEFAULT_KEYMAP, 'the map must come back untouched');
  assert.equal(actionForEvent(result.keymap, press('Period', { mod: true })), 'focus', 'the old chord still works');
  assert.equal(ACTION_NAMES.palette, 'the palette');
});

check('the sheet’s own key can be a different symbol', () => {
  const slash = rebind(DEFAULT_KEYMAP, 'sheet', key('Slash', { key: '/' }));
  assert.equal(slash.error, null);
  assert.equal(formatChord(slash.keymap.sheet), '/');
  assert.equal(actionForEvent(slash.keymap, press('Slash', { key: '/' })), 'sheet');
  assert.equal(actionForEvent(slash.keymap, press('Slash', { key: '?' })), null, 'the old character is free');
  // The default key is still the same chord, so binding it back is not a no-op refusal.
  assert.equal(rebind(slash.keymap, 'sheet', key('Slash', { key: '?' })).error, null);
});

check('the keys a shortcut may not take say so in their own words', () => {
  const cases = [
    [key('Escape'), /keyboard itself/],
    [key('Tab'), /keyboard itself/],
    [key('F9'), /keyboard itself/],
    [key('KeyK'), /needs ⌘ or ⌥/],
    [key('KeyK', { shift: true }), /needs ⌘ or ⌥/],
    [key('KeyR', { mod: true }), /browser/],
    [key('Digit2', { mod: true }), /browser/],
    [key('IntlBackslash', { mod: true }), /no name/],
  ];
  for (const [chord, message] of cases) {
    const result = rebind(DEFAULT_KEYMAP, 'focus', chord);
    assert.match(result.error ?? '', message, `${formatChord(chord)} must be refused`);
    assert.equal(result.keymap, DEFAULT_KEYMAP);
  }
  // The one bare-key exception ships that way, so a stored default is not "invalid"...
  assert.equal(keymapIssue(DEFAULT_KEYMAP.sheet, 'sheet'), null);
  assert.equal(isSymbolChar('?'), true);
  assert.equal(isSymbolChar('/'), true);
  assert.equal(isSymbolChar('a'), false);
  assert.equal(isSymbolChar('1'), false);
  // ...and it is the sheet's alone: a character shortcut on another action is typing.
  assert.match(keymapIssue(key('Slash', { key: '?' }), 'focus') ?? '', /needs ⌘ or ⌥/);
  assert.match(keymapIssue(key('KeyA'), 'sheet') ?? '', /needs ⌘ or ⌥/);
  // ...and ⌥ or ⌘ with a reserved key is still the browser's, not the app's.
  assert.match(keymapIssue(key('KeyW', { mod: true })) ?? '', /browser/);
  assert.equal(keymapIssue(key('KeyW', { alt: true })), null, '⌥W is nobody’s shortcut');
});

check('a map is only the defaults when every action still has its own key', () => {
  assert.equal(isDefaultKeymap(DEFAULT_KEYMAP), true);
  const moved = rebind(DEFAULT_KEYMAP, 'focus', key('KeyJ', { mod: true, shift: true }));
  assert.equal(moved.error, null);
  assert.equal(isDefaultKeymap(moved.keymap), false);
  assert.deepEqual(normalizeKeymap(moved.keymap), moved.keymap, 'a valid map survives normalization');
});

section('the store');

check('a rebind is remembered, and a reset puts every key back', () => {
  globalThis.localStorage = fakeStorage();
  try {
    writeKeymap({ ...DEFAULT_KEYMAP, focus: { code: 'KeyJ', mod: true, alt: false, shift: true } });
    assert.equal(globalThis.localStorage.data.has(STORAGE_KEY_KEYMAP), true);
    assert.equal(formatChord(readKeymap().focus), '⌘⇧J');
    assert.deepEqual(keymapSnapshot(), readKeymap(), 'the snapshot is what handlers read');
    resetKeymap();
    assert.equal(formatChord(readKeymap().focus), '⌘.', 'reset writes the defaults');
    assert.equal(isDefaultKeymap(keymapSnapshot()), true);
  } finally {
    delete globalThis.localStorage;
  }
});

check('a stored map is read field by field, and junk keeps the rest', () => {
  // One good field, one key the palette no longer holds (so lessons may take it), and one the
  // sheet cannot print.
  assert.deepEqual(
    normalizeKeymap({
      palette: { code: 'KeyP', mod: true, shift: true },
      lessons: { code: 'KeyK', mod: true },
      focus: { code: 'IntlBackslash', mod: true },
    }),
    {
      ...DEFAULT_KEYMAP,
      palette: { code: 'KeyP', mod: true, alt: false, shift: true },
      lessons: { code: 'KeyK', mod: true, alt: false, shift: false },
    }
  );
  // Two actions on one stored key: the first in reading order keeps it, the later one defaults.
  assert.deepEqual(
    normalizeKeymap({
      palette: { code: 'KeyJ', mod: true },
      // `lessons` is second in KEYMAP_ACTIONS, and ⌘J is not its default: duplicate refused.
      lessons: { code: 'KeyJ', mod: true },
    }),
    { ...DEFAULT_KEYMAP, palette: { code: 'KeyJ', mod: true, alt: false, shift: false } }
  );
  assert.deepEqual(normalizeKeymap(null), DEFAULT_KEYMAP);
  assert.deepEqual(normalizeKeymap('banana'), DEFAULT_KEYMAP);
  // A character shortcut is stored for the sheet and refused for anything else.
  assert.deepEqual(
    normalizeKeymap({ sheet: { code: 'Slash', char: '/', mod: false, alt: false, shift: false } }),
    { ...DEFAULT_KEYMAP, sheet: { code: 'Slash', char: '/', mod: false, alt: false, shift: false } }
  );
  assert.deepEqual(
    normalizeKeymap({ focus: { code: 'Slash', char: '?', mod: false, alt: false, shift: false } }),
    DEFAULT_KEYMAP
  );
});

check('a store that throws, or holds junk, costs the memory and never the key', () => {
  assert.equal(typeof globalThis.localStorage, 'undefined', 'this check assumes no global storage');
  assert.deepEqual(readKeymap(), DEFAULT_KEYMAP);
  assert.deepEqual(writeKeymap(DEFAULT_KEYMAP), DEFAULT_KEYMAP, 'with no store a rebind still applies');

  globalThis.localStorage = fakeStorage();
  try {
    for (const junk of ['', '   ', 'banana', 'null', '[]', '{']) {
      globalThis.localStorage.data.set(STORAGE_KEY_KEYMAP, junk);
      assert.deepEqual(readKeymap(), DEFAULT_KEYMAP, `stored ${JSON.stringify(junk)}`);
    }
  } finally {
    delete globalThis.localStorage;
  }

  globalThis.localStorage = {
    getItem() {
      throw new Error('SecurityError');
    },
    setItem() {
      throw new Error('QuotaExceededError');
    },
  };
  try {
    assert.deepEqual(readKeymap(), DEFAULT_KEYMAP);
    assert.deepEqual(writeKeymap(DEFAULT_KEYMAP), DEFAULT_KEYMAP);
  } finally {
    delete globalThis.localStorage;
  }
});

section('the sheet');

check('every remappable action has one row, and the fixed rows say so', () => {
  const withAction = SHORTCUT_ROWS.filter((row) => row.keymapAction).map((row) => row.keymapAction);
  assert.deepEqual(withAction.sort(), [...KEYMAP_ACTIONS].sort());
  assert.equal(new Set(withAction).size, withAction.length, 'one row per action');
  assert.equal(
    SHORTCUT_ROWS.length,
    12,
    'the sheet keeps its rows: the fixed ones are what a rebinder does not touch'
  );
});

check('the sheet prints the map, so a rebind reaches the row', () => {
  assert.equal(isDefaultKeymap(DEFAULT_KEYMAP), true, 'the sheet default counts as default');
  const moved = { ...DEFAULT_KEYMAP, focus: { code: 'KeyJ', mod: true, alt: false, shift: true } };
  const rows = shortcutRows(moved);
  const focusRow = rows.find((row) => row.keymapAction === 'focus');
  assert.equal(focusRow.keys, '⌘⇧J');
  // The fixed rows are untouched, and so is the sheet's own order.
  assert.deepEqual(
    rows.filter((row) => !row.keymapAction).map((row) => row.keys),
    SHORTCUT_ROWS.filter((row) => !row.keymapAction).map((row) => row.keys)
  );
  // No argument is the shipped table: that is what the palette suite pins.
  assert.equal(shortcutRows(), SHORTCUT_ROWS);
});

check('no two rows print the same key, before or after a rebind', () => {
  const unique = (rows) => {
    const keys = rows.map((row) => row.keys);
    assert.equal(new Set(keys).size, keys.length, `two rows print ${keys.filter((k, i) => keys.indexOf(k) !== i).join(', ')}`);
  };
  unique(shortcutRows());
  const moved = rebind(DEFAULT_KEYMAP, 'palette', key('KeyJ', { mod: true })).keymap;
  unique(shortcutRows(moved));
});

console.log(`\nkeymap: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exitCode = 1;
