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
import {
  withCurrentLessonIds,
} from '../app/src/progressMerge.ts';
import {
  canonicalLessonId,
  migrateRenamedLessonIds,
  RENAMES_MARKER_KEY,
  RENAMES_MARKER_VALUE,
  renameLessonMap,
} from '../app/src/lessonRenames.ts';

/** The slice of `Storage` the migration uses, so the test needs no browser. */
class MemoryStorage {
  #data = new Map();
  get length() {
    return this.#data.size;
  }
  key(index) {
    return [...this.#data.keys()][index] ?? null;
  }
  getItem(key) {
    return this.#data.has(key) ? this.#data.get(key) : null;
  }
  setItem(key, value) {
    this.#data.set(key, String(value));
  }
  removeItem(key) {
    this.#data.delete(key);
  }
}

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

console.log('reset watermark');

check('a newer reset drops the older side\'s flags and log', () => {
  const remote = base({
    updatedAt: 1000,
    verifiedLessons: { '00.1': true },
    completedMilestones: { m1: true },
    learningLog: [{ t: 10, kind: 'run', lesson: '00.1' }],
  });
  const local = base({ updatedAt: 5000, resetAt: 5000 });
  const merged = mergeProgress(local, remote);
  assert.deepEqual(merged.verifiedLessons, {}, 'an erased lesson must not come back');
  assert.deepEqual(merged.completedMilestones, {});
  assert.deepEqual(merged.learningLog, [], 'the log was erased too');
  assert.equal(merged.resetAt, 5000);
});

check('a reset older than the other side\'s change cannot erase newer work', () => {
  const local = base({ updatedAt: 4000, resetAt: 4000 });
  const remote = base({
    updatedAt: 6000,
    verifiedLessons: { '00.2': true },
    learningLog: [{ t: 60, kind: 'run', lesson: '00.2' }],
  });
  const merged = mergeProgress(local, remote);
  assert.equal(merged.verifiedLessons['00.2'], true, 'work done after the reset survives it');
  assert.equal(merged.learningLog.length, 1);
});

check('the watermark survives a merge in either direction', () => {
  const older = base({ updatedAt: 1000 });
  const reset = base({ updatedAt: 2000, resetAt: 2000 });
  assert.equal(mergeProgress(reset, older).resetAt, 2000);
  assert.equal(mergeProgress(older, reset).resetAt, 2000);
});

check('resetAt 0 is an ordinary snapshot, not a reset', () => {
  const local = base({ updatedAt: 2000, resetAt: 0 });
  const remote = base({ updatedAt: 1000, verifiedLessons: { '00.1': true } });
  assert.equal(mergeProgress(local, remote).verifiedLessons['00.1'], true);
});

console.log('the study clock');

check("the clock that ticked last wins, whichever side it came from", () => {
  const lapstop = { bankedMs: 60000, runningSince: 500, lastTick: 600, lesson: 'P.1', log: [] };
  const phone = { bankedMs: 120000, runningSince: null, lastTick: 900, lesson: 'P.2', log: [] };
  const T = 5_000;
  const cleared = { bankedMs: 0, runningSince: null, lastTick: T, lesson: 'P.1', completed: ['P.2'], log: [] };
  const staleRunning = {
    bankedMs: 0,
    runningSince: 1_000,
    lastTick: T + 20_000,
    lesson: 'P.1',
    completed: [],
    log: [{ action: 'start', at: 1_000, clockMs: 0, stretchMs: null }],
  };
  // The upload that lands after a reset with a later heartbeat: same stretch, still running from
  // before the clear. It must not undo the zero or drop the completed bank.
  const afterReset = mergeProgress(base({ studyTimer: cleared }), base({ updatedAt: 2_000, studyTimer: staleRunning }));
  assert.deepEqual(afterReset.studyTimer, cleared, 'a later heartbeat of the pre-reset stretch cannot restore the clock');
  assert.deepEqual(afterReset.studyTimer.completed, ['P.2']);
  // A stretch begun after the reset is new work on another device and wins.
  const fresh = { ...staleRunning, runningSince: T + 1_000, lastTick: T + 30_000 };
  assert.deepEqual(mergeProgress(base({ studyTimer: cleared }), base({ updatedAt: 6_000, studyTimer: fresh })).studyTimer, fresh);

  const merged = mergeProgress(base({ updatedAt: 2000, studyTimer: lapstop }), base({ studyTimer: phone }));
  assert.equal(merged.studyTimer, phone);
  const other = mergeProgress(base({ studyTimer: phone }), base({ updatedAt: 2000, studyTimer: lapstop }));
  assert.equal(other.studyTimer, phone);
});

check('a clock on one side is carried, and none on both is undefined', () => {
  const only = { bankedMs: 0, runningSince: 42, lastTick: 42, lesson: '', log: [] };
  assert.equal(mergeProgress(base({ studyTimer: only }), base()).studyTimer, only);
  assert.equal(mergeProgress(base(), base({ studyTimer: only })).studyTimer, only);
  assert.equal(mergeProgress(base(), base()).studyTimer, undefined);
});

check('a reset does not stop the sitting', () => {
  const timer = { bankedMs: 0, runningSince: 42, lastTick: 42, lesson: '', log: [] };
  const local = base({ updatedAt: 1000, resetAt: 900, studyTimer: timer });
  const remote = base({ updatedAt: 500 });
  assert.deepEqual(mergeProgress(local, remote).studyTimer, timer);
});

check('a snapshot carrying a clock is still accepted, and garbage in the field is not fatal', () => {
  assert.equal(
    isProgressSnapshot(
      base({ studyTimer: { bankedMs: 0, runningSince: null, lastTick: 1, lesson: '', log: [] } })
    ),
    true
  );
  // Old rows simply have no clock; a clock is never required for the row to be readable.
  assert.equal(isProgressSnapshot(base()), true);
  assert.equal(isProgressSnapshot(base({ studyTimer: 'nope' })), false);
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

console.log('the 4.0.0 renumber (P.15 -> P.14, P.14 -> P.13)');

check('the renumber map moves every old id down one lesson, in one pass', () => {
  assert.deepEqual(renameLessonMap({ 'P.14': 'datasheet', 'P.15': 'workflow' }), {
    'P.13': 'datasheet',
    'P.14': 'workflow',
  });
  // A current id is not "old P.14": only the ids that shipped before the renumber move.
  assert.equal(canonicalLessonId('P.13'), 'P.13');
  assert.equal(canonicalLessonId('P.14'), 'P.13');
  assert.equal(canonicalLessonId('P.15'), 'P.14');
  assert.deepEqual(renameLessonMap({ 'P.1': true }), { 'P.1': true });
});

check('a cloud snapshot saved before the renumber is read as the new ids', () => {
  const old = base({
    verifiedLessons: { 'P.14': true },
    completedLessons: { 'P.15': true },
    learningLog: [{ t: 1, kind: 'run', lesson: 'P.14', outcome: 'verified' }],
  });
  const merged = mergeProgress(base({ updatedAt: 2000 }), old);
  assert.equal(merged.verifiedLessons['P.13'], true);
  assert.equal(merged.verifiedLessons['P.14'], undefined);
  assert.equal(merged.completedLessons['P.14'], true);
  assert.equal(merged.completedLessons['P.15'], undefined);
  assert.equal(merged.learningLog[0].lesson, 'P.13');
  // Both old flags map to ids that exist, so nothing is left pointing at a lesson the runner lacks.
  assert.equal(Object.keys(merged.completedLessons).includes('P.15'), false);
});

check('the browser migration rewrites a store once, then never shifts it again', () => {
  const store = new MemoryStorage();
  store.setItem('mechalab_pyodide_verified_v1', JSON.stringify({ 'P.14': true, 'P.15': true, 'P.1': true }));
  store.setItem('mechalab_drafts_v1', JSON.stringify({ 'P.15': 'print(1)' }));
  store.setItem('mechalab_last_lesson_v1', JSON.stringify('P.15'));
  store.setItem('mechalab_theme_v1', JSON.stringify('dark'));
  assert.equal(migrateRenamedLessonIds([store]), true);
  assert.deepEqual(JSON.parse(store.getItem('mechalab_pyodide_verified_v1')), {
    'P.1': true,
    'P.13': true,
    'P.14': true,
  });
  assert.deepEqual(JSON.parse(store.getItem('mechalab_drafts_v1')), { 'P.14': 'print(1)' });
  assert.equal(JSON.parse(store.getItem('mechalab_last_lesson_v1')), 'P.14');
  assert.equal(JSON.parse(store.getItem('mechalab_theme_v1')), 'dark');
  assert.equal(store.getItem(RENAMES_MARKER_KEY), RENAMES_MARKER_VALUE);
  // A second boot must not move the same ids again (P.14 would slide to P.13).
  assert.equal(migrateRenamedLessonIds([store]), false);
  assert.deepEqual(JSON.parse(store.getItem('mechalab_drafts_v1')), { 'P.14': 'print(1)' });
});

check('a record that already names P.13 is left alone, not moved twice', () => {
  const store = new MemoryStorage();
  store.setItem('mechalab_pyodide_verified_v1', JSON.stringify({ 'P.13': true, 'P.14': true }));
  migrateRenamedLessonIds([store]);
  assert.deepEqual(JSON.parse(store.getItem('mechalab_pyodide_verified_v1')), {
    'P.13': true,
    'P.14': true,
  });
  const current = base({ verifiedLessons: { 'P.13': true, 'P.14': true } });
  assert.deepEqual(withCurrentLessonIds(current).verifiedLessons, { 'P.13': true, 'P.14': true });
});

check('a prose draft that mentions a lesson id is text, not a key', () => {
  const store = new MemoryStorage();
  store.setItem('mechalab_drafts_v1', JSON.stringify({ 'P.14': 'print("Lesson P.15 says hi")' }));
  migrateRenamedLessonIds([store]);
  assert.deepEqual(JSON.parse(store.getItem('mechalab_drafts_v1')), {
    'P.13': 'print("Lesson P.15 says hi")',
  });
});

console.log(`\n${failed === 0 ? 'OK' : 'FAILED'}: ${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
