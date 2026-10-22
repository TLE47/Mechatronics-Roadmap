// Watch mode decides when a machine may spend the learner's attention, so its rules are tested rather
// than eyeballed: the states that must never run (no failure to watch, a pass, a Stop, the gate
// holding a run) are exactly the ones no browser suite can reach on demand.
import assert from 'node:assert/strict';
import {
  STORAGE_KEY_WATCH,
  WATCH_DEBOUNCE_MS,
  readWatch,
  setWatch,
  watchDecision,
} from '../app/src/watchMode.ts';

class MemoryStorage {
  constructor() {
    this.map = new Map();
    this.fail = false;
  }
  get length() {
    return this.map.size;
  }
  key(index) {
    return [...this.map.keys()][index] ?? null;
  }
  getItem(key) {
    if (this.fail) throw new Error('blocked');
    return this.map.has(key) ? this.map.get(key) : null;
  }
  setItem(key, value) {
    if (this.fail) throw new Error('blocked');
    this.map.set(key, String(value));
  }
  removeItem(key) {
    this.map.delete(key);
  }
  clear() {
    this.map.clear();
  }
}

globalThis.localStorage = new MemoryStorage();

let failures = 0;
function check(name, body) {
  try {
    body();
    console.log(`  ok  ${name}`);
  } catch (error) {
    failures += 1;
    console.log(`  FAIL ${name}\n       ${error.message}`);
  }
}

const STATE = (over) => ({
  enabled: true,
  lastVerdict: 'mismatch',
  running: false,
  gateHolding: false,
  editedSinceRun: true,
  ...over,
});

check('off is off, whatever the runner is doing', () => {
  for (const verdict of ['mismatch', 'harness_failed', 'behavior_failed', 'passed', 'untested']) {
    assert.equal(watchDecision(STATE({ enabled: false, lastVerdict: verdict })), 'off', verdict);
  }
});

check('a graded failure plus an edit runs', () => {
  for (const verdict of ['mismatch', 'harness_failed', 'behavior_failed']) {
    assert.equal(watchDecision(STATE({ lastVerdict: verdict })), 'run', verdict);
  }
});

check('an unchanged buffer never runs: the loop stops on its own verdict', () => {
  assert.equal(watchDecision(STATE({ editedSinceRun: false })), 'wait');
});

check('a pass ends the loop, and so do a Stop and a runtime error', () => {
  // A Stop is the learner saying no; a syntax error is usually mid-typing. Re-running either would be
  // the machine arguing with them.
  for (const verdict of ['passed', 'untested', 'stopped', 'error']) {
    assert.equal(watchDecision(STATE({ lastVerdict: verdict })), 'off', verdict);
  }
});

check('a run in flight waits rather than queueing a second one', () => {
  assert.equal(watchDecision(STATE({ running: true })), 'wait');
  assert.equal(watchDecision(STATE({ running: true, lastVerdict: 'passed' })), 'wait');
});

check('the predict gate wins: nothing runs while a guess is owed', () => {
  assert.equal(watchDecision(STATE({ gateHolding: true })), 'wait');
});

check('a long enough pause: the debounce is longer than the slider settle', () => {
  assert.ok(WATCH_DEBOUNCE_MS >= 1000, 'a shorter delay would fire between keystrokes');
});

check('the toggle is remembered, and defaults to off', () => {
  localStorage.clear();
  assert.equal(readWatch(), false, 'watch mode must not be on for a first visit');
  assert.equal(setWatch(true), true, 'the toggle returns the state to render');
  assert.equal(readWatch(), true);
  assert.equal(localStorage.getItem(STORAGE_KEY_WATCH), '1');
  setWatch(false);
  assert.equal(readWatch(), false);
});

check('blocked storage costs the memory, not the toggle', () => {
  localStorage.clear();
  localStorage.fail = true;
  assert.equal(readWatch(), false);
  assert.equal(setWatch(true), true, 'the toggle must still work for this visit');
  localStorage.fail = false;
  assert.equal(readWatch(), false, 'nothing was stored, and that is the honest reading');
});

if (failures) {
  console.log(`\n${failures} check(s) failed`);
  process.exit(1);
}
console.log('\ntest_watch: all checks passed');
