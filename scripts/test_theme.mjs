#!/usr/bin/env node
/**
 * Theme rules, checked without a browser (`scripts/test_theme.mjs`, `npm run test:theme`)
 *
 * `app/src/theme.ts` is pure enough for Node to strip the types and run it, with
 * happy-dom supplying the `<html>` element, `localStorage` and `matchMedia` the
 * module deliberately guards for. What this suite pins down:
 *
 *   - first visit: no stored key, so `prefers-color-scheme` decides;
 *   - the OS only keeps deciding while the learner has not picked a side;
 *   - a pick is written, survives a reload, and wins over the OS afterwards;
 *   - a corrupt or hand-edited stored value falls back to the OS, not to a crash;
 *   - `applyTheme` sets `data-theme`, `color-scheme` and the `theme-color` meta,
 *     which is what the stylesheet and the phone's address bar read;
 *   - a private-mode `localStorage` that throws neither breaks the toggle nor
 *     stops the attribute from being applied.
 *
 * Run: node --experimental-strip-types scripts/test_theme.mjs
 */

import assert from 'node:assert/strict';
import { Window } from 'happy-dom';
import {
  STORAGE_KEY_THEME,
  applyTheme,
  currentChoice,
  currentTheme,
  followsSystem,
  parseChoice,
  prefersDark,
  readChoice,
  resolveTheme,
  saveChoice,
  toggleLabel,
  toggleTheme,
  watchSystemTheme,
} from '../app/src/theme.ts';

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

/** A fresh browser: new <html>, new storage, and a media query that reports `dark`. */
function freshBrowser({ dark = false, store = true } = {}) {
  const window = new Window({ url: 'https://example.test/' });
  window.document.head.innerHTML =
    '<meta name="theme-color" content="#070b12"><meta name="color-scheme" content="dark light">';
  window.matchMedia = (query) => ({
    matches: query.includes('dark') ? dark : !dark,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
  });
  if (!store) {
    Object.defineProperty(window, 'localStorage', {
      get() {
        throw new Error('SecurityError: localStorage is disabled');
      },
    });
  }
  globalThis.window = window;
  globalThis.document = window.document;
  globalThis.localStorage = store ? window.localStorage : undefined;
  return window;
}

console.log('theme');

check('first visit with no stored key follows the OS: light', () => {
  freshBrowser({ dark: false });
  assert.equal(readChoice(), 'system');
  assert.equal(currentTheme(), 'light');
});

check('first visit with no stored key follows the OS: dark', () => {
  freshBrowser({ dark: true });
  assert.equal(currentTheme(), 'dark');
});

check('a stored pick wins over the OS', () => {
  const window = freshBrowser({ dark: false });
  window.localStorage.setItem(STORAGE_KEY_THEME, 'dark');
  assert.equal(readChoice(), 'dark');
  assert.equal(currentTheme(), 'dark');
});

check('a corrupt stored value falls back to the OS instead of throwing', () => {
  const window = freshBrowser({ dark: true });
  window.localStorage.setItem(STORAGE_KEY_THEME, 'sepia');
  assert.equal(readChoice(), 'system');
  assert.equal(currentTheme(), 'dark');
  assert.equal(parseChoice('LIGHT'), 'system');
  assert.equal(parseChoice(null), 'system');
});

check('a pick is persisted and flips the visible theme', () => {
  const window = freshBrowser({ dark: false });
  saveChoice('dark');
  assert.equal(window.localStorage.getItem(STORAGE_KEY_THEME), 'dark');
  assert.equal(currentTheme(), 'dark');
  // The toggle is a two-state switch: whatever is on screen, the next state is the other one.
  assert.equal(toggleTheme('dark'), 'light');
  assert.equal(toggleTheme('light'), 'dark');
  assert.equal(toggleLabel('dark'), 'Switch to light theme');
  assert.equal(toggleLabel('light'), 'Switch to dark theme');
});

check('applyTheme writes the attribute, the colour scheme and the browser chrome colour', () => {
  const window = freshBrowser();
  applyTheme('light');
  assert.equal(window.document.documentElement.getAttribute('data-theme'), 'light');
  assert.equal(window.document.documentElement.style.colorScheme, 'light');
  assert.equal(
    window.document.querySelector('meta[name="theme-color"]').getAttribute('content'),
    '#f8f6f2'
  );
  applyTheme('dark');
  assert.equal(window.document.documentElement.getAttribute('data-theme'), 'dark');
  assert.equal(window.document.documentElement.style.colorScheme, 'dark');
  assert.equal(
    window.document.querySelector('meta[name="theme-color"]').getAttribute('content'),
    '#070b12'
  );
});

check('system is the only choice that tracks the OS', () => {
  assert.equal(followsSystem('system'), true);
  assert.equal(followsSystem('light'), false);
  assert.equal(followsSystem('dark'), false);
  assert.equal(resolveTheme('system', false), 'light');
  assert.equal(resolveTheme('system', true), 'dark');
});

check('the system watcher only exists while the choice is system, and reports flips', () => {
  const window = freshBrowser({ dark: false });
  let handlers = [];
  window.matchMedia = (query) => ({
    matches: false,
    media: query,
    addEventListener: (_type, handler) => handlers.push(handler),
    removeEventListener: (_type, handler) => {
      handlers = handlers.filter((candidate) => candidate !== handler);
    },
  });
  const seen = [];
  const stop = watchSystemTheme((dark) => seen.push(dark));
  assert.equal(handlers.length, 1, 'one change listener must be registered');
  handlers[0]({ matches: true });
  assert.deepEqual(seen, [true]);
  stop();
  assert.equal(handlers.length, 0, 'the listener must be removed on cleanup');
});

check('a private-mode storage that throws leaves the theme working', () => {
  freshBrowser({ dark: true, store: false });
  assert.equal(readChoice(), 'system');
  saveChoice('light'); // must not throw
  assert.equal(currentTheme(), 'dark', 'nothing was stored, so the OS still decides');
  applyTheme('light');
  assert.equal(document.documentElement.getAttribute('data-theme'), 'light');
});

check('no window at all (server render) resolves to the dark default', () => {
  delete globalThis.window;
  delete globalThis.document;
  delete globalThis.localStorage;
  assert.equal(prefersDark(), true);
  assert.equal(currentTheme(), 'dark');
  assert.equal(currentChoice(), 'system');
  applyTheme('light'); // must be a no-op, not a crash
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
