#!/usr/bin/env node
/**
 * The merge rules behind cloud sync, checked without a browser, a network or a Supabase project.
 *
 * `progressMerge.ts` imports nothing but a type, so Node can strip the types and run it directly:
 *   node --experimental-strip-types scripts/test_progress_merge.mjs
 *
 * The cases are the four ways a learner's two devices can disagree, plus the shape check that keeps a
 * hand-edited or older row from being trusted.
 */

import assert from 'node:assert/strict';
import {
  emptyProgress,
  isProgressSnapshot,
  mergeLearningLog,
  mergeProgress,
  PROGRESS_SCHEMA,
} from '../app/src/progressMerge.ts';

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

const base = (overrides = {}) => ({
  ...emptyProgress(),
  updatedAt: 1000,
  ...overrides,
});

console.log('progress merge');

check('a fresh browser keeps the account\'s completions', () => {
  const local = base({ updatedAt: 2000 });
  const remote = base({
    updatedAt: 1000,
    verifiedLessons: { '00.1': true },
    completedMilestones: { m1: true },
  });
  const merged = mergeProgress(local, remote);
  assert.equal(merged.verifiedLessons['00.1'], true);
  assert.equal(merged.completedMilestones.m1, true);
  assert.equal(merged.updatedAt, 2000);
});

check('an uncheck on the newer side sticks', () => {
  const local = base({ updatedAt: 3000, completedMilestones: { m1: false, m2: true } });
  const remote = base({ updatedAt: 2000, completedMilestones: { m1: true, m3: true } });
  const merged = mergeProgress(local, remote);
  assert.equal(merged.completedMilestones.m1, undefined, 'm1 was un-ticked on the newer device');
  assert.equal(merged.completedMilestones.m2, true);
  assert.equal(merged.completedMilestones.m3, true, 'the other device\'s work is never dropped');
});

check('an older false does not erase a newer true', () => {
  const local = base({ updatedAt: 4000, verifiedLessons: { '01.2': true } });
  const remote = base({ updatedAt: 1000, verifiedLessons: { '01.2': false } });
  assert.equal(mergeProgress(local, remote).verifiedLessons['01.2'], true);
});

check('equal timestamps treat the local copy as newer, without losing remote work', () => {
  const local = base({ verifiedLessons: { a: true } });
  const remote = base({ verifiedLessons: { b: true } });
  const merged = mergeProgress(local, remote);
  assert.deepEqual(merged.verifiedLessons, { a: true, b: true });
});

check('neither input is mutated', () => {
  const local = base({ updatedAt: 5000, verifiedLessons: { a: true } });
  const remote = base({ updatedAt: 1000, verifiedLessons: { b: true } });
  const localCopy = JSON.stringify(local);
  const remoteCopy = JSON.stringify(remote);
  mergeProgress(local, remote);
  assert.equal(JSON.stringify(local), localCopy);
  assert.equal(JSON.stringify(remote), remoteCopy);
});

console.log('learning log merge');

check('events are unioned, de-duplicated and ordered by time', () => {
  const a = [
    { t: 30, kind: 'run', lesson: '00.1', outcome: 'verified' },
    { t: 10, kind: 'lesson_open', lesson: '00.1' },
  ];
  const b = [
    { t: 10, kind: 'lesson_open', lesson: '00.1' },
    { t: 20, kind: 'hint', lesson: '00.1', level: 2 },
  ];
  const merged = mergeLearningLog(a, b);
  assert.deepEqual(
    merged.map((event) => event.t),
    [10, 20, 30]
  );
  assert.equal(merged.length, 3, 'the shared lesson_open appears once');
});

check('an empty log on either side is fine', () => {
  assert.deepEqual(mergeLearningLog([], []), []);
});

console.log('snapshot shape');

check('the current schema is accepted', () => {
  assert.equal(isProgressSnapshot(base()), true);
});

check('an older or hand-edited row is refused', () => {
  assert.equal(isProgressSnapshot({ ...base(), schema: 'mechalab.progress/0' }), false);
  assert.equal(isProgressSnapshot({ ...base(), learningLog: 'nope' }), false);
  assert.equal(isProgressSnapshot(null), false);
  assert.equal(isProgressSnapshot({ schema: PROGRESS_SCHEMA }), false);
});

console.log(`\n${failed === 0 ? 'OK' : 'FAILED'}: ${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
