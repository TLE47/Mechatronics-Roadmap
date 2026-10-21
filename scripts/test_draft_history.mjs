#!/usr/bin/env node
/**
 * A run files the code it started from (`scripts/test_draft_history.mjs`).
 *
 * `app/src/draftHistory.ts` is the store behind the runner's History panel, and its promises are the
 * ones a browser test cannot make on purpose: the starter is never filed, the same text run twice stays
 * one version with the newer verdict, the fifth attempt pushes the first out, a paste past the cap is
 * refused, a store over budget loses its oldest attempt anywhere, a store written by an older version
 * reads as the entries it can prove, and blocked storage loses history without losing the editor.
 *
 * Run: node --experimental-strip-types scripts/test_draft_history.mjs (`npm run test:history`)
 */

import assert from 'node:assert/strict';
import { Window } from 'happy-dom';
import {
  MAX_HISTORY_CHARS,
  MAX_SNAPSHOTS_PER_LESSON,
  MAX_SNAPSHOT_CHARS,
  STORAGE_KEY_HISTORY,
  clearHistory,
  historyChars,
  readHistory,
  recordSnapshot,
  snapshotAgeLabel,
  snapshotsFor,
  verdictLabel,
} from '../app/src/draftHistory.ts';
import { PYTHON_LESSONS } from '../app/src/data/pythonLessonsData.ts';

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

/** A fresh browser: working storage, one that throws on access, or none at all. */
function freshBrowser({ store = 'works' } = {}) {
  const window = new Window({ url: 'https://example.test/' });
  if (store === 'throws') {
    Object.defineProperty(window, 'localStorage', {
      get() {
        throw new Error('SecurityError: localStorage is disabled');
      },
    });
  }
  globalThis.window = window;
  globalThis.document = window.document;
  if (store === 'absent') {
    delete globalThis.localStorage;
  } else if (store === 'throws') {
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      get() {
        throw new Error('SecurityError: localStorage is disabled');
      },
    });
  } else {
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      writable: true,
      value: window.localStorage,
    });
  }
  return window;
}

const LESSON = PYTHON_LESSONS[0];
const OTHER = PYTHON_LESSONS[1];
const THIRD = PYTHON_LESSONS[2];
const ATTEMPT_1 = `${LESSON.starterCode}\nprint("first attempt")\n`;
const ATTEMPT_2 = `${LESSON.starterCode}\nprint("second attempt")\n`;

console.log('draft history');

check('a run files its code, its verdict and when it ran', () => {
  freshBrowser();
  recordSnapshot(LESSON.id, ATTEMPT_1, 'mismatch', 1_000);
  const versions = snapshotsFor(LESSON.id);
  assert.equal(versions.length, 1);
  assert.equal(versions[0].code, ATTEMPT_1);
  assert.equal(versions[0].outcome, 'mismatch');
  assert.equal(versions[0].at, 1_000);
});

check('the untouched starter is never filed - Reset Starter already restores it', () => {
  freshBrowser();
  recordSnapshot(LESSON.id, LESSON.starterCode, 'mismatch', 1_000);
  recordSnapshot(LESSON.id, `   \n\n`, 'error', 1_001);
  assert.deepEqual(snapshotsFor(LESSON.id), []);
});

check('the same text run twice is one version, carrying the newer verdict', () => {
  freshBrowser();
  recordSnapshot(LESSON.id, ATTEMPT_1, 'mismatch', 1_000);
  recordSnapshot(LESSON.id, ATTEMPT_1, 'verified', 2_000);
  const versions = snapshotsFor(LESSON.id);
  assert.equal(versions.length, 1, 'a second Run on the same text must not add a version');
  assert.equal(versions[0].outcome, 'verified');
  assert.equal(versions[0].at, 2_000);
});

check('newest first, and the sixth attempt drops the first', () => {
  freshBrowser();
  for (let attempt = 0; attempt < MAX_SNAPSHOTS_PER_LESSON + 1; attempt += 1) {
    recordSnapshot(LESSON.id, `${LESSON.starterCode}\nprint(${attempt})\n`, 'mismatch', 1_000 + attempt);
  }
  const versions = snapshotsFor(LESSON.id);
  assert.equal(versions.length, MAX_SNAPSHOTS_PER_LESSON);
  assert.ok(
    versions[0].code.trimEnd().endsWith('print(5)'),
    `newest must be first; got ${versions[0].code.trimEnd().split('\n').pop()}`
  );
  assert.ok(
    versions.every((version) => !version.code.trimEnd().endsWith('print(0)')),
    'the first attempt must be the one evicted'
  );
});

check('one lesson never reads another lesson\'s versions', () => {
  freshBrowser();
  recordSnapshot(LESSON.id, ATTEMPT_1, 'mismatch', 1_000);
  recordSnapshot(OTHER.id, ATTEMPT_2, 'verified', 1_100);
  assert.equal(snapshotsFor(LESSON.id).length, 1);
  assert.equal(snapshotsFor(OTHER.id).length, 1);
  assert.equal(snapshotsFor(LESSON.id)[0].code, ATTEMPT_1);
  clearHistory(LESSON.id);
  assert.equal(snapshotsFor(LESSON.id).length, 0);
  assert.equal(snapshotsFor(OTHER.id).length, 1, 'forgetting one lesson must keep the others');
});

check('a paste past the per-snapshot cap is not filed', () => {
  freshBrowser();
  recordSnapshot(LESSON.id, 'x'.repeat(MAX_SNAPSHOT_CHARS + 1), 'mismatch', 1_000);
  assert.deepEqual(snapshotsFor(LESSON.id), []);
});

check('a store over the global budget loses the oldest attempt anywhere', () => {
  freshBrowser();
  const big = (tag) => `${tag}${'y'.repeat(MAX_SNAPSHOT_CHARS - tag.length)}`;
  for (let attempt = 0; attempt < MAX_SNAPSHOTS_PER_LESSON; attempt += 1) {
    recordSnapshot(LESSON.id, big(`a${attempt}`), 'mismatch', 1_000 + attempt);
    recordSnapshot(OTHER.id, big(`b${attempt}`), 'mismatch', 2_000 + attempt);
  }
  recordSnapshot(THIRD.id, big('c'), 'verified', 3_000);
  assert.ok(
    historyChars(readHistory()) <= MAX_HISTORY_CHARS,
    `history must fit ${MAX_HISTORY_CHARS} chars, holds ${historyChars(readHistory())}`
  );
  assert.equal(snapshotsFor(THIRD.id).length, 1, 'the newest attempt must survive');
  assert.equal(snapshotsFor(OTHER.id).length, MAX_SNAPSHOTS_PER_LESSON, 'the newer lesson must keep all five');
  assert.equal(
    snapshotsFor(LESSON.id).length,
    MAX_SNAPSHOTS_PER_LESSON - 1,
    'the oldest attempt in the store is the one dropped'
  );
  assert.ok(
    snapshotsFor(LESSON.id).every((version) => !version.code.startsWith('a0')),
    'the oldest of the oldest must be gone'
  );
});

check('a corrupt, truncated or foreign store reads as what it can prove', () => {
  freshBrowser();
  localStorage.setItem(STORAGE_KEY_HISTORY, 'not json');
  assert.deepEqual(readHistory(), {});
  localStorage.setItem(STORAGE_KEY_HISTORY, JSON.stringify([1, 2, 3]));
  assert.deepEqual(readHistory(), {});
  localStorage.setItem(
    STORAGE_KEY_HISTORY,
    JSON.stringify({
      [LESSON.id]: [
        { code: 'kept', at: 5, outcome: 'verified' },
        { code: 'no timestamp' },
        'nonsense',
        { code: 'second', at: 6 },
      ],
      [OTHER.id]: 'not a list',
    })
  );
  const history = readHistory();
  assert.deepEqual(history[LESSON.id], [
    { code: 'kept', at: 5, outcome: 'verified' },
    { code: 'second', at: 6, outcome: 'untested' },
  ]);
  assert.equal(history[OTHER.id], undefined);
});

check('blocked or absent storage loses history without losing the editor', () => {
  for (const store of ['throws', 'absent']) {
    freshBrowser({ store });
    assert.doesNotThrow(() => recordSnapshot(LESSON.id, ATTEMPT_1, 'mismatch', 1_000));
    assert.deepEqual(readHistory(), {});
    assert.doesNotThrow(() => clearHistory());
  }
  freshBrowser({ store: 'throws' });
  const returned = recordSnapshot(LESSON.id, ATTEMPT_1, 'mismatch', 1_000);
  assert.equal(returned[LESSON.id].length, 1, 'the in-memory answer is still usable this session');
});

check('the list reads "just now", "3 min ago", "2 h ago", "3 d ago"', () => {
  const now = 1_000_000_000;
  assert.equal(snapshotAgeLabel(now, now), 'just now');
  assert.equal(snapshotAgeLabel(now - 30_000, now), 'just now');
  assert.equal(snapshotAgeLabel(now - 180_000, now), '3 min ago');
  assert.equal(snapshotAgeLabel(now - 2 * 3_600_000, now), '2 h ago');
  assert.equal(snapshotAgeLabel(now - 3 * 86_400_000, now), '3 d ago');
  // A clock that moved backwards must not print "-4 min ago".
  assert.equal(snapshotAgeLabel(now + 600_000, now), 'just now');
});

check('a verdict reads as three words at most, and an unknown one is shown as itself', () => {
  assert.equal(verdictLabel('verified'), 'passed');
  assert.equal(verdictLabel('mismatch'), 'output mismatch');
  assert.equal(verdictLabel('behavior_failed'), 'checks failed');
  assert.equal(verdictLabel('harness_failed'), 'bench failed');
  assert.equal(verdictLabel('stopped'), 'stopped');
  assert.equal(verdictLabel('error'), 'error');
  assert.equal(verdictLabel('something_new'), 'something_new');
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
