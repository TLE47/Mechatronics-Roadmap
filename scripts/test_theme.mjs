#!/usr/bin/env node
/**
 * Theme rules, checked without a browser (`scripts/test_theme.mjs`, `npm run test:theme`)
 *
 * `app/src/theme.ts` is pure enough for Node to strip the types and run it, with
 * happy-dom supplying the `<html>` element, `localStorage` and `matchMedia` the
 * module deliberately guards for. What this suite pins down:
 *
 *   - first visit: no stored key, so the OS decides — and `prefers-contrast: more`
 *     outranks `prefers-color-scheme`, because that is the reader who needs it;
 *   - the OS only keeps deciding while the learner has not picked a side;
 *   - a pick is written, survives a reload, and wins over the OS afterwards;
 *   - a corrupt or hand-edited stored value falls back to the OS, not to a crash;
 *   - the flip is dark ↔ light (from high contrast or paper: back to the OS palette) and
 *     the contrast and paper buttons are real on/offs; each names the palette it hands over;
 *   - paper is never the OS's pick — it is a stored preference and nothing else;
 *   - `applyTheme` sets `data-theme`, `color-scheme` and the `theme-color` meta,
 *     which is what the stylesheet and the phone's address bar read;
 *   - a private-mode `localStorage` that throws neither breaks the control nor
 *     stops the attribute from being applied.
 *
 * Run: node --experimental-strip-types scripts/test_theme.mjs
 */

import assert from 'node:assert/strict';
import { Window } from 'happy-dom';
import {
  CONTRAST_LABEL,
  PAPER_LABEL,
  STORAGE_KEY_THEME,
  applyTheme,
  contrastHint,
  paperHint,
  togglePaper,
  currentChoice,
  currentTheme,
  defaultTheme,
  followsSystem,
  parseChoice,
  prefersContrast,
  prefersDark,
  readChoice,
  resolveTheme,
  saveChoice,
  themeLabel,
  themeShortLabel,
  toggleContrast,
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

/** A fresh browser: new <html>, new storage, and media queries for colour scheme and contrast. */
function freshBrowser({ dark = false, contrast = false, store = true } = {}) {
  const window = new Window({ url: 'https://example.test/' });
  window.document.head.innerHTML =
    '<meta name="theme-color" content="#070b12"><meta name="color-scheme" content="dark light">';
  window.matchMedia = (query) => ({
    matches: query.includes('contrast') ? contrast : dark,
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

check('a request for more contrast outranks the colour scheme on a first visit', () => {
  // The palette exists for a reader who asked the OS for contrast; making them find a
  // three-state button first would be the one audience that cannot read the page it is on.
  freshBrowser({ dark: true, contrast: true });
  assert.equal(prefersContrast(), true);
  assert.equal(currentTheme(), 'contrast');
  freshBrowser({ dark: false, contrast: true });
  assert.equal(currentTheme(), 'contrast');
  freshBrowser({ dark: true, contrast: false });
  assert.equal(currentTheme(), 'dark');
});

check('a stored pick wins over the OS', () => {
  const window = freshBrowser({ dark: false });
  window.localStorage.setItem(STORAGE_KEY_THEME, 'dark');
  assert.equal(readChoice(), 'dark');
  assert.equal(currentTheme(), 'dark');
  window.localStorage.setItem(STORAGE_KEY_THEME, 'contrast');
  assert.equal(currentTheme(), 'contrast');
  window.localStorage.setItem(STORAGE_KEY_THEME, 'paper');
  assert.equal(readChoice(), 'paper');
  assert.equal(currentTheme(), 'paper', 'a stored paper pick wins over the OS like any other');
});

check('a corrupt stored value falls back to the OS instead of throwing', () => {
  const window = freshBrowser({ dark: true });
  window.localStorage.setItem(STORAGE_KEY_THEME, 'sepia');
  assert.equal(readChoice(), 'system');
  assert.equal(currentTheme(), 'dark');
  assert.equal(parseChoice('LIGHT'), 'system');
  assert.equal(parseChoice(null), 'system');
});

check('the flip is dark ↔ light and names the palette it hands over', () => {
  const window = freshBrowser({ dark: false });
  saveChoice('contrast');
  assert.equal(window.localStorage.getItem(STORAGE_KEY_THEME), 'contrast');
  assert.equal(currentTheme(), 'contrast');
  assert.equal(toggleTheme('dark', 'dark'), 'light');
  assert.equal(toggleTheme('light', 'dark'), 'dark');
  // From high contrast the flip means "back to normal": the OS palette, whichever side it is.
  assert.equal(toggleTheme('contrast', 'light'), 'light');
  assert.equal(toggleTheme('contrast', 'dark'), 'dark');
  // Paper is on the same rule: the flip means "back to normal", not "the other special palette".
  assert.equal(toggleTheme('paper', 'light'), 'light');
  assert.equal(toggleTheme('paper', 'dark'), 'dark');
  assert.equal(defaultTheme(false), 'light');
  assert.equal(defaultTheme(true), 'dark');
  assert.equal(themeLabel('dark', 'dark'), 'Switch to light theme');
  assert.equal(themeLabel('light', 'dark'), 'Switch to dark theme');
  assert.equal(themeLabel('contrast', 'light'), 'Switch to light theme');
  assert.equal(themeLabel('paper', 'dark'), 'Switch to dark theme');
  // The word drawn beside the flip's icon names the same palette as the label above.
  assert.equal(themeShortLabel('dark', 'dark'), 'Light');
  assert.equal(themeShortLabel('light', 'dark'), 'Dark');
});

check('the contrast control is a real on/off, and says what it does', () => {
  // A pressed state is only honest if the control has one state to press: this is why high
  // contrast is a button of its own rather than a third step on the flip.
  assert.equal(toggleContrast('dark', 'dark'), 'contrast');
  assert.equal(toggleContrast('light', 'light'), 'contrast');
  assert.equal(toggleContrast('contrast', 'dark'), 'dark');
  assert.equal(toggleContrast('contrast', 'light'), 'light');
  // The two on/off palettes are independent switches: each one replaces whatever is on screen.
  assert.equal(toggleContrast('paper', 'light'), 'contrast');
  assert.equal(togglePaper('contrast', 'dark'), 'paper');
  assert.equal(togglePaper('dark', 'dark'), 'paper');
  assert.equal(togglePaper('light', 'light'), 'paper');
  assert.equal(togglePaper('paper', 'dark'), 'dark', 'pressing paper off must return to the OS palette');
  assert.equal(PAPER_LABEL, 'Paper');
  assert.match(paperHint('dark'), /cream/, 'the hint must say what the palette buys you');
  assert.match(paperHint('paper'), /is on/, 'the hint must say when pressing turns it off');
  assert.equal(CONTRAST_LABEL, 'High contrast');
  assert.match(contrastHint('dark'), /7:1/, 'the hint must say what the palette buys you');
  assert.match(contrastHint('contrast'), /is on/, 'the hint must say when pressing turns it off');
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
  // High contrast is a dark palette: a light `color-scheme` would paint every native
  // control white inside its black panels.
  applyTheme('contrast');
  assert.equal(window.document.documentElement.getAttribute('data-theme'), 'contrast');
  assert.equal(window.document.documentElement.style.colorScheme, 'dark');
  assert.equal(
    window.document.querySelector('meta[name="theme-color"]').getAttribute('content'),
    '#000000'
  );
  // Paper is a light palette: its native chrome, scrollbars and form controls stay light.
  applyTheme('paper');
  assert.equal(window.document.documentElement.getAttribute('data-theme'), 'paper');
  assert.equal(window.document.documentElement.style.colorScheme, 'light');
  assert.equal(
    window.document.querySelector('meta[name="theme-color"]').getAttribute('content'),
    '#efe4d0'
  );
});

check('system is the only choice that tracks the OS', () => {
  assert.equal(followsSystem('system'), true);
  assert.equal(followsSystem('light'), false);
  assert.equal(followsSystem('dark'), false);
  assert.equal(followsSystem('contrast'), false);
  assert.equal(followsSystem('paper'), false);
  assert.equal(resolveTheme('system', false), 'light');
  assert.equal(resolveTheme('system', true), 'dark');
  assert.equal(resolveTheme('system', false, true), 'contrast');
  // Paper is never the OS's answer: no query asks for it, so only a pick can reach it.
  assert.equal(resolveTheme('paper', true, true), 'paper', 'a paper pick beats both OS queries');
  assert.equal(resolveTheme('system', true, false), 'dark');
  // A pick wins even when the OS asks for more contrast.
  assert.equal(resolveTheme('light', true, true), 'light');
});

check('the system watcher only exists while the choice is system, and reports both queries', () => {
  const window = freshBrowser({ dark: false });
  // A live MediaQueryList: its `matches` flips and then it fires the change event, which is
  // exactly what the watcher reads (the event object alone is not the state).
  const queries = {};
  window.matchMedia = (query) => {
    const key = query.includes('contrast') ? 'contrast' : 'dark';
    if (!queries[key]) {
      queries[key] = {
        matches: false,
        media: query,
        handlers: [],
        addEventListener(_type, handler) {
          this.handlers.push(handler);
        },
        removeEventListener(_type, handler) {
          this.handlers = this.handlers.filter((candidate) => candidate !== handler);
        },
      };
    }
    return queries[key];
  };
  const seen = [];
  const stop = watchSystemTheme((state) => seen.push(state));
  assert.equal(queries.dark.handlers.length, 1, 'one listener for prefers-color-scheme');
  assert.equal(queries.contrast.handlers.length, 1, 'one listener for prefers-contrast');
  // Both queries are reported on every flip, so a change to either re-resolves together.
  queries.dark.matches = true;
  queries.dark.handlers[0]({ matches: true });
  assert.deepEqual(seen, [{ dark: true, moreContrast: false }]);
  queries.contrast.matches = true;
  queries.contrast.handlers[0]({ matches: true });
  assert.deepEqual(seen, [
    { dark: true, moreContrast: false },
    { dark: true, moreContrast: true },
  ]);
  stop();
  assert.equal(queries.dark.handlers.length, 0, 'the colour-scheme listener must be removed on cleanup');
  assert.equal(queries.contrast.handlers.length, 0, 'the contrast listener must be removed on cleanup');
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
  assert.equal(prefersContrast(), false);
  assert.equal(currentTheme(), 'dark');
  assert.equal(currentChoice(), 'system');
  applyTheme('light'); // must be a no-op, not a crash
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
