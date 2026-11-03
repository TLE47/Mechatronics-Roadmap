#!/usr/bin/env node
/**
 * The tab rail's fold (`scripts/test_rail_collapse.mjs`, `npm run test:rail`).
 *
 * Two questions, because the fold is two things:
 *
 * 1. **The store.** Expanded when nothing is stored, remembered after a write, expanded again after
 *    the second press, and never thrown by a storage that refuses — a blocked store costs the
 *    memory of the choice, not the button.
 * 2. **The shell is wired to it.** The rail is the thing that folds (`data-collapsed`), the toggle is
 *    its first row and reports `aria-expanded`, and the tab buttons keep a name when their text is
 *    hidden. Those are read from the source rather than a render, the way `test_runner_shape.mjs`
 *    holds the runner's shape: a suite that needs a browser for a preference can be skipped, and a
 *    suite that can be skipped is not a gate.
 *
 * Exit-code family: typed
 *     0  the store and the wiring both hold
 *     1  a finding, each named
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');

let passed = 0;
const failures = [];

function check(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`  ok ${name}`);
  } catch (error) {
    failures.push(`${name}: ${error.message}`);
    console.log(`  FAIL ${name}`);
  }
}

class MemoryStore {
  constructor() {
    this.map = new Map();
  }
  getItem(key) {
    return this.map.has(key) ? this.map.get(key) : null;
  }
  setItem(key, value) {
    this.map.set(String(key), String(value));
  }
}

const modulePath = path.join(root, 'app/src/railCollapse.ts');
const source = fs.readFileSync(modulePath, 'utf8');
const appSource = fs.readFileSync(path.join(root, 'app/src/App.tsx'), 'utf8');
const runnerSource = fs.readFileSync(
  path.join(root, 'app/src/components/tabs/TabPyodideRunner.tsx'),
  'utf8'
);
const chooserSource = fs.readFileSync(
  path.join(root, 'app/src/components/LessonChooser.tsx'),
  'utf8'
);
const foldSource = fs.readFileSync(path.join(root, 'app/src/fold.ts'), 'utf8');

const store = await import(modulePath);

check('the key is the one the app reads in older data', () => {
  assert.equal(store.STORAGE_KEY_RAIL_COLLAPSED, 'mechalab_rail_collapsed_v1');
});

check('a browser that has never folded the rail opens expanded', () => {
  globalThis.localStorage = new MemoryStore();
  assert.equal(store.readRailCollapsed(), false);
});

check('a fold is remembered, and so is the unfold', () => {
  globalThis.localStorage = new MemoryStore();
  store.writeRailCollapsed(true);
  assert.equal(globalThis.localStorage.getItem(store.STORAGE_KEY_RAIL_COLLAPSED), '1');
  assert.equal(store.readRailCollapsed(), true);
  store.writeRailCollapsed(false);
  assert.equal(globalThis.localStorage.getItem(store.STORAGE_KEY_RAIL_COLLAPSED), '0');
  assert.equal(store.readRailCollapsed(), false);
});

check('blocked storage costs the memory, not the toggle', () => {
  globalThis.localStorage = {
    getItem() {
      throw new Error('storage is blocked');
    },
    setItem() {
      throw new Error('storage is blocked');
    },
  };
  assert.equal(store.readRailCollapsed(), false);
  assert.doesNotThrow(() => store.writeRailCollapsed(true));
});

check('a page with no storage at all still reads expanded and writes quietly', () => {
  delete globalThis.localStorage;
  assert.equal(store.readRailCollapsed(), false);
  assert.doesNotThrow(() => store.writeRailCollapsed(true));
});

check('the shell reads the store at mount and saves the press', () => {
  assert.match(appSource, /import \{ readRailCollapsed, writeRailCollapsed \} from '\.\/railCollapse'/);
  assert.match(appSource, /useState<boolean>\(\(\) => readRailCollapsed\(\)\)/);
  assert.match(appSource, /writeRailCollapsed\(railCollapsed\)/);
});

check('the rail is what folds, and says so for a test and a screen reader', () => {
  assert.match(appSource, /data-collapsed=\{railCollapsed \? 'true' : 'false'\}/);
  assert.match(appSource, /data-testid="btn-rail-toggle"/);
  assert.match(appSource, /aria-expanded=\{!railCollapsed\}/);
  assert.match(appSource, /aria-controls="simulator-tab-rail"/);
  assert.match(appSource, /id="simulator-tab-rail"/);
});

check('a folded tab draws no text but keeps its name', () => {
  assert.match(appSource, /aria-label=\{railCollapsed \? `\$\{label\} — \$\{subtitle\}` : undefined\}/);
  assert.match(appSource, /railCollapsed \? ' xl:hidden' : ''/);
});

check('below xl the strip offers no fold', () => {
  assert.match(appSource, /mb-1 mt-2 hidden w-\[calc\(100%-1rem\)\][^"]*xl:flex/);
});

check('the module states why the fold exists, not only what it does', () => {
  assert.match(source, /The way back is in the same place/);
  assert.match(source, /never decides what is on screen/);
});

check('the lesson chooser folds under its own key, beside the cards', () => {
  assert.match(
    foldSource,
    /STORAGE_KEY_CHOOSER_COLLAPSED = 'mechalab_chooser_collapsed_v1'/
  );
  assert.match(runnerSource, /const chooserFold = useFold\(STORAGE_KEY_CHOOSER_COLLAPSED\)/);
});

check('the chooser card folds from its own header, and only where a strip can replace it', () => {
  assert.match(chooserSource, /data-testid="btn-lessons-collapse"/);
  assert.match(chooserSource, /aria-expanded=\{true\}/);
  assert.match(chooserSource, /aria-controls="lesson-chooser-rail"/);
  assert.match(chooserSource, /onCollapse\?: \(\) => void;/);
});

check('a folded chooser leaves a strip in the same column, with the way back', () => {
  assert.match(runnerSource, /id="lesson-chooser-rail"/);
  assert.match(runnerSource, /data-collapsed=\{chooserFold\.folded \? 'true' : 'false'\}/);
  assert.match(runnerSource, /data-testid="btn-lessons-unfold"/);
  assert.match(runnerSource, /lg:grid-cols-\[48px_minmax\(0,1fr\)\]/);
  assert.match(runnerSource, /lg:grid-cols-\[224px_minmax\(0,1fr\)\]/);
});

console.log(`\nrail collapse: ${passed} passed, ${failures.length} failed`);
for (const failure of failures) console.log(`  - ${failure}`);
process.exit(failures.length === 0 ? 0 : 1);
