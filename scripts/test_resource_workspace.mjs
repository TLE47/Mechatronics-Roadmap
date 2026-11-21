#!/usr/bin/env node
/**
 * The workspace's own persistence and divider arithmetic
 * (`scripts/test_resource_workspace.mjs`, `npm run test:workspace`).
 *
 * This is deliberately not a test of the reader. It pins the small pure functions that decide how
 * much of the split the lesson gets, what a drag is allowed to ask for, and how a hand-edited
 * localStorage value becomes a usable arrangement again. The browser suite proves the DOM contract.
 */

import assert from 'node:assert/strict';
import {
  RESOURCE_RATIO_MAX,
  RESOURCE_RATIO_MIN,
  RESOURCE_WORKSPACE_DEFAULT,
  RESOURCE_WORKSPACE_STORAGE_KEY,
  clampResourceRatio,
  readResourceWorkspace,
  resourceRatioAfterKey,
  resourceRatioAt,
  resourceRatioPercent,
  writeResourceWorkspace,
} from '../app/src/features/learning-resources/resourceWorkspace.ts';

let passed = 0;
const ok = (message) => {
  console.log(`  ok ${message}`);
  passed += 1;
};

const store = new Map();
Object.defineProperty(globalThis, 'window', {
  configurable: true,
  value: {
    localStorage: {
      getItem: (key) => (store.has(key) ? store.get(key) : null),
      setItem: (key, value) => store.set(key, String(value)),
    },
  },
});

ok('the default split is even, unexpanded, and opens on the resource');
assert.deepEqual(RESOURCE_WORKSPACE_DEFAULT, { ratio: 0.5, expanded: false, mobilePane: 'resource' });
assert.deepEqual(readResourceWorkspace(), RESOURCE_WORKSPACE_DEFAULT);

ok('the ratio is clamped to the 30-70% band');
assert.equal(clampResourceRatio(0.9), RESOURCE_RATIO_MAX);
assert.equal(clampResourceRatio(0.1), RESOURCE_RATIO_MIN);
assert.equal(clampResourceRatio('0.42'), 0.42);
assert.equal(clampResourceRatio('half'), 0.5);
assert.equal(clampResourceRatio(Number.NaN), 0.5);
assert.equal(resourceRatioPercent(0.505), 51);

ok('a drag cannot invert the panes');
assert.equal(resourceRatioAt(500, 0, 1000), 0.5);
assert.equal(resourceRatioAt(0, 0, 1000), RESOURCE_RATIO_MIN);
assert.equal(resourceRatioAt(1000, 0, 1000), RESOURCE_RATIO_MAX);
assert.equal(resourceRatioAt(200, 100, 400), 0.3);
assert.equal(resourceRatioAt(Number.NaN, 0, 1000), null);
assert.equal(resourceRatioAt(500, 0, 0), null);

ok('arrow keys move by 2%, shift by 10%, and Home/End snap');
assert.equal(resourceRatioAfterKey(0.5, 'ArrowRight'), 0.52);
assert.equal(resourceRatioAfterKey(0.5, 'ArrowLeft'), 0.48);
assert.equal(resourceRatioAfterKey(0.5, 'ArrowRight', true), 0.6);
assert.equal(resourceRatioAfterKey(0.5, 'Home'), RESOURCE_RATIO_MIN);
assert.equal(resourceRatioAfterKey(0.5, 'End'), RESOURCE_RATIO_MAX);
assert.equal(resourceRatioAfterKey(0.5, 'Enter'), null);

ok('writes are clamped and read back; only the changed field moves');
writeResourceWorkspace({ ratio: 0.66, expanded: true });
assert.deepEqual(readResourceWorkspace(), { ratio: 0.66, expanded: true, mobilePane: 'resource' });
writeResourceWorkspace({ mobilePane: 'lesson' });
assert.deepEqual(readResourceWorkspace(), { ratio: 0.66, expanded: true, mobilePane: 'lesson' });

ok('a hand-edited value falls back to a usable arrangement');
store.set(RESOURCE_WORKSPACE_STORAGE_KEY, '{"ratio":9,"expanded":"yes","mobilePane":"other"}');
assert.deepEqual(readResourceWorkspace(), {
  ratio: RESOURCE_RATIO_MAX,
  expanded: false,
  mobilePane: 'resource',
});
store.set(RESOURCE_WORKSPACE_STORAGE_KEY, 'not json');
assert.deepEqual(readResourceWorkspace(), RESOURCE_WORKSPACE_DEFAULT);
store.set(RESOURCE_WORKSPACE_STORAGE_KEY, '[]');
assert.deepEqual(readResourceWorkspace(), RESOURCE_WORKSPACE_DEFAULT);

ok('a full localStorage does not throw');
const blocked = {
  getItem: () => null,
  setItem: () => {
    throw new Error('QuotaExceededError');
  },
};
Object.defineProperty(globalThis, 'window', { configurable: true, value: { localStorage: blocked } });
assert.deepEqual(writeResourceWorkspace({ ratio: 0.4 }), {
  ratio: 0.4,
  expanded: false,
  mobilePane: 'resource',
});

console.log(`\n${passed} passed, 0 failed`);
